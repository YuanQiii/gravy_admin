## Purpose

提供询价单（RFQ）域的数据模型与业务行为契约：客户或后台管理员发起询价单，附带滤清器明细行，支持状态流转（draft → submitted → quoted → expired）与编号自动生成，供销售/客服团队跟进报价。

## ADDED Requirements

### Requirement: 询价单创建

系统 SHALL 提供 `Inquiry` 的创建接口，字段包含：`inquiryNo`（应用层生成，唯一）、`title`（非空）、`description`、`status`（默认 `"draft"`，常量值：draft/submitted/quoted/expired）、`customerId`（可空，引用 Customer）、`customerName`/`customerEmail`/`customerPhone`（联系人快照，可空）、`totalAmount`（numeric(12,2)，可空）、`createdById`（后台管理员，引用 User.userId）、`submittedAt`/`quotedAt`/`expiresAt`（时间戳，可空）、`shippingAddressId`（可空，引用 CustomerAddress）。`customerId` 与 `createdById` 均可空，以支持"匿名询价"与"管理员代客下单"两种边界场景。

#### Scenario: 已注册客户自助下单

- **WHEN** 客户提交询价单（带 `customerId`），无管理员介入
- **THEN** 系统创建询价单，`customerId` 非空，`createdById` 为空，`status` 为 `"draft"`

#### Scenario: 管理员代客下单

- **WHEN** 后台管理员代某客户创建询价单（同时传 `customerId` 与 `createdById`）
- **THEN** 系统创建询价单，两字段均非空，`createdById` 记录操作管理员用于审计

#### Scenario: 匿名询价

- **WHEN** 未注册客户提交询价单，仅提供 `customerName`/`customerEmail`/`customerPhone`，不提供 `customerId`
- **THEN** 系统创建询价单，`customerId` 为空，联系人快照字段非空

### Requirement: 询价单编号生成

系统 SHALL 在事务内生成询价单编号，格式为 `INQ{YYYYMM}-{4位序号}`（如 `INQ202608-0001`），序号按月递增，从 1 开始。生成逻辑 SHALL 在事务内查询当月最大编号 + 1，捕获唯一约束冲突时重试，最多重试 3 次。`inquiryNo` SHALL 全局唯一。

#### Scenario: 首单编号

- **WHEN** 2026 年 8 月系统收到首张询价单
- **THEN** 系统生成编号 `INQ202608-0001`

#### Scenario: 并发冲突重试

- **WHEN** 两个请求同时尝试创建询价单，均查询到当月最大序号为 5
- **THEN** 第一个请求成功创建 `INQ202608-0006`，第二个请求因唯一约束冲突重试，查询到新最大序号 6，生成 `INQ202608-0007`

#### Scenario: 重试耗尽

- **WHEN** 编号生成重试 3 次仍冲突
- **THEN** 系统返回 500 Internal Server Error，错误码 `INQUIRY_NO_GENERATION_FAILED`

### Requirement: 询价单明细行

系统 SHALL 提供 `InquiryLine` 的 CRUD 接口，字段包含：`inquiryId`（引用 Inquiry）、`filterId`（可空，引用 Filter）、`productName`（非空）、`model`、`typeName`、`quantity`（默认 1，非空）、`unitPrice`（numeric(12,2)，可空）、`subtotal`（numeric(12,2)，可空）、`remarks`、`sortOrder`。明细行随询价单硬删而级联删除（`onDelete: Cascade`），`filterId` 在滤清器硬删时置空（`onDelete: SetNull`）保留明细行。

#### Scenario: 添加明细行

- **WHEN** 运营人员为某询价单添加一行滤清器询价
- **THEN** 系统创建 `InquiryLine`，关联 `filterId`，从 Filter 快照 `productName`/`model`/`typeName` 写入明细字段

#### Scenario: 滤清器被删除后明细保留

- **WHEN** 关联的 Filter 被硬删除
- **THEN** `InquiryLine.filterId` 置空，`productName`/`model`/`typeName` 快照字段保留，询价单历史可读

### Requirement: 询价单状态流转

系统 SHALL 强制询价单状态按 `draft → submitted → quoted → expired` 单向流转；反向流转（如 `quoted → submitted`）SHALL 被拒绝。`draft → submitted` 时记录 `submittedAt`；`submitted → quoted` 时记录 `quotedAt` 与可选 `expiresAt`；`quoted → expired` 由定时任务或人工触发。

#### Scenario: 提交询价单

- **WHEN** 客户/管理员将 draft 询价单状态改为 submitted
- **THEN** 系统记录 `submittedAt = now()`，状态变为 `"submitted"`

#### Scenario: 非法逆向流转

- **WHEN** 尝试将 quoted 询价单改回 submitted
- **THEN** 系统返回 409 Conflict，错误码 `INQUIRY_INVALID_STATUS_TRANSITION`

### Requirement: 询价单查询

系统 SHALL 提供询价单的分页查询接口，支持按 `inquiryNo`/`customerName`/`status`/`createdById`/`customerId`/`createdAt` 范围筛选。返回数据 SHALL 不包含软删除记录。

#### Scenario: 按客户筛选询价单

- **WHEN** 运营人员按 `customerId` 查询某客户的所有询价单
- **THEN** 系统返回该客户的所有未软删除询价单，按 `createdAt` 降序，分页结构为 `{ items, total, page, pageSize }`

#### Scenario: 关键词模糊搜索询价单

- **WHEN** 运营人员按 `inquiryNo` 或 `customerName` 关键词搜索
- **THEN** 系统返回 `inquiryNo ILIKE '%kw%' OR customerName ILIKE '%kw%'` 的未软删除记录

### Requirement: 软删除与唯一约束

`Inquiry` 与 `InquiryLine` SHALL 支持 `deletedAt` 软删除。`inquiryNo` 唯一约束在数据库层面全局生效（含软删除记录）；Service 层 SHALL 在创建前校验未软删除记录无同名编号（实际由编号生成逻辑保证不会重复，因为基于当月最大序号递增）。

#### Scenario: 软删除询价单

- **WHEN** 管理员软删除询价单
- **THEN** 系统设置 `deletedAt = now()`，记录保留；查询接口不再返回该记录；`inquiryNo` 仍占位，新询价单不会复用该编号
