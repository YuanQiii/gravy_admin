## MODIFIED Requirements

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

## ADDED Requirements

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
