## Purpose

提供询价单（RFQ）域的数据模型与业务行为契约：客户或后台管理员发起询价单，附带滤清器明细行，支持状态流转（draft → submitted → quoted → expired）与编号自动生成，供销售/客服团队跟进报价。

## Requirements

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

状态流转 SHALL 以原子方式执行：系统 SHALL 把「期望的当前状态」作为写入的前置条件，使校验与写入构成单一操作；任一并发写入不得使询价单落入「状态与时间戳互斥」的非法组合。当写入前置条件不再成立（状态已被并发操作改变）时，系统 SHALL 返回 409 且 SHALL NOT 写入任何字段。时间戳 SHALL 与状态保持一致：`submitted` 对应 `submittedAt`、`quoted` 对应 `quotedAt`（及可选 `expiresAt`）、`cancelled` 对应 `cancelledAt`；`expired` 不产生新时间戳。

#### Scenario: 提交询价单

- **WHEN** 客户/管理员将 draft 询价单状态改为 submitted
- **THEN** 系统记录 `submittedAt = now()`，状态变为 `"submitted"`

#### Scenario: 非法逆向流转

- **WHEN** 尝试将 quoted 询价单改回 submitted
- **THEN** 系统返回 409 Conflict，错误码 `INQUIRY_INVALID_STATUS_TRANSITION`

#### Scenario: 并发流转只有一个成功

- **WHEN** 两个请求并发对同一 `status = "draft"` 的询价单分别执行提交与取消，且提交先完成
- **THEN** 提交请求成功（`status = "submitted"`、`submittedAt` 非空）；取消请求返回 409；该记录 SHALL NOT 同时具备 `status = "submitted"` 与 `cancelledAt ≠ null`

#### Scenario: 失效更新不写入任何字段

- **WHEN** 一个请求基于已过期的状态视图发起流转，实际状态已被并发操作改变
- **THEN** 系统返回 409，该记录的 `status`、`submittedAt`、`quotedAt`、`expiresAt`、`cancelledAt` 全部保持并发操作后的值不变

#### Scenario: 重复提交被拒

- **WHEN** 对已处于 `submitted` 的询价单再次执行提交
- **THEN** 系统返回 409，状态与 `submittedAt` 均不变

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

### Requirement: 客户自助创建询价单

系统 SHALL 在 Mall 应用上提供 B2C 客户自助创建询价单的端点 `POST /inquiries`，由 `CustomerJwtGuard` 保护，当前客户身份 SHALL 取自登录态（`@CurrentCustomer()`），请求 SHALL 不携带显式 `customerId`（请求体含 `customerId`/`customerName`/`customerEmail`/`customerPhone` 等后台快照字段 SHALL 被 `forbidNonWhitelisted` 拒绝，返回 400）。端点接受询价标题、描述与明细行列表；明细行 SHALL 支持引用滤清器 `filterId`（可选）或直接提供 `productName`，并携带 `quantity`/`remarks`；明细行的 `model`/`typeName`（及 `filterId` 提供的 `productName`）SHALL 由系统从 Filter 记录快照填充，不接受客户端传入。客户姓名/邮箱/电话快照 SHALL 由系统从登录客户记录自动填充。创建成功后系统 SHALL 生成唯一 `inquiryNo`，`status` 为 `"draft"`，`customerId` 取登录态客户，`createdById` 为空，并可从登录客户已保存的收货地址中选择 `shippingAddressId`（可选）。未登录或令牌无效 SHALL 返回 401。

#### Scenario: 已注册客户提交询价单

- **WHEN** 已登录客户请求 `POST /inquiries`，提交标题与含 `filterId` 的明细行
- **THEN** 系统创建询价单，`customerId` 为登录态客户，`createdById` 为空，`status` 为 `"draft"`，返回 `inquiryId` 与生成的 `inquiryNo`
- **AND** 明细行关联的 Filter 快照（`productName`/`model`/`typeName`）写入对应字段

#### Scenario: 客户提交询价单选择收货地址

- **WHEN** 已登录客户在提交询价单时提供自己名下的 `shippingAddressId`
- **THEN** 系统校验该地址属于当前客户后写入询价单
- **AND** 提交他人名下地址 SHALL 被拒绝

