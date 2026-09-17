## MODIFIED Requirements

### Requirement: 客户自助管理收货地址

系统 SHALL 在 Mall 应用上提供 B2C 客户自助管理收货地址的端点，由 `CustomerJwtGuard` 保护，当前客户身份 SHALL 取自登录态（`@CurrentCustomer()`），请求 SHALL 不携带显式 `customerId`：

- `GET /addresses`：本人收货地址列表
- `POST /addresses`：新增收货地址（`receiver`/`phone`/`province`/`city`/`district`/`detailAddress`/`zipCode`/`isDefault`）
- `PATCH /addresses/:id`：更新本人收货地址
- `DELETE /addresses/:id`：删除本人收货地址

系统 SHALL 仅允许客户操作本人名下地址，访问他人地址 SHALL 返回 404。`isDefault` 全局唯一约束 SHALL 在每个 `customerId` 内生效：设置某地址为默认时，系统 SHALL 在事务内将同客户其他地址的 `isDefault` 置 false。删除当前默认地址后 `isDefault` 不自动迁移。客户自助地址数据与后台地址管理共享同一 `CustomerAddress` 存储，Admin 应用 `customer/addresses` 管理端点行为保持不变。未登录或令牌无效 SHALL 返回 401。本人收货地址列表（`GET /addresses`）的查询参数 SHALL 仅含分页/排序字段（继承自 `PaginationSortDto`），SHALL NOT 声明或接受 `customerId` / `receiver` / `phone` 等身份或内容筛选字段；携带这些字段的请求 SHALL 被全局 `ValidationPipe`（`forbidNonWhitelisted: true`）以 400 拒绝，`customerId` 仅来自登录态。

#### Scenario: 客户新增默认地址

- **WHEN** 已登录客户请求 `POST /addresses`，`isDefault = true`
- **THEN** 系统在事务内将同客户其他地址 `isDefault` 置 false，再创建新地址并置 `isDefault = true`，返回 `addressId`

#### Scenario: 客户更新他人地址被拒

- **WHEN** 已登录客户请求 `PATCH /addresses/:id`，`:id` 属于其他客户
- **THEN** 系统返回 404，不泄露任何地址信息

#### Scenario: 客户删除默认地址

- **WHEN** 已登录客户请求 `DELETE /addresses/:id` 删除当前默认地址
- **THEN** 系统硬删该地址，`isDefault` 状态不自动迁移；若仍有其他地址，需客户手动设置默认

#### Scenario: 未登录调用地址接口

- **WHEN** 请求未携带客户 access token 调用任一 `/addresses` 端点
- **THEN** 系统返回 401，不执行任何地址操作

#### Scenario: 请求体携带 customerId 被拒

- **WHEN** 已登录客户在 `POST /addresses` 请求体中携带 `customerId` 字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不创建地址，`customerId` 无法由客户端指定（身份仅来自登录态）

#### Scenario: 列表查询携带未声明字段被拒

- **WHEN** 已登录客户在 `GET /addresses` 查询串中携带 `customerId` / `receiver` / `phone` 中任一字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不执行查询；地址列表查询不接受任何内容或身份筛选参数，`customerId` 仅来自登录态

### Requirement: 收藏管理

