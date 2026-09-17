## MODIFIED Requirements

### Requirement: 询价单创建

系统 SHALL 提供 `Inquiry` 的创建接口，字段包含：`inquiryNo`（应用层生成，唯一）、`title`（非空）、`description`、`status`（默认 `"draft"`，常量值：draft/submitted/quoted/expired）、`customerId`（可空，引用 Customer）、`customerName`/`customerEmail`/`customerPhone`（联系人快照，可空）、`totalAmount`（numeric(12,2)，可空）、`createdById`（后台管理员，引用 User.userId）、`submittedAt`/`quotedAt`/`expiresAt`（时间戳，可空）、`shippingAddressId`（可空，引用 CustomerAddress，语义为**溯源引用**）、收货地址快照字段 `shippingReceiver`/`shippingPhone`/`shippingProvince`/`shippingCity`/`shippingDistrict`/`shippingDetailAddress`/`shippingZipCode`（均可空）。`customerId` 与 `createdById` 均可空，以支持"匿名询价"与"管理员代客下单"两种边界场景。

当创建请求提供 `shippingAddressId` 时，系统 SHALL 在同一事务内读取该地址并把其内容写入上述快照字段；快照一经写入 SHALL 保持不可变——后续对地址的修改或删除 SHALL NOT 改变已创建询价单的快照值。询价单查询响应 SHALL 返回地址快照字段。

当创建请求同时提供 `shippingAddressId` 与 `customerId` 时，系统 SHALL 校验该地址存在、未软删、且属于 `customerId` 后方可写入；二者不满足时 SHALL 返回 400 **而非** 500。`shippingAddressId` 非空时 `customerId` 必须非空——仅提供 `shippingAddressId` 而未提供 `customerId` 的请求 SHALL 在 DTO 校验层被拒绝（400）。匿名询价（`customerId` 与 `shippingAddressId` 均为空）SHALL 仍被允许。

#### Scenario: 已注册客户自助下单

- **WHEN** 客户提交询价单（带 `customerId`），无管理员介入
- **THEN** 系统创建询价单，`customerId` 非空，`createdById` 为空，`status` 为 `"draft"`

#### Scenario: 管理员代客下单

- **WHEN** 后台管理员代某客户创建询价单（同时传 `customerId` 与 `createdById`）
- **THEN** 系统创建询价单，两字段均非空，`createdById` 记录操作管理员用于审计

#### Scenario: 匿名询价

- **WHEN** 未注册客户提交询价单，仅提供 `customerName`/`customerEmail`/`customerPhone`，不提供 `customerId` 也不提供 `shippingAddressId`
- **THEN** 系统创建询价单，`customerId` 为空，`shippingAddressId` 为空，联系人快照字段非空

#### Scenario: 创建时写入地址快照

- **WHEN** 创建请求携带 `shippingAddressId`，且该地址存在
- **THEN** 响应与后续查询返回的地址快照字段等于创建时刻该地址的收货人/电话/省/市/区/详细地址/邮编

#### Scenario: 未提供地址时快照为空

- **WHEN** 创建请求不携带 `shippingAddressId`
- **THEN** 询价单的地址快照字段均为 `null`，创建成功，不报错

#### Scenario: 管理端代客下单携带有效地址

- **WHEN** 后台管理员代某客户创建询价单，提供该客户名下的 `shippingAddressId` 与同一 `customerId`
- **THEN** 系统在事务内校验地址归属通过后创建询价单，写入该地址引用与对应快照字段

#### Scenario: 管理端仅传地址不传客户被拒

- **WHEN** 后台管理员创建询价单时提供 `shippingAddressId` 但不提供 `customerId`
- **THEN** 系统在 DTO 校验层拒绝请求（400），不创建询价单

## ADDED Requirements

### Requirement: 管理端询价单收货地址归属校验

系统 SHALL 在管理端 `create` 路径的 `$transaction` 内（与编号生成、询价单主体同一事务）通过既有 `resolveShippingSnapshot(tx, addressId, ownerCustomerId)` 接缝校验收货地址：当 `shippingAddressId` 非空时，地址必须存在、未被软删、且 `address.customerId === ownerCustomerId`（即 `dto.customerId`）。任一条件不满足 SHALL 返回 400 `INVALID_SHIPPING_ADDRESS`，SHALL NOT 以数据库外键错误返回的 500 暴露。该接缝由 P0-2 引入，客户自助路径复用同一实现，管理端路径 SHALL NOT 另写平行校验。

#### Scenario: 管理端错挂他人地址被拒

- **WHEN** 后台管理员创建询价单，提供的 `shippingAddressId` 属于另一客户
- **THEN** 系统返回 400 `INVALID_SHIPPING_ADDRESS`，不创建询价单，不写入任何地址引用

#### Scenario: 管理端地址不存在返回 400 而非 500

- **WHEN** 后台管理员创建询价单，提供不存在的 `shippingAddressId`（连同有效的 `customerId`）
- **THEN** 系统返回 400 `INVALID_SHIPPING_ADDRESS`，而非数据库外键错误导致的 500

#### Scenario: 管理端地址已软删被拒

- **WHEN** 后台管理员创建询价单，提供的 `shippingAddressId` 对应记录已被软删（`deletedAt` 非空）
- **THEN** 系统返回 400 `INVALID_SHIPPING_ADDRESS`，不创建询价单