#### Scenario: 未登录提交询价单

- **WHEN** 请求未携带客户 access token 调用 `POST /inquiries`
- **THEN** 系统返回 401，不创建任何询价单

#### Scenario: 请求体携带可疑身份字段被拒

- **WHEN** 已登录客户在 `POST /inquiries` 请求体中携带 `customerId`/`customerName`/`customerEmail`/`customerPhone` 等字段
- **THEN** 系统返回 400（`forbidNonWhitelisted`），不创建任何询价单，`customerId` 无法由客户端指定

### Requirement: 客户查询本人询价单

系统 SHALL 在 Mall 应用上提供 `GET /inquiries`（本人询价单分页列表）与 `GET /inquiries/:id`（本人询价单详情，含明细行）两个端点，由 `CustomerJwtGuard` 保护。列表 SHALL 仅返回当前客户的询价单，按 `createdAt` 降序，分页结构为 `{ items, total, page, pageSize }`；详情 SHALL 包含当前 `status`（draft/submitted/quoted/expired）与报价相关字段（`quotedAt`/`expiresAt`/`totalAmount`/明细行 `unitPrice`/`subtotal`），供客户查看报价进度。详情 SHALL 在同一响应体中返回该询价单的全部未软删除明细行，每行 SHALL 至少包含 `inquiryLineId`、`productName`、`model`、`typeName`、`quantity`、`unitPrice`、`subtotal`、`remarks`、`sortOrder`，并按 `sortOrder` 升序、同值时按 `createdAt` 升序排列；已软删除（`deletedAt` 非空）的明细行 SHALL NOT 出现于详情响应。未报价（价格未由后台填写）时，`unitPrice`、`subtotal` 与 `totalAmount` SHALL 为 JSON `null`，SHALL NOT 表现为字段缺失或 `0`。访问他人询价单 SHALL 返回 404。

#### Scenario: 客户查看本人询价单列表

- **WHEN** 已登录客户请求 `GET /inquiries`
- **THEN** 系统返回该客户全部未软删除询价单，按 `createdAt` 降序分页，`items` 不含其他客户记录

#### Scenario: 客户查看本人询价单报价状态

- **WHEN** 已登录客户请求 `GET /inquiries/:id`，该询价单属于本人且已被报价
- **THEN** 系统返回询价单详情，`status` 为 `"quoted"`，包含 `quotedAt`/`expiresAt`
- **AND** 响应包含该询价单的全部未软删除明细行，每行携带后台填写的 `unitPrice` 与 `subtotal`

#### Scenario: 客户查看已提交但未报价的询价单详情

- **WHEN** 已登录客户请求 `GET /inquiries/:id`，该询价单属于本人、`status` 为 `"submitted"` 且后台尚未填写任何价格
- **THEN** 系统返回询价单详情，明细行集合与创建时一致（`productName`/`model`/`typeName`/`quantity` 均有值）
- **AND** 每行的 `unitPrice`/`subtotal` 以及主体的 `totalAmount` 均为 `null`，不接受替代为 `0` 或省略字段

#### Scenario: 明细行排序与软删除过滤

- **WHEN** 已登录客户请求 `GET /inquiries/:id`，该询价单含多行明细且其中一行已被软删除
- **THEN** 响应中的明细行按 `sortOrder` 升序排列
- **AND** 已软删除的明细行不出现在响应中

#### Scenario: 客户访问他人询价单

- **WHEN** 已登录客户请求 `GET /inquiries/:id`，该询价单不属于本人
- **THEN** 系统返回 404，不泄露任何询价信息

### Requirement: 客户提交与取消权限边界

客户 SHALL 仅能执行两种状态流转：把本人 `draft` 询价单提交为 `submitted`（`POST /inquiries/:id/submit`），以及把本人 `draft`/`submitted` 询价单取消为 `cancelled`（`POST /inquiries/:id/cancel`，终态）。报价（`submitted → quoted`）、过期（`quoted → expired`）与软删除 SHALL 仅由后台具备相应权限码的运营人员执行；客户 SHALL NOT 能设置 `totalAmount`、`quotedAt`、`expiresAt`。客户对非本人询价单执行流转 SHALL 返回 404，不泄露存在性。Admin 应用 `inquiry/*` 端点行为与权限保持不变。

