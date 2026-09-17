# ADR 0015: 询价单存收货地址快照（引用外部可变实体一律存快照）

- 状态：已接受

- 日期：2026-09-17

- 关联：ADR 0013（客户侧事件表快照/门禁）、ADR 0014（询价单客户提交/取消与状态收紧）、CONTEXT.md 词条 `Inquiry` / `InquiryLine` / `Inquiry response projection`

## 背景

`Inquiry.shippingAddressId` 一直是**引用**，不是快照：

- `prisma/schema.prisma` 声明 `onDelete: SetNull`，`prisma/migrations/0_init/migration.sql` 落实为数据库级外键 `ON DELETE SET NULL`；
- Mall 的 `CustomerAddressesService.removeForCustomer` 走**硬删**（`customerAddress.delete`），其 `assertOwned` 只校验归属，不校验是否被询价单引用；
- 响应 DTO 只暴露 `shippingAddressId`，没有任何地址内容字段。

三者叠加的后果：客户在提交询价单后整理地址簿、删掉那张地址 → 数据库**静默**把 `shippingAddressId` 置 `NULL` → 该询价单的收货人/电话/地址**永久丢失且无迹可查**。运营看到的是一张「没有收货地址」的已提交/已报价询价单，且无法区分「客户当初没选地址」与「地址被删了」。规格 `openspec/specs/customer/spec.md` 早已要求「询价单详情返回地址快照字段」，属实现缺口。

## 决策

**1. 在 `Inquiry` 上冗余收货地址快照字段**（`shippingReceiver` / `shippingPhone` / `shippingProvince` / `shippingCity` / `shippingDistrict` / `shippingDetailAddress` / `shippingZipCode`，均可空），创建时从被引用地址一次性写入；`shippingAddressId` 降级为**溯源引用**（可为 `null`）。

**2. 快照在创建时点冻结，不跟随地址更新。** 询价单是要被报价与履约的**商业事实**，必须记录「客户下单时说的是哪个地址」。跟随更新等于没有快照：客户改一次地址就改写历史单据的履约依据。

**3. 保留 `ON DELETE SET NULL`，不改为 `RESTRICT`。** 快照已承担「信息不丢失」，引用是否存活不再是数据完整性问题。改为 `RESTRICT` 只会给「客户整理地址簿」新增一条失败路径（被历史询价单拦住删除），而它唯一的收益——保住 `shippingAddressId` 的可追溯性——可由后续的地址软删方案以更低代价提供。

**4. 快照读取与归属断言收在同一个事务内接缝**（`InquiriesService.resolveShippingSnapshot(tx, addressId, ownerCustomerId?)`）：客户路径在事务内读并断言归属，管理端路径本阶段传 `null` 以保持既有外部行为。同一不变量只有一份表达。

## 理由与备选否决

| 备选 | 否决理由 |
| --- | --- |
| 查询时 join 地址表实时读取 | 地址被删后无内容可读——正是本缺陷的成因；视图/生成列同理不解决引用消失。 |
| 改为 `RESTRICT` + 删除前引用检查 | 把「删除地址」变成可能失败的交互，换取一个快照已经提供的性质；且与后续软删方案冲突。 |
| 只在前端保留地址副本 | 服务端没有真值，导出/报表/后台履约全部拿不到地址。 |
| 快照存 JSON 列 | 查询、索引与 Swagger 契约全面退化，且与仓内既有的散列快照风格（`InquiryLine` 对 Filter、`Inquiry` 对 Customer 联系人）不一致。 |

## 后果

- **正向**：地址被删/被改都不影响已创建询价单的收货信息；运营与客户看到同一份真值；`include`/投影侧无需再 join 地址表。
- **范式统一**：与 `InquiryLine.productName/model/typeName`（Filter 快照）、`Inquiry.customerName/Email/Phone`（联系人快照）构成同一条规则——**引用外部可变实体时，把可履约内容复制进单据**。
- **代价·冗余**：地址内容在同一行内重复；客户改址不会同步到历史单据（刻意）。
- **代价·存量**：`shippingAddressId` 已被置空的历史单据**没有数据源可回填**，其快照保持 `null`，与「当初没选地址」不可区分。迁移只回填「引用仍存活」的行。
- **后续**：地址删除是否改为软删、`CustomerAddress.deletedAt` 列的去留，由独立变更 `unify-soft-delete-mechanics` 决定；本决策与它不冲突（软删后引用存活，快照仍为展示真值）。
