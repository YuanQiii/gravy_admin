## ADDED Requirements

### Requirement: 客户自助创建询价单

系统 SHALL 提供 B2C 客户自助创建询价单的端点 `POST /b2c/inquiries`，由 `CustomerJwtGuard` 保护，当前客户身份 SHALL 取自登录态（`@CurrentCustomer()`），请求 SHALL 不携带显式 `customerId`（请求体含 `customerId`/`customerName`/`customerEmail`/`customerPhone` 等后台快照字段 SHALL 被 `forbidNonWhitelisted` 拒绝，返回 400）。端点接受询价标题、描述与明细行列表；明细行 SHALL 支持引用滤清器 `filterId`（可选）或直接提供 `productName`，并携带 `quantity`/`remarks`；明细行的 `model`/`typeName`（及 `filterId` 提供的 `productName`）SHALL 由系统从 Filter 记录快照填充，不接受客户端传入。客户姓名/邮箱/电话快照 SHALL 由系统从登录客户记录自动填充。创建成功后系统 SHALL 生成唯一 `inquiryNo`，`status` 为 `"draft"`，`customerId` 取登录态客户，`createdById` 为空，并可从登录客户已保存的收货地址中选择 `shippingAddressId`（可选）。未登录或令牌无效 SHALL 返回 401。

#### Scenario: 已注册客户提交询价单

- **WHEN** 已登录客户请求 `POST /b2c/inquiries`，提交标题与含 `filterId` 的明细行
- **THEN** 系统创建询价单，`customerId` 为登录态客户，`createdById` 为空，`status` 为 `"draft"`，返回 `inquiryId` 与生成的 `inquiryNo`
- **AND** 明细行关联的 Filter 快照（`productName`/`model`/`typeName`）写入对应字段

#### Scenario: 客户提交询价单选择收货地址

- **WHEN** 已登录客户在提交询价单时提供自己名下的 `shippingAddressId`
- **THEN** 系统校验该地址属于当前客户后写入询价单
- **AND** 提交他人名下地址 SHALL 被拒绝

#### Scenario: 未登录提交询价单

- **WHEN** 请求未携带客户 access token 调用 `POST /b2c/inquiries`
- **THEN** 系统返回 401，不创建任何询价单

#### Scenario: 请求体携带可疑身份字段被拒

- **WHEN** 已登录客户在 `POST /b2c/inquiries` 请求体中携带 `customerId`/`customerName`/`customerEmail`/`customerPhone` 等字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不创建任何询价单，`customerId` 无法由客户端指定

### Requirement: 客户查询本人询价单

系统 SHALL 提供 `GET /b2c/inquiries`（本人询价单分页列表）与 `GET /b2c/inquiries/:id`（本人询价单详情，含明细行）两个端点，由 `CustomerJwtGuard` 保护。列表 SHALL 仅返回当前客户的询价单，按 `createdAt` 降序，分页结构为 `{ items, total, page, pageSize }`；详情 SHALL 包含当前 `status`（draft/submitted/quoted/expired）与报价相关字段（`quotedAt`/`expiresAt`/`totalAmount`/明细行 `unitPrice`/`subtotal`），供客户查看报价进度。访问他人询价单 SHALL 返回 404。

#### Scenario: 客户查看本人询价单列表

- **WHEN** 已登录客户请求 `GET /b2c/inquiries`
- **THEN** 系统返回该客户全部未软删除询价单，按 `createdAt` 降序分页，`items` 不含其他客户记录

#### Scenario: 客户查看本人询价单报价状态

- **WHEN** 已登录客户请求 `GET /b2c/inquiries/:id`，该询价单属于本人且已被报价
- **THEN** 系统返回询价单详情，`status` 为 `"quoted"`，包含 `quotedAt`/`expiresAt` 及明细行报价（`unitPrice`/`subtotal`）

#### Scenario: 客户访问他人询价单

- **WHEN** 已登录客户请求 `GET /b2c/inquiries/:id`，该询价单不属于本人
- **THEN** 系统返回 404，不泄露任何询价信息

### Requirement: 询价单状态只读约束

B2C 客户端点 SHALL 不提供询价单状态流转能力：客户创建的询价单 `status` 恒为 `"draft"`，由后台运营人员（具备相应权限码）执行 `draft → submitted` 的提交与后续报价流程；客户仅通过查询端点查看状态变化。后台 `inquiry/*` 端点行为与权限保持不变。

#### Scenario: 客户无法直接提交询价单

- **WHEN** 已登录客户尝试通过 B2C 端点将询价单状态改为 `submitted`
- **THEN** 系统返回 404 或 405（B2C 端点不提供状态流转接口）

#### Scenario: 后台运营提交询价单

- **WHEN** 具备询价单更新权限的后台管理员对 draft 询价单执行提交
- **THEN** 系统记录 `submittedAt = now()`，状态变为 `"submitted"`，客户随后通过 `GET /b2c/inquiries/:id` 可见该状态