#### Scenario: 客户提交本人询价单

- **WHEN** 已登录客户对本人 `draft` 询价单调用 `POST /inquiries/:id/submit`
- **THEN** 状态变为 `"submitted"` 并记录 `submittedAt`，后台可查询到该状态

#### Scenario: 客户取消本人询价单

- **WHEN** 已登录客户对本人 `draft` 或 `submitted` 询价单调用 `POST /inquiries/:id/cancel`
- **THEN** 状态变为 `"cancelled"` 并记录 `cancelledAt`，该状态为终态

#### Scenario: 客户不能报价或过期

- **WHEN** 客户尝试把本人询价单置为 `quoted` 或 `expired`（无对应 B2C 端点，或以任何方式构造该意图）
- **THEN** 系统不提供该能力（404/405），报价与过期只能由后台执行

#### Scenario: 客户流转他人询价单

- **WHEN** 已登录客户对不属于本人的询价单调用 `submit` 或 `cancel`
- **THEN** 系统返回 404，不泄露该询价单是否存在

#### Scenario: 后台运营执行报价

- **WHEN** 具备询价单更新权限的后台管理员把 `submitted` 询价单置为 `quoted`
- **THEN** 系统记录 `quotedAt` 与可选 `expiresAt`，客户随后通过 `GET /inquiries/:id` 可见该状态

### Requirement: 询价单列表与详情的响应结构区分

询价单详情端点（Mall `GET /inquiries/:id`、Admin `GET /inquiry/inquiries/:id`）SHALL 在响应中携带该询价单的未软删除明细行集合；询价单列表端点（Mall `GET /inquiries`、Admin `GET /inquiry/inquiries`）以及全部写端点（创建、提交、取消、更新、状态流转）SHALL NOT 在响应中携带明细行集合，其响应结构 SHALL 保持稳定以兼容既有消费方。询价域的金额字段（`Inquiry.totalAmount`、`InquiryLine.unitPrice`、`InquiryLine.subtotal`）SHALL 以 JSON 数值类型传输，SHALL NOT 以字符串传输，且其存在 SHALL NOT 导致响应失败；字段非空时 SHALL 为数值，为空时 SHALL 保持为 `null`，SHALL NOT 转换为 `0`。

#### Scenario: 详情响应携带明细行

- **WHEN** 调用任一询价单详情端点（Mall 客户端点或 Admin 后台端点），目标询价单存在且含明细行
- **THEN** 响应体包含明细行集合，元素字段集与明细行自身的查询接口一致

#### Scenario: 列表响应不携带明细行

- **WHEN** 调用任一询价单列表端点，且返回的询价单含有明细行
- **THEN** 响应中的每条询价单不含明细行集合字段，分页结构与 `{ items, total, page, pageSize }` 一致

#### Scenario: 写端点响应不携带明细行

- **WHEN** 客户或后台调用创建询价单、提交、取消、更新或状态流转任一写端点
- **THEN** 响应为询价单主体字段，不含明细行集合，与变更前的响应结构一致

#### Scenario: 金额字段以数值类型传输

- **WHEN** 响应中的 `totalAmount`、`unitPrice` 或 `subtotal` 已由后台填写
- **THEN** 该字段在 JSON 中为数值类型（如 `12.5`），而非带引号的字符串（如 `"12.50"`）
- **AND** 明细行自身的查询端点（Admin `GET /inquiry/inquiry-lines`）与询价单详情端点呈现同一序列化类型

#### Scenario: 非空金额不再导致响应失败

- **WHEN** 任一携带非空 `totalAmount` / `unitPrice` / `subtotal` 的询价响应被序列化
- **THEN** 端点返回成功响应，不因金额字段的存在而返回 5xx

#### Scenario: 未报价金额保持 null

- **WHEN** 响应中的 `totalAmount`、`unitPrice` 或 `subtotal` 尚未填写
- **THEN** 该字段在 JSON 中为 `null`，而非 `0` 或字段缺失

#### Scenario: Admin 详情端点保持可读明细行

- **WHEN** 具备询价单查看权限的后台管理员请求 Admin `GET /inquiry/inquiries/:id`
- **THEN** 响应同样携带该询价单的未软删除明细行，权限码与路由行为保持不变