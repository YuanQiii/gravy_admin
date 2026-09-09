## MODIFIED Requirements

### Requirement: 收藏管理

系统 SHALL 提供 `CustomerFavorite` 的接口（仅创建/删除/列表，无更新），字段包含：`customerId`、`filterId`、`createdAt`。`(customerId, filterId)` SHALL 唯一。收藏随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerFavorite` 为事件型记录，无 `updatedAt`、无软删除。接口为 B2C 自助语义：当前客户 SHALL 由登录态（`CustomerJwtGuard` + `@CurrentCustomer()`）恢复，请求 SHALL 不携带显式 `customerId` 参数；未登录或令牌无效 SHALL 返回 401。

#### Scenario: 重复收藏幂等

- **WHEN** 已登录客户重复收藏已收藏的滤清器
- **THEN** 系统检测 `(customerId, filterId)` 已存在，返回 200（幂等），以登录态客户为当前客户，不重复插入且不创建他人收藏

#### Scenario: 取消收藏

- **WHEN** 已登录客户取消收藏
- **THEN** 系统硬删对应 `CustomerFavorite` 记录（仅限当前客户的记录），返回 204

#### Scenario: 未登录调用收藏接口

- **WHEN** 请求未携带客户 access token（或令牌无效）调用收藏接口
- **THEN** 系统返回 401，不执行任何收藏操作

### Requirement: 浏览历史管理

系统 SHALL 提供浏览历史写入原语 `recordView(customerId, filterId)`（`(customerId, filterId)` 唯一；重复浏览 SHALL 更新 `visitedAt`，upsert 语义）供商城详情页流程调用；本 change 范围不含商城详情页的浏览触发接线，故"首次浏览记录/重复浏览更新时间"两场景由商城详情页接线后生效（`recordView` 已实现并可供调用）。字段包含：`customerId`、`filterId`、`visitedAt`。历史随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerHistory` 为事件型记录，无 `updatedAt`、无软删除。历史查询/删除接口为 B2C 自助语义：当前客户 SHALL 由登录态（`CustomerJwtGuard` + `@CurrentCustomer()`）恢复，请求 SHALL 不携带显式 `customerId` 参数；未登录或令牌无效 SHALL 返回 401。

#### Scenario: 首次浏览记录

- **WHEN** 已登录客户首次浏览滤清器 F
- **THEN** 系统插入 `CustomerHistory`，`customerId` 取自登录态，`visitedAt = now()`

#### Scenario: 重复浏览更新时间

- **WHEN** 已登录客户再次浏览已浏览过的滤清器 F
- **THEN** 系统更新 `(customerId, filterId)` 对应记录的 `visitedAt = now()`，不新增记录，`customerId` 取自登录态

#### Scenario: 查询浏览历史分页

- **WHEN** 已登录客户查询自己的浏览历史
- **THEN** 系统仅以登录态 `customerId` 为依据，返回按 `visitedAt` 降序的历史记录，分页结构为 `{ items, total, page, pageSize }`，每条记录含滤清器快照（model/gencode/typeName），不返回其他客户的历史

#### Scenario: 未登录调用历史接口

- **WHEN** 请求未携带客户 access token（或令牌无效）调用浏览历史接口
- **THEN** 系统返回 401，不返回任何历史记录