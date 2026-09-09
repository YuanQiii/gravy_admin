## ADDED Requirements

### Requirement: 客户自助管理收货地址

系统 SHALL 提供 B2C 客户自助管理收货地址的端点，由 `CustomerJwtGuard` 保护，当前客户身份 SHALL 取自登录态（`@CurrentCustomer()`），请求 SHALL 不携带显式 `customerId`：

- `GET /b2c/addresses`：本人收货地址列表
- `POST /b2c/addresses`：新增收货地址（`receiver`/`phone`/`province`/`city`/`district`/`detailAddress`/`zipCode`/`isDefault`）
- `PATCH /b2c/addresses/:id`：更新本人收货地址
- `DELETE /b2c/addresses/:id`：删除本人收货地址

系统 SHALL 仅允许客户操作本人名下地址，访问他人地址 SHALL 返回 404。`isDefault` 全局唯一约束 SHALL 在每个 `customerId` 内生效：设置某地址为默认时，系统 SHALL 在事务内将同客户其他地址的 `isDefault` 置 false。删除当前默认地址后 `isDefault` 不自动迁移。客户自助地址数据与后台地址管理共享同一 `CustomerAddress` 存储，后台 `customer/addresses` 管理端点行为保持不变。未登录或令牌无效 SHALL 返回 401。

#### Scenario: 客户新增默认地址

- **WHEN** 已登录客户请求 `POST /b2c/addresses`，`isDefault = true`
- **THEN** 系统在事务内将同客户其他地址 `isDefault` 置 false，再创建新地址并置 `isDefault = true`，返回 `addressId`

#### Scenario: 客户更新他人地址被拒

- **WHEN** 已登录客户请求 `PATCH /b2c/addresses/:id`，`:id` 属于其他客户
- **THEN** 系统返回 404，不泄露任何地址信息

#### Scenario: 客户删除默认地址

- **WHEN** 已登录客户请求 `DELETE /b2c/addresses/:id` 删除当前默认地址
- **THEN** 系统硬删该地址，`isDefault` 状态不自动迁移；若仍有其他地址，需客户手动设置默认

#### Scenario: 未登录调用地址接口

- **WHEN** 请求未携带客户 access token 调用任一 `/b2c/addresses` 端点
- **THEN** 系统返回 401，不执行任何地址操作

#### Scenario: 请求体携带 customerId 被拒

- **WHEN** 已登录客户在 `POST /b2c/addresses` 请求体中携带 `customerId` 字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不创建地址，`customerId` 无法由客户端指定（身份仅来自登录态）

### Requirement: 客户自助地址用于询价

系统 SHALL 允许客户在提交询价单时引用本人收货地址：`POST /b2c/inquiries` 接受 `shippingAddressId`，系统 SHALL 校验该地址属于当前客户后写入询价单，否则拒绝。

#### Scenario: 询价单关联默认地址

- **WHEN** 已登录客户提交询价单并携带本人 `shippingAddressId`
- **THEN** 系统写入该地址引用，询价单详情返回地址快照字段

#### Scenario: 询价单引用他人地址被拒

- **WHEN** 已登录客户提交询价单并携带他人 `shippingAddressId`
- **THEN** 系统拒绝该请求（400），不创建询价单
