## Purpose

提供 B2C 客户域的数据模型与行为契约：管理终端消费者（含微信 openid/unionid 登录标识）、收货地址、滤清器收藏与浏览历史，与后台管理员 `User`（RBAC 员工）明确分离，避免管理员权限模型污染 B2C 自助行为。

## Requirements

### Requirement: 客户唯一约束与软删除

`username`/`email`/`phoneNumber`/`openid`/`unionid` SHALL 在数据库层面全局唯一（含软删除记录）。Service 层 SHALL 在创建/恢复前校验"未软删除记录中无同名"，软删除记录 SHALL 不阻塞新建同名实体（数据库唯一约束会冲突时返回错误码 `CUSTOMER_*_DUPLICATED_SOFT_DELETED`，提示恢复或换名）。所有 `Customer` 记录 SHALL 支持 `deletedAt` 软删除。

#### Scenario: 软删除后重建同名客户

- **WHEN** 用户名 "alice" 已软删除，再次注册 "alice"
- **THEN** Service 校验通过，但数据库唯一约束冲突，返回 409 Conflict `CUSTOMER_USERNAME_DUPLICATED_SOFT_DELETED`，提示恢复或换名

### Requirement: 收货地址管理

系统 SHALL 提供 `CustomerAddress` 的 CRUD 接口，字段包含：`customerId`（引用 Customer）、`receiver`、`phone`、`province`、`city`、`district`（可空）、`detailAddress`、`zipCode`、`isDefault`。地址随客户硬删而级联删除（`onDelete: Cascade`）。`isDefault` 全局唯一约束：每个 `customerId` 至多一条 `isDefault = true`，由 Service 层在事务内切换。

#### Scenario: 设置默认地址

- **WHEN** 客户将地址 A 设为默认
- **THEN** 系统在事务内将同 `customerId` 其他地址的 `isDefault` 置 false，再将 A 置 true

#### Scenario: 删除默认地址

- **WHEN** 客户删除当前默认地址 A
- **THEN** 系统硬删 A，`isDefault` 状态不自动迁移；若仍有其他地址，需客户手动设置默认

### Requirement: 收藏管理