系统 SHALL 提供 `CustomerFavorite` 的接口（仅创建/删除/列表，无更新），字段包含：`customerId`、`filterId`、`createdAt`。`(customerId, filterId)` SHALL 唯一。收藏随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerFavorite` 为事件型记录，无 `updatedAt`、无软删除。接口为 B2C 自助语义：当前客户 SHALL 由登录态（`CustomerJwtGuard` + `@CurrentCustomer()`）恢复，请求 SHALL 不携带显式 `customerId` 参数；未登录或令牌无效 SHALL 返回 401。创建收藏前，系统 SHALL 校验 `filterId` 对应滤清器存在、`status = 'enabled'` 且未软删除（`deletedAt IS NULL`）；不满足 SHALL 拒绝该请求并返回 400（`FILTER_NOT_AVAILABLE`），不创建收藏。收藏列表（`GET /favorites`）SHALL 投影滤清器当前字段（对齐浏览历史快照 `model/gencode/typeName`）并**派生** `filterAvailable: boolean`（与收藏校验同一判定源），供前端识别失效收藏；已失效滤清器的收藏记录仍返回其最后快照，不静默丢失、不按 `deletedAt`/`status` 过滤。收藏列表（`GET /favorites`）的查询参数 SHALL 仅声明可选的 `filterId`，SHALL NOT 声明 `customerId`；携带 `customerId` 或任意未声明字段的请求 SHALL 以 400（`forbidNonWhitelisted`）被拒。`filterId` 为唯一被服务端消费的查询筛选条件，用于按滤清器过滤当前客户收藏，`customerId` 仅来自登录态。

#### Scenario: 重复收藏幂等

- **WHEN** 已登录客户重复收藏已收藏的有效滤清器（含并发重复提交两个请求）
- **THEN** 系统检测 `(customerId, filterId)` 已存在，返回 200（幂等），以登录态客户为当前客户，不重复插入且不创建他人收藏；并发下任一请求撞唯一约束也回查既存并返回，不报 500

#### Scenario: 收藏列表投影与失效标记

- **WHEN** 已登录客户查询自己的收藏列表
- **THEN** 系统仅以登录态 `customerId` 为依据，返回按收藏时间降序的分页收藏，每条含滤清器当前快照（与浏览历史相同的 `model/gencode/typeName` 字段）与派生 `filterAvailable: boolean`（有效收藏为 `true`，`status='disabled'`/已软删/不存在为 `false`）；不返回其他客户的收藏，不因滤清器失效而丢弃该收藏记录

#### Scenario: 收藏已停用滤清器被拒

- **WHEN** 已登录客户请求收藏一个 `status = 'disabled'` 或已软删除的滤清器
- **THEN** 系统返回 400（`FILTER_NOT_AVAILABLE`），不创建收藏

#### Scenario: 收藏不存在的滤清器被拒

- **WHEN** 已登录客户请求收藏一个系统中不存在的 `filterId`
- **THEN** 系统返回 400（`FILTER_NOT_AVAILABLE`），不创建收藏

#### Scenario: 取消收藏

- **WHEN** 已登录客户通过 `DELETE /favorites/:favoriteId` 取消收藏
- **THEN** 系统硬删对应当前客户名下、`favoriteId` 匹配的 `CustomerFavorite` 记录；该收藏不属于当前客户或不存在 SHALL 返回 404。不提供按 `filterId` 的取消收藏入口

#### Scenario: 未登录调用收藏接口

- **WHEN** 请求未携带客户 access token（或令牌无效）调用收藏接口
- **THEN** 系统返回 401，不执行任何收藏操作

#### Scenario: 收藏列表查询仅接受 filterId

- **WHEN** 已登录客户查询 `GET /favorites`，查询串仅含可选 `filterId` 或不含任何筛选字段
- **THEN** 系统以登录态 `customerId` 为依据，按 `filterId`（若提供）过滤并返回分页收藏；不返回其他客户收藏，`filterId` 为唯一生效的内容筛选

#### Scenario: 收藏列表查询携带 customerId 被拒

- **WHEN** 已登录客户在 `GET /favorites` 查询串中携带 `customerId` 或任意未声明字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不执行查询；客户身份不可由查询参数指定

### Requirement: 浏览历史管理

系统 SHALL 提供浏览历史管理能力：写路径由滤清器详情浏览流程触发，查询/删除为 B2C 自助语义。写路径：当已登录客户访问滤清器详情页时，系统 SHALL 调用 `recordView(customerId, filterId)`（`(customerId, filterId)` 唯一；重复浏览 SHALL 更新 `visitedAt`，upsert 语义）；匿名访客浏览详情 SHALL 不写入任何历史。查询/删除：当前客户 SHALL 由登录态（`CustomerJwtGuard` + `@CurrentCustomer()`）恢复，请求 SHALL 不携带显式 `customerId` 参数；未登录或令牌无效 SHALL 返回 401。字段包含：`customerId`、`filterId`、`visitedAt`。快照字段集与收藏对齐：`filter` 投影 `model/gencode/typeName/photoUuid` 并派生 `filterAvailable`（`status === 'enabled'` 且未软删）；已失效/已软删滤清器的历史仍按其最后快照返回、仅以 `filterAvailable` 置灰，不静默丢失。每客户历史保留**上限 100 条**（`HISTORY_LIMIT`），`recordView` 在写入事务内淘汰超出部分的**最旧记录**（按 `visitedAt desc` 跳过前 100 后 `deleteMany`）。单条删除为硬删；另提供「清空本人全部历史」的 `DELETE`。历史随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerHistory` 为事件型记录，无 `updatedAt`、无软删除。浏览历史列表（`GET /history`）的查询参数 SHALL 仅声明可选的 `filterId`，SHALL NOT 声明 `customerId`；携带 `customerId` 或任意未声明字段的请求 SHALL 以 400（`forbidNonWhitelisted`）被拒。`filterId` 为唯一被服务端消费的查询筛选条件，`customerId` 仅来自登录态。

