## Why

三个价格字段没有任何聚合真值：`Inquiry.totalAmount` 无服务端写入方，只由 admin 在 `POST/PATCH /inquiry/inquiries` 手工传值；`InquiryLine.subtotal` 也由人工填写，不由 `quantity × unitPrice` 推导（`packages/domain/src/inquiry/inquiry-lines/inquiry-lines.service.ts:68` 是 `subtotal: dto.subtotal ?? null`）。因此 `quantity`、`unitPrice`、`subtotal`、`totalAmount` 四者可任意互相矛盾，且**没有任何一层在保护它们的一致性**。

这个问题在客户侧已经变成可见缺陷：归档变更 `2026-09-16-expose-inquiry-lines-in-detail` 之后，客户能在详情里看到明细行与 `unitPrice`/`subtotal`（该变更的 spec delta 明确把「价格聚合口径」标为范围外——本变更就是那件事）。当下客户可能看到"4 × 12.50"的行小计写着"30.00"，或整单合计与各行小计之和不等——报价单的商业可信度直接受损。

## What Changes

- **`subtotal` 改为服务端派生**：`subtotal = quantity × unitPrice`（`unitPrice` 为空时 `subtotal` 为空），不再接受客户端传入。明细行新增/修改时在**同一事务内**重算。
- **`totalAmount` 改为服务端派生**：`totalAmount = Σ（未软删明细行的 subtotal）`，在明细行任何写操作与报价动作（`submitted → quoted`）后于同一事务内重算。客户端不再能传入 `totalAmount`。
- ****BREAKING**：`CreateInquiryDto.totalAmount`、明细行 DTO 的 `subtotal` 从入参移除**；由于 ValidationPipe 启用了 `forbidNonWhitelisted`，旧调用方继续传这些字段会收到 **400**，必须同步改造。
- **精度约束**：聚合在 Decimal / SQL 层完成，**不得用 JS `number` 逐行相加**（`Decimal(12,2)` 的两位小数在 js 浮点相加下会产生误差）。
- **历史数据回填**：迁移内一次性纠正已存在的 `subtotal` 与 `totalAmount`（含核查 SQL，先量化会影响多少行）。
- **规格契约**：把「金额必须可推导」写成可断言的行为（`subtotal = quantity × unitPrice`、`totalAmount = Σ subtotal`、入参不接受金额）。
- **（并入的 P0-2 验证发现 W1）创建期字段在更新端点不可变**：`UpdateInquiryDto` 改为 `PartialType(OmitType(CreateInquiryDto, ['shippingAddressId', 'totalAmount'] as const))`。原因是一条独立于定价的缺陷：`update` 用 `{ expiresAt, ...rest } = dto` 整块 spread，而 `UpdateInquiryDto extends PartialType(CreateInquiryDto)` 仍带 `shippingAddressId` → 后台 PATCH 能把引用换成另一张地址而**不动快照**，产生「引用指向 B、收货人是 A」的状态，而规格此前既没定义该行为也没有测试。两种修法（创建后引用不可变 / 换引用时同事务重解析快照）中选**前者**：换址等价于换一张单据，而不是悄悄改写既有单据的履约依据；且它与本变更"金额由服务端派生、入参不得指定"的方向一致——两者都是**创建期决定、之后不可被客户端改写**的字段。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `inquiry`: 「询价单明细行」——`subtotal` 由系统按 `quantity × unitPrice` 派生，不接受客户端传入；「询价单创建」——`totalAmount` 由系统按明细行汇总派生、不接受客户端传入，且 `shippingAddressId`（含快照）与 `totalAmount` 属创建期不可变字段（更新端点拒绝）。

## Impact

- **代码**：`packages/domain/src/inquiry/inquiry-lines/inquiry-lines.service.ts`（create/update/remove/removeMany 后触发重算）、`packages/domain/src/inquiry/inquiries/inquiries.service.ts`（报价流转时重算；`create`/`update` 不再透传 `totalAmount`）、新增聚合 module（见 design 决策 1）、`CreateInquiryDto` / `CreateInquiryLineDto` / `UpdateInquiryLineDto` / **`UpdateInquiryDto`（改为 `OmitType` + `PartialType`，剔除 `shippingAddressId` 与 `totalAmount`）**。
- **接口**：Admin 询价单创建/更新与明细行创建/更新的入参**收窄**（**BREAKING**）；响应字段不变（仍是 `subtotal`/`totalAmount`，只是现在由服务端保证）。
- **数据库**：一条迁移（回填 `subtotal` 与 `totalAmount`），**不改列定义**。迁移需用户显式确认后执行。
- **文档**：`docs/adr/0014` 决策 5 把聚合划归 admin 职责但未实现——本变更落实该职责，需在归档时补更正注记（本次不改 ADR 文件）。
- **与并行变更的接缝（重要）**：
  - `snapshot-inquiry-shipping-address`（P0-2）**也** MODIFIES 规格的「询价单创建」Requirement，并且同样改动 `inquiries.service.ts` 的 `create`/`createForCustomer`。两者必须**串行归档**，且实现时同一文件的改动要合并处理。
  - `atomic-inquiry-status-transition`（P0-3）引入 `applyStatusTransition` 接缝；报价时的重算应落在该接缝的调用方（`updateStatus`），而不是塞进接缝内部。
  - `resolve-inquiry-expiry-semantics`（P1-3）让 `submitted → quoted` 强制要求 `expiresAt`；与本变更的"报价时重算"是同一动作的两个副作用，实现时需在同一处编排。