系统 SHALL 提供 `CustomerFavorite` 的接口（仅创建/删除/列表，无更新），字段包含：`customerId`、`filterId`、`createdAt`。`(customerId, filterId)` SHALL 唯一。收藏随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerFavorite` 为事件型记录，无 `updatedAt`、无软删除。接口为 B2C 自助语义：当前客户 SHALL 由登录态（`CustomerJwtGuard` + `@CurrentCustomer()`）恢复，请求 SHALL 不携带显式 `customerId` 参数；未登录或令牌无效 SHALL 返回 401。创建收藏前，系统 SHALL 校验 `filterId` 对应滤清器存在、`status = 'enabled'` 且未软删除（`deletedAt IS NULL`）；不满足 SHALL 拒绝该请求并返回 400（`FILTER_NOT_AVAILABLE`），不创建收藏。收藏列表（`GET /favorites`）SHALL 投影滤清器当前字段（对齐浏览历史快照 `model/gencode/typeName`）并**派生** `filterAvailable: boolean`（与收藏校验同一判定源），供前端识别失效收藏；已失效滤清器的收藏记录仍返回其最后快照，不静默丢失、不按 `deletedAt`/`status` 过滤。收藏列表（`GET /favorites`）的查询参数 SHALL 仅声明可选的 `filterId`，SHALL NOT 声明 `customerId`；携带 `customerId` 或任意未声明字段的请求 SHALL 以 400（`forbidNonWhitelisted`）被拒。`filterId` 为唯一被服务端消费的查询筛选条件，用于按滤清器过滤当前客户收藏，`customerId` 仅来自登录态。

#### Scenario: 重复收藏幂等

- **WHEN** 已登录客户重复收藏已收藏的有效滤清器（含并发重复提交两个请求）

- **THEN** 系统检测 `(customerId, filterId)` 已存在，返回 201（幂等，沿用 POST 默认状态码与统一响应约定），以登录态客户为当前客户，不重复插入且不创建他人收藏；并发下任一请求撞唯一约束也回查既存并返回，不报 500

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

#### Scenario: 浏览历史写为非阻塞副作用

- **WHEN** 已登录客户访问有效滤清器详情页
- **THEN** 系统 SHALL 以 fire-and-forget（非阻塞）方式触发 `recordView`，详情响应在可见性查询完成后立即返回，其延迟与状态码 SHALL NOT 受 `recordView` 的完成与否或其成败影响；写入失败 SHALL 仅记 warn 日志且不重试、不影响本次响应

#### Scenario: 历史列表查询仅接受 filterId

- **WHEN** 已登录客户查询 `GET /history`，查询串仅含可选 `filterId` 或不含任何筛选字段
- **THEN** 系统以登录态 `customerId` 为依据，按 `filterId`（若提供）过滤并返回按 `visitedAt` 降序的分页历史；不返回其他客户历史，`filterId` 为唯一生效的内容筛选

#### Scenario: 历史列表查询携带 customerId 被拒

- **WHEN** 已登录客户在 `GET /history` 查询串中携带 `customerId` 或任意未声明字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不执行查询；客户身份不可由查询参数指定

### Requirement: 客户自助管理收货地址

系统 SHALL 在 Mall 应用上提供 B2C 客户自助管理收货地址的端点，由 `CustomerJwtGuard` 保护，当前客户身份 SHALL 取自登录态（`@CurrentCustomer()`），请求 SHALL 不携带显式 `customerId`：

- `GET /addresses`：本人收货地址列表
- `POST /addresses`：新增收货地址（`receiver`/`phone`/`province`/`city`/`district`/`detailAddress`/`zipCode`/`isDefault`）
- `PATCH /addresses/:id`：更新本人收货地址
- `DELETE /addresses/:id`：删除本人收货地址

系统 SHALL 仅允许客户操作本人名下地址，访问他人地址 SHALL 返回 404。`isDefault` 全局唯一约束 SHALL 在每个 `customerId` 内生效：设置某地址为默认时，系统 SHALL 在事务内将同客户其他地址的 `isDefault` 置 false。`CustomerAddress` SHALL 采用**硬删**语义：删除即物理移除行，不保留 `deletedAt` 软删列；读路径（`GET /addresses` 列表、`GET/PATCH/DELETE` 单条校验）SHALL NOT 以 `deletedAt` 过滤或作为地址存在性/归属校验的依据（归属校验仅基于 `customerId` 与记录存在性）。删除当前默认地址后 `isDefault` 不自动迁移。客户自助地址数据与后台地址管理共享同一 `CustomerAddress` 存储，Admin 应用 `customer/addresses` 管理端点行为保持不变（亦为硬删、无 `deletedAt`）。未登录或令牌无效 SHALL 返回 401。本人收货地址列表（`GET /addresses`）的查询参数 SHALL 仅含分页/排序字段（继承自 `PaginationSortDto`），SHALL NOT 声明或接受 `customerId` / `receiver` / `phone` 等身份或内容筛选字段；携带这些字段的请求 SHALL 被全局 `ValidationPipe`（`forbidNonWhitelisted: true`）以 400 拒绝，`customerId` 仅来自登录态。

#### Scenario: 客户新增默认地址

- **WHEN** 已登录客户请求 `POST /addresses`，`isDefault = true`
- **THEN** 系统在事务内将同客户其他地址 `isDefault` 置 false，再创建新地址并置 `isDefault = true`，返回 `addressId`

#### Scenario: 客户更新他人地址被拒

- **WHEN** 已登录客户请求 `PATCH /addresses/:id`，`:id` 属于其他客户
- **THEN** 系统返回 404，不泄露任何地址信息

#### Scenario: 客户删除默认地址

- **WHEN** 已登录客户请求 `DELETE /addresses/:id` 删除当前默认地址
- **THEN** 系统硬删该地址，`isDefault` 状态不自动迁移；若仍有其他地址，需客户手动设置默认

#### Scenario: 地址列表不按软删过滤

- **WHEN** 已登录客户请求 `GET /addresses`
- **THEN** 系统返回该客户全部物理存在的地址，不因 `deletedAt`（该列已不存在）而遗漏或过滤任何记录

#### Scenario: 删除后二次删除返回 404

- **WHEN** 客户删除某地址后，再次请求 `DELETE /addresses/:id` 或 `PATCH /addresses/:id` 操作同一 `addressId`
- **THEN** 系统按记录不存在返回 404（归属/存在性校验仅基于 `customerId` 与记录存在性，不依赖 `deletedAt`）

#### Scenario: 未登录调用地址接口

- **WHEN** 请求未携带客户 access token 调用任一 `/addresses` 端点
- **THEN** 系统返回 401，不执行任何地址操作

#### Scenario: 请求体携带 customerId 被拒

- **WHEN** 已登录客户在 `POST /addresses` 请求体中携带 `customerId` 字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不创建地址，`customerId` 无法由客户端指定（身份仅来自登录态）

#### Scenario: 列表查询携带未声明字段被拒

- **WHEN** 已登录客户在 `GET /addresses` 查询串中携带 `customerId` / `receiver` / `phone` 中任一字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不执行查询；地址列表查询不接受任何内容或身份筛选参数，`customerId` 仅来自登录态

### Requirement: 客户自助地址用于询价

系统 SHALL 在 Mall 应用上允许客户在提交询价单时引用本人收货地址：`POST /inquiries` 接受 `shippingAddressId`，系统 SHALL 校验该地址属于当前客户后写入询价单，否则拒绝。系统 SHALL 在写入引用的同时，把该地址的可履约内容复制为询价单自身的**地址快照字段**（收货人、联系电话、省、市、区、详细地址、邮编），快照在创建时点冻结，不随后续地址的修改或删除而漂移。询价单查询响应 SHALL 返回地址快照字段，使地址被删除后该询价单的收货信息仍然完整可读。

#### Scenario: 询价单关联默认地址

- **WHEN** 已登录客户提交询价单并携带本人 `shippingAddressId`
- **THEN** 系统写入该地址引用，并把该地址的收货人/电话/省/市/区/详细地址/邮编复制进询价单快照字段，询价单查询响应返回这些快照字段

#### Scenario: 询价单引用他人地址被拒

- **WHEN** 已登录客户提交询价单并携带他人 `shippingAddressId`
- **THEN** 系统拒绝该请求（400），不创建询价单

#### Scenario: 地址删除后询价单快照仍完整

- **WHEN** 客户删除一张已被某询价单引用的收货地址，随后查询该询价单
- **THEN** 询价单的地址快照字段保持删除前的值且完整返回；`shippingAddressId` 允许为 `null`，但收货信息不丢失

#### Scenario: 地址修改不回溯已创建询价单

- **WHEN** 客户修改一张已被某询价单引用的收货地址的收货人/电话/详细地址，随后查询该询价单
- **THEN** 该询价单返回的是**创建时点**的快照值，不是修改后的地址内容

#### Scenario: 客户端不能自行指定快照

- **WHEN** 已登录客户在 `POST /inquiries` 请求体中携带任一地址快照字段（如 `shippingReceiver`）
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不接受客户端指定的快照值

### Requirement: 可信客户端 IP 与登录限流边界

系统 SHALL 通过单一可信客户端 IP 解析模块（可信代理边界）推导用于限流的客户端 IP，而非直接取请求头链 `x-forwarded-for`/`x-real-ip` 的首段。该模块 SHALL 是「谁是客户端 IP」的唯一所有者；其正确答案依赖部署拓扑，由配置项 `security.trustedProxy`（受信代理层数 / CIDR 网段 / `false`）决定，`false` 表示信任关闭、IP 取真实对端 socket 地址。当 `security.trustedProxy` 配置为受信代理时，模块 SHALL 按框架 `req.ip`（仅解析由受信代理写入的链尾段）返回 IP；未被受信代理写入的 `X-Forwarded-For` 首段 SHALL 不计入客户端 IP。客户认证端点 `POST /auth/login`、`POST /auth/wechat-login`、`POST /auth/refresh`、`POST /auth/logout`（`apps/mall/src/modules/customer-auth/customer-auth.controller.ts:33,49,68,78`）的限流 SHALL 一律以该模块返回的 IP 为计数键，预算保持 `login`/`wechat-login` 10 req/min、`refresh`/`logout` 30 req/min（ADR 0011 决策 5）。

#### Scenario: 伪造 X-Forwarded-For 不绕过登录限流

- **WHEN** 攻击者对 `POST /auth/login` 每次请求附带不同的随机 `X-Forwarded-For` 头
- **THEN** 系统按可信客户端 IP（真实来源）而非伪造头计数，同一来源在 1 分钟内第 11 次请求返回 429，限流预算未被绕过

#### Scenario: 受信代理后 IP 正确归因

- **WHEN** 请求经受信代理（`security.trustedProxy` 已配置）转发，代理按规范在 `X-Forwarded-For` 链尾追加真实客户端地址
- **THEN** 模块返回的客户端 IP 为代理写入的链尾段（真实客户端地址），而非攻击者可控的首段

#### Scenario: 无代理部署从对端 socket 取 IP

- **WHEN** 应用直接暴露、未配置受信代理（`security.trustedProxy=false`，如 `docker-compose.yml` 中 mall 直接监听 3001）
- **THEN** 模块返回请求对端 socket 地址作为客户端 IP，攻击者附加的 `X-Forwarded-For` 被忽略

#### Scenario: 限流预算按可信 IP 生效

- **WHEN** 同一可信客户端 IP 在 1 分钟内对 `login`/`wechat-login` 发起超过 10 次、或对 `refresh`/`logout` 发起超过 30 次请求
- **THEN** 系统对该 IP 返回 429，预算与 ADR 0011 决策 5 一致，且不计伪造头

### Requirement: 微信登录契约（仅 openid，unionid 待接入）

系统 SHALL 在微信小程序静默登录（`wechatLogin`）中仅消费 `code2Session` 返回的 `openid` 定位或创建 `Customer`；本期 SHALL NOT 依赖或写入 `unionid`。系统 SHALL 明确：`unionid` 归并与跨小程序账号合并均不在本期范围，其前置条件为接入微信开放平台绑定（同主体多小程序/公众号）使 `code2Session` 返回 `unionid`。后台 `customers` 模块 SHALL 继续保留 `unionid` 的手工读写入口（创建/更新时可选填并做唯一校验），与微信静默登录路径相互独立。

#### Scenario: 微信登录仅消费 openid

- **WHEN** 微信 `code2Session` 仅返回 `openid`（个人主体小程序不返回 `unionid`）
- **THEN** 系统以 `openid` 定位或创建 `Customer`，登录照常成功，不产生 `unionid` 写入或归并错误

#### Scenario: 本期不实现 unionid 归并

- **WHEN** 同一自然人通过不同途径产生多个 `Customer`
- **THEN** 系统不自动合并，各 `Customer` 的收藏与历史各自独立（与 ADR 0012 决策 2 一致）

#### Scenario: 后台手工维护 unionid

- **WHEN** 管理员在后台创建/更新 `Customer` 时填写 `unionid`
- **THEN** 系统对 `unionid` 做唯一性校验后写入，不影响微信静默登录路径

#### Scenario: unionid 归并前置条件未满足

- **WHEN** 项目未接入微信开放平台绑定、`code2Session` 不返回 `unionid`
- **THEN** 系统不触发任何 `unionid` 归并逻辑，spec 与 ADR 0012 保持一致声明"unionid 待接入"

### Requirement: 客户模型、账号来源与管理员分离

系统 SHALL 将 B2C 消费者建模为独立的 `Customer` 实体，不复用现有管理员 `User` 模型。`Customer` 字段包含：`customerId`（UUID 业务 ID）、`username`（唯一）、`password`、`email`（唯一）、`phoneNumber`（唯一）、`nickName`、`avatar`、`status`（默认 `"enabled"`，值：enabled/disabled）、`openid`（微信，唯一，可空）、`unionid`（微信，唯一，可空）。`Customer` 不携带 `createdById`/`updatedById` 审计字段。

`Customer` 账号的来源 SHALL 仅有两条：① 具备客户管理权限的后台管理员在 Admin 应用创建；② 微信静默登录时按 `openid` 未命中而由系统自动建号。Mall 应用 SHALL NOT 提供客户自助注册端点，也 SHALL NOT 提供设置或修改密码的端点；客户凭据由后台开号时设定，微信自动建号写入的密码 SHALL 为不可用于密码登录的占位值。

#### Scenario: 账号由后台创建

- **WHEN** 后台管理员在 Admin 应用提交客户 `username`/`password`/`email`
- **THEN** 系统创建 `Customer`，`status = "enabled"`，密码经哈希后存储（明文不落库），响应不含 `password` 与数据库自增 `id`

#### Scenario: 账号由微信静默登录创建

- **WHEN** 微信登录回调携带 `openid`，且系统未找到对应 `Customer`
- **THEN** 系统自动创建 `Customer`，`openid` 写入，`username` 按微信登录契约自动生成，`password` 为不可用于密码登录的占位哈希

#### Scenario: Mall 不提供自助注册

- **WHEN** 匿名请求访问 Mall 应用的注册类路径（如 `POST /auth/register`）
- **THEN** 系统返回 404，不创建任何客户账号

#### Scenario: 客户与管理员查询隔离

- **WHEN** 后台管理员查询客户列表
- **THEN** 系统仅返回 `Customer` 表记录，不返回 `User` 表；响应不含 `password`、`id`（自增）、`openid`/`unionid` 全量明文（脱敏为前 4 后 4）
