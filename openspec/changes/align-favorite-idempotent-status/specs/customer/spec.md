## MODIFIED Requirements

### Requirement: 收藏管理

系统 SHALL 提供 `CustomerFavorite` 的接口（仅创建/删除/列表，无更新），字段包含：`customerId`、`filterId`、`createdAt`。`(customerId, filterId)` SHALL 唯一。收藏随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerFavorite` 为事件型记录，无 `updatedAt`、无软删除。接口为 B2C 自助语义：当前客户 SHALL 由登录态（`CustomerJwtGuard` + `@CurrentCustomer()`）恢复，请求 SHALL 不携带显式 `customerId` 参数；未登录或令牌无效 SHALL 返回 401。创建收藏前，系统 SHALL 校验 `filterId` 对应滤清器存在、`status = 'enabled'` 且未软删除（`deletedAt IS NULL`）；不满足 SHALL 拒绝该请求并返回 400（`FILTER_NOT_AVAILABLE`），不创建收藏。收藏列表（`GET /favorites`）SHALL 投影滤清器当前字段（对齐浏览历史快照 `model/gencode/typeName`）并**派生** `filterAvailable: boolean`（与收藏校验同一判定源），供前端识别失效收藏；已失效滤清器的收藏记录仍返回其最后快照，不静默丢失、不按 `deletedAt`/`status` 过滤。

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

## ADDED Requirements

（无）

## REMOVED Requirements

（无）
