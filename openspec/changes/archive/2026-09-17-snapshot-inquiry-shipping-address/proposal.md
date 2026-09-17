## Why

`Inquiry` 只保存对 `CustomerAddress` 的引用（`shippingAddressId`），不保存地址内容；而 `customerAddress.delete` 是硬删，数据库层 `inquiries_shippingAddressId_fkey` 的 `ON DELETE SET NULL` 会把引用静默清空。结果是：客户在提交询价单后整理地址簿，该询价单的收货地址**永久丢失且无迹可查**——运营看到一张「没有收货地址」的已提交/已报价询价单，既无法履约，也无法区分「客户没选地址」与「地址被删」。规格 `openspec/specs/customer/spec.md` 的「客户自助地址用于询价」已写明「询价单详情返回地址快照字段」，但实现既无快照也无回显。

## What Changes

- `Inquiry` 增加**收货地址快照字段**：`shippingReceiver` / `shippingPhone` / `shippingProvince` / `shippingCity` / `shippingDistrict` / `shippingDetailAddress` / `shippingZipCode`（均可空）。
- 创建询价单时（客户自助与管理端两条路径）从被引用地址**一次性写入**快照；快照在创建时点冻结，此后地址被修改或删除都不影响已创建的询价单。
- `shippingAddressId` 降级为**溯源引用**，保留 `onDelete: SetNull`：快照是展示与履约的真值，因此删址不再造成信息丢失，也不给客户整理地址簿增加新的失败路径。
- 响应 DTO 暴露快照字段（列表与详情同一形状，运营列表即可看到收货人）。
- 新增一条数据库迁移：`ADD COLUMN`（可空）+ 从 `customer_addresses` 回填存量询价单，避免历史单据留空。
- 新增 ADR 记录「引用外部可变实体一律存快照」的决策，供后续地址/客户/滤清器引用场景对齐。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `inquiry`: 「询价单创建」——`Inquiry` 字段清单增加收货地址快照字段，并明确「快照在创建时冻结、不随后续地址变更漂移」。
- `customer`: 「客户自助地址用于询价」——把「询价单详情返回地址快照字段」从隐含期望改为可断言的显式约束（含地址被删除后仍完整回显的场景）。

## Impact

- **数据库**：`prisma/schema.prisma`（`Inquiry` 增列）、`prisma/migrations/`（一条迁移，含存量回填）。
- **代码**：`packages/domain/src/inquiry/inquiries/inquiries.service.ts`（`create` / `createForCustomer` 写入快照，快照解析收为单点私有 helper）、`dto/inquiry-response.dto.ts`（暴露快照字段）、`dto/create-inquiry.dto.ts` 与 `dto/customer-b2c/create-customer-inquiry.dto.ts`（快照字段为服务端派生，**不得**由客户端传入，靠 `forbidNonWhitelisted` 拒绝）。
- **接口**：Mall `POST /inquiries`、`GET /inquiries/:id`；Admin `POST/PATCH /inquiry/inquiries`、`GET /inquiry/inquiries/:id`、列表端点的响应字段增加（**增量变更**，不破坏既有消费方）。
- **文档**：新增 ADR；若 `docs/features.md` 描述询价响应形态则同步。
- **不在本次范围**：地址删除改为软删/引用保护（P3-2）、归属校验从事务外移入事务内与管理端校验（P2-4）——本变更只负责「快照存在且可信」，并在 design 中记录与这两项的接缝。
