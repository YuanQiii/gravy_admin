## Purpose

提供 B2C 客户域的数据模型与行为契约：管理终端消费者（含微信 openid/unionid 登录标识）、收货地址、滤清器收藏与浏览历史，与后台管理员 `User`（RBAC 员工）明确分离，避免管理员权限模型污染 B2C 自助行为。

## ADDED Requirements

### Requirement: 客户模型与管理员分离

系统 SHALL 将 B2C 消费者建模为独立的 `Customer` 实体，不复用现有管理员 `User` 模型。`Customer` 字段包含：`customerId` (UUID 业务 ID)、`username`（唯一）、`password`、`email`（唯一）、`phoneNumber`（唯一）、`nickName`、`avatar`、`status`（默认 `"enabled"`，值：enabled/disabled）、`openid`（微信，唯一，可空）、`unionid`（微信，唯一，可空）。`Customer` 不携带 `createdById`/`updatedById` 审计字段（B2C 自助注册/微信登录无操作管理员）。

#### Scenario: 客户注册

- **WHEN** 消费者提交 `username`/`password`/`email` 注册
- **THEN** 系统创建 `Customer`，`status = "enabled"`，返回 `customerId`；密码经哈希后存储，明文不落库

#### Scenario: 微信登录创建客户

- **WHEN** 微信回调携带 `openid`/`unionid`，系统未找到对应 `Customer`
- **THEN** 系统自动创建 `Customer`，`openid`/`unionid` 写入，`username` 自动生成（如 `wx_{openid前8位}`），`password` 随机

#### Scenario: 客户与管理员查询隔离

- **WHEN** 后台管理员查询客户列表
- **THEN** 系统仅返回 `Customer` 表记录，不返回 `User` 表；响应不含 `password`、`id`（自增）、`openid`/`unionid` 全量明文（脱敏为前 4 后 4）

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

系统 SHALL 提供 `CustomerFavorite` 的接口（仅创建/删除/列表，无更新），字段包含：`customerId`、`filterId`、`createdAt`。`(customerId, filterId)` SHALL 唯一。收藏随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerFavorite` 为事件型记录，无 `updatedAt`、无软删除。

#### Scenario: 重复收藏幂等

- **WHEN** 客户重复收藏已收藏的滤清器
- **THEN** 系统检测 `(customerId, filterId)` 已存在，返回 200（幂等），不重复插入

#### Scenario: 取消收藏

- **WHEN** 客户取消收藏
- **THEN** 系统硬删对应 `CustomerFavorite` 记录，返回 204

### Requirement: 浏览历史管理

系统 SHALL 自动记录客户浏览滤清器详情的行为到 `CustomerHistory`，字段包含：`customerId`、`filterId`、`visitedAt`。`(customerId, filterId)` SHALL 唯一——重复浏览同一滤清器 SHALL 更新 `visitedAt`（upsert 语义）而非插入新记录。浏览历史随客户或滤清器硬删而级联删除（`onDelete: Cascade`）。`CustomerHistory` 为事件型记录，无 `updatedAt`、无软删除。

#### Scenario: 首次浏览记录

- **WHEN** 客户首次浏览滤清器 F
- **THEN** 系统插入 `CustomerHistory`，`visitedAt = now()`

#### Scenario: 重复浏览更新时间

- **WHEN** 客户再次浏览已浏览过的滤清器 F
- **THEN** 系统更新 `(customerId, filterId)` 对应记录的 `visitedAt = now()`，不新增记录

#### Scenario: 查询浏览历史分页

- **WHEN** 客户查询自己的浏览历史
- **THEN** 系统返回按 `visitedAt` 降序的历史记录，分页结构为 `{ items, total, page, pageSize }`，每条记录含滤清器快照（model/gencode/typeName）
