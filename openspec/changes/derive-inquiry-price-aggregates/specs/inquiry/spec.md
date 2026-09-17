## MODIFIED Requirements

### Requirement: 询价单明细行

系统 SHALL 提供 `InquiryLine` 的 CRUD 接口，字段包含：`inquiryId`（引用 Inquiry）、`filterId`（可空，引用 Filter）、`productName`（非空）、`model`、`typeName`、`quantity`（默认 1，非空）、`unitPrice`（numeric(12,2)，可空）、`subtotal`（numeric(12,2)，可空）、`remarks`、`sortOrder`。明细行随询价单硬删而级联删除（`onDelete: Cascade`），`filterId` 在滤清器硬删时置空（`onDelete: SetNull`）保留明细行。

`subtotal` SHALL 由系统按 `quantity × unitPrice` 派生，SHALL NOT 接受客户端传入；`unitPrice` 为空时 `subtotal` SHALL 为 `null`（SHALL NOT 为 `0`）。该派生 SHALL 与明细行自身的写入在同一事务内完成，使读取方永不观察到 `quantity`/`unitPrice`/`subtotal` 三者互相矛盾的明细行。

#### Scenario: 添加明细行

- **WHEN** 运营人员为某询价单添加一行滤清器询价
- **THEN** 系统创建 `InquiryLine`，关联 `filterId`，从 Filter 快照 `productName`/`model`/`typeName` 写入明细字段

#### Scenario: 滤清器被删除后明细保留

- **WHEN** 关联的 Filter 被硬删除
- **THEN** `InquiryLine.filterId` 置空，`productName`/`model`/`typeName` 快照字段保留，询价单历史可读

#### Scenario: 小计由系统派生

- **WHEN** 运营人员写入一行明细，`quantity = 4`、`unitPrice = 12.50`
- **THEN** 系统写入 `subtotal = 50.00`，无需运营人员计算或填写

#### Scenario: 单价为空时小计为空

- **WHEN** 运营人员写入一行明细，仅提供 `quantity`，不提供 `unitPrice`
- **THEN** 系统写入 `subtotal = null`（不是 `0`）

#### Scenario: 客户端传入小计被拒

- **WHEN** 任一明细行写入端点（Admin 创建/更新）的请求体携带 `subtotal`
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不接受客户端指定的金额

### Requirement: 询价单创建

系统 SHALL 提供 `Inquiry` 的创建接口，字段包含：`inquiryNo`（应用层生成，唯一）、`title`（非空）、`description`、`status`（默认 `"draft"`，常量值：draft/submitted/quoted/expired）、`customerId`（可空，引用 Customer）、`customerName`/`customerEmail`/`customerPhone`（联系人快照，可空）、`totalAmount`（numeric(12,2)，可空）、`createdById`（后台管理员，引用 User.userId）、`submittedAt`/`quotedAt`/`expiresAt`（时间戳，可空）、`shippingAddressId`（可空，引用 CustomerAddress，语义为**溯源引用**）、收货地址快照字段 `shippingReceiver`/`shippingPhone`/`shippingProvince`/`shippingCity`/`shippingDistrict`/`shippingDetailAddress`/`shippingZipCode`（均可空）。`customerId` 与 `createdById` 均可空，以支持"匿名询价"与"管理员代客下单"两种边界场景。

当创建请求提供 `shippingAddressId` 时，系统 SHALL 在同一事务内读取该地址并把其内容写入上述快照字段；快照一经写入 SHALL 保持不可变——后续对地址的修改或删除 SHALL NOT 改变已创建询价单的快照值。询价单查询响应 SHALL 返回地址快照字段。

`totalAmount` SHALL 由系统按该询价单**未软删除明细行的 `subtotal` 之和**派生，SHALL NOT 接受客户端传入；无未软删明细行或各行 `subtotal` 全为空时 SHALL 为 `null`。派生 SHALL 在每次明细行写入（新增/修改/删除/批量删除）与报价状态流转（`submitted → quoted`）后于同一事务内重算，使读取方永不观察到合计与各行小计之和不等的询价单。

`shippingAddressId`（及其快照）与 `totalAmount` SHALL 仅在创建时确定，属于**创建期不可变字段**：询价单更新端点 SHALL NOT 接受这两个字段，客户端传入时 SHALL 被 DTO 白名单拒绝（400）；换址或改价 SHALL 通过新建询价单表达，而不是就地改写既有单据的履约依据。

#### Scenario: 已注册客户自助下单

- **WHEN** 客户提交询价单（带 `customerId`），无管理员介入
- **THEN** 系统创建询价单，`customerId` 非空，`createdById` 为空，`status` 为 `"draft"`

#### Scenario: 管理员代客下单

- **WHEN** 后台管理员代某客户创建询价单（同时传 `customerId` 与 `createdById`）
- **THEN** 系统创建询价单，两字段均非空，`createdById` 记录操作管理员用于审计

#### Scenario: 匿名询价

- **WHEN** 未注册客户提交询价单，仅提供 `customerName`/`customerEmail`/`customerPhone`，不提供 `customerId`
- **THEN** 系统创建询价单，`customerId` 为空，联系人快照字段非空

#### Scenario: 创建时写入地址快照

- **WHEN** 创建请求携带 `shippingAddressId`，且该地址存在
- **THEN** 响应与后续查询返回的地址快照字段等于创建时刻该地址的收货人/电话/省/市/区/详细地址/邮编

#### Scenario: 未提供地址时快照为空

- **WHEN** 创建请求不携带 `shippingAddressId`
- **THEN** 询价单的地址快照字段均为 `null`，创建成功，不报错

#### Scenario: 合计随明细行变化重算

- **WHEN** 某询价单已有两行明细（`subtotal` 分别为 `50.00` 与 `25.00`），运营人员新增第三行 `subtotal = 10.00`
- **THEN** 该询价单 `totalAmount` 变为 `85.00`；删除第二行后变为 `60.00`

#### Scenario: 无已报价明细时合计为空

- **WHEN** 询价单的明细行均未填写 `unitPrice`，或该询价单没有未软删明细行
- **THEN** `totalAmount` 为 `null`

#### Scenario: 客户端传入合计被拒

- **WHEN** 任一询价单写入端点（Admin 创建/更新）的请求体携带 `totalAmount`
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不接受客户端指定的合计

#### Scenario: 更新端点不接受换址

- **WHEN** 后台通过 `PATCH /inquiry/inquiries/:id` 携带 `shippingAddressId`（指向另一张地址）
- **THEN** 系统返回 400（`forbidNonWhitelisted`），该单据的地址引用与 7 个快照字段均保持不变