#### Scenario: 已登录客户浏览详情写入历史

- **WHEN** 已登录客户访问有效滤清器 F 的详情页
- **THEN** 系统调用 `recordView(customer.customerId, F.filterId)`，首次浏览插入 `CustomerHistory`、`visitedAt = now()`，重复浏览更新 `visitedAt = now()`，`customerId` 取自登录态

#### Scenario: 首次浏览记录

- **WHEN** 已登录客户首次浏览滤清器 F
- **THEN** 系统插入 `CustomerHistory`，`customerId` 取自登录态，`visitedAt = now()`

#### Scenario: 重复浏览更新时间

- **WHEN** 已登录客户再次浏览已浏览过的滤清器 F
- **THEN** 系统更新 `(customerId, filterId)` 对应记录的 `visitedAt = now()`，不新增记录，`customerId` 取自登录态

#### Scenario: 匿名访客浏览详情不写历史

- **WHEN** 匿名访客（无有效客户 access token）访问滤清器 F 的详情页
- **THEN** 系统返回与现状一致的浏览响应，且不写入任何 `CustomerHistory` 记录

#### Scenario: 查询浏览历史分页

- **WHEN** 已登录客户查询自己的浏览历史
- **THEN** 系统仅以登录态 `customerId` 为依据，返回按 `visitedAt` 降序的历史记录，分页结构为 `{ items, total, page, pageSize }`，每条记录含滤清器快照（`model/gencode/typeName/photoUuid`）与派生 `filterAvailable`，不返回其他客户的历史；已失效滤清器的历史记录仍返回其最后快照

#### Scenario: 历史超过保留上限淘汰最旧

- **WHEN** 已登录客户新增一条浏览记录，使该客户历史条数超过上限 100
- **THEN** 系统在写入该记录的同一事务内，按 `visitedAt desc` 淘汰该客户第 101 条起的最旧记录，保证每客户历史条数 ≤ 100

#### Scenario: 清空浏览历史

- **WHEN** 已登录客户调用清空本人历史的接口
- **THEN** 系统删除该客户全部历史记录，返回 `{ deleted: count }`；空历史返回 `{ deleted: 0 }`，不抛 404

#### Scenario: 未登录调用历史接口

- **WHEN** 请求未携带客户 access token（或令牌无效）调用浏览历史接口
- **THEN** 系统返回 401，不返回任何历史记录

#### Scenario: 历史列表查询仅接受 filterId

- **WHEN** 已登录客户查询 `GET /history`，查询串仅含可选 `filterId` 或不含任何筛选字段
- **THEN** 系统以登录态 `customerId` 为依据，按 `filterId`（若提供）过滤并返回按 `visitedAt` 降序的分页历史；不返回其他客户历史，`filterId` 为唯一生效的内容筛选

#### Scenario: 历史列表查询携带 customerId 被拒

- **WHEN** 已登录客户在 `GET /history` 查询串中携带 `customerId` 或任意未声明字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不执行查询；客户身份不可由查询参数指定
