## MODIFIED Requirements

### Requirement: 浏览历史管理

系统 SHALL 提供浏览历史管理能力：写路径由滤清器详情浏览流程触发，查询/删除为 B2C 自助语义。写路径：当已登录客户访问滤清器详情页时，系统 SHALL 调用 `recordView(customerId, filterId)`（`(customerId, filterId)` 唯一；重复浏览 SHALL 更新 `visitedAt`，upsert 语义）；匿名访客浏览详情 SHALL 不写入任何历史。查询/删除：当前客户 SHALL 由登录态（`CustomerJwtGuard` + `@CurrentCustomer()`）恢复，请求 SHALL 不携带显式 `customerId` 参数；未登录或令牌无效 SHALL 返回 401。字段包含：`customerId`、`filterId`、`visitedAt`。快照字段集与收藏对齐：`filter` 投影 `model/gencode/typeName/photoUuid` 并派生 `filterAvailable`（`status === 'enabled'` 且未软删）；已失效/已软删滤清器的历史仍按其最后快照返回、仅以 `filterAvailable` 置灰，不静默丢失。每客户历史保留**上限 100 条**（`HISTORY_LIMIT`），`recordView` 在写入事务内淘汰超出部分的**最旧记录**（按 `visitedAt desc` 跳过前 100 后 `deleteMany`）。单条删除为硬删；另提供「清空本人全部历史」的 `DELETE`。历史随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerHistory` 为事件型记录，无 `updatedAt`、无软删除。

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
