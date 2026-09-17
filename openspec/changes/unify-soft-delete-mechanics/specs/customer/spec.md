## MODIFIED Requirements

### Requirement: 客户自助管理收货地址

系统 SHALL 在 Mall 应用上提供 B2C 客户自助管理收货地址的端点，由 `CustomerJwtGuard` 保护，当前客户身份 SHALL 取自登录态（`@CurrentCustomer()`），请求 SHALL 不携带显式 `customerId`：

- `GET /addresses`：本人收货地址列表
- `POST /addresses`：新增收货地址（`receiver`/`phone`/`province`/`city`/`district`/`detailAddress`/`zipCode`/`isDefault`）
- `PATCH /addresses/:id`：更新本人收货地址
- `DELETE /addresses/:id`：删除本人收货地址

系统 SHALL 仅允许客户操作本人名下地址，访问他人地址 SHALL 返回 404。`isDefault` 全局唯一约束 SHALL 在每个 `customerId` 内生效：设置某地址为默认时，系统 SHALL 在事务内将同客户其他地址的 `isDefault` 置 false。`CustomerAddress` SHALL 采用**硬删**语义：删除即物理移除行，不保留 `deletedAt` 软删列；读路径（`GET /addresses` 列表、`GET/PATCH/DELETE` 单条校验）SHALL NOT 以 `deletedAt` 过滤或作为地址存在性/归属校验的依据（归属校验仅基于 `customerId` 与记录存在性）。删除当前默认地址后 `isDefault` 不自动迁移。客户自助地址数据与后台地址管理共享同一 `CustomerAddress` 存储，Admin 应用 `customer/addresses` 管理端点行为保持不变（亦为硬删、无 `deletedAt`）。未登录或令牌无效 SHALL 返回 401。

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
