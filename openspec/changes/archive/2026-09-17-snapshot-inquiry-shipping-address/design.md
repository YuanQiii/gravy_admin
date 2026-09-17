## Context

`Inquiry.shippingAddressId` 是**引用**，不是快照：

- `prisma/schema.prisma:693-694` 声明 `onDelete: SetNull`，`prisma/migrations/0_init/migration.sql:1021` 落实为数据库级外键 `ON DELETE SET NULL`。
- `apps/mall/src/modules/mall/addresses/customer-addresses.service.ts:122-128` 的 `removeForCustomer` 走**硬删**（`customerAddress.delete`），`assertOwned`（同文件 :131-141）只校验归属，不校验是否被询价单引用。
- `InquiryResponseDto` 只暴露 `shippingAddressId`，没有任何地址内容字段。

三者叠加的效果是：删址 → 引用被静默置空 → 地址信息不可恢复。规格 `openspec/specs/customer/spec.md`「客户自助地址用于询价」已要求「询价单详情返回地址快照字段」，属实现缺口。

本仓已有同型范式可对齐：`InquiryLine` 对滤清器存 `productName`/`model`/`typeName` 快照、`Inquiry` 已存 `customerName`/`customerEmail`/`customerPhone` 联系人快照。本变更把同一范式补到收货地址上。

**事实核查（实现依赖，需在改动前确认）**：`prisma/schema.prisma` 的 `datasource` 块**没有** `relationMode = "prisma"` 声明，`0_init` 迁移建立了真实外键约束——即 `ON DELETE SET NULL` 是**数据库级**行为，任何绕过 Prisma Client 的删除同样会触发。这与 `AGENTS.md`「`prisma/schema.prisma` 使用 `relationMode = "prisma"`，无外键约束」的表述不一致（见风险 4）。

## Goals / Non-Goals

**Goals:**

- 询价单的收货信息在地址被修改或删除后仍然完整、可读、可审计。
- 快照只有**一个**写入点，客户自助与管理端两条创建路径共用同一份真值，后续改动不会一半生效。
- 存量询价单尽量回填，避免历史单据留空。

**Non-Goals:**

- **不做**地址删除的软删化或引用保护（P3-2）。本变更让快照成为展示真值，因此「删址即失败」不再是必需；是否保留 `deletedAt` 列、以及删除语义如何统一，留待 P3-2 决策。
- **不做**管理端路径的地址归属校验强化（P2-4）。客户路径的归属校验在本变更中**收进接缝并移入事务内**（净删除，对外行为不变）；管理端路径的归属校验仍是 P2-4 的定义范围，本变更只把 interface 备好（`ownerCustomerId` 传 `null`）。
- **不做**地址变更的事后同步（如「快照跟随地址更新」）。快照的语义就是冻结，不提供漂移开关。
- **不做**地址簿的版本化/历史表。

## Decisions

### 1. 快照字段沿用被引用实体的字段名 + `shipping` 前缀

`shippingReceiver` / `shippingPhone` / `shippingProvince` / `shippingCity` / `shippingDistrict` / `shippingDetailAddress` / `shippingZipCode`，全部可空（`String?`，与 `CustomerAddress` 同类型；`zipCode` 亦为可空）。前缀避免与既有 `customerName`/`customerPhone`（联系人快照）混淆——两者语义不同：联系人是"谁在问"，快照是"发到哪里"。

*备选（否决）*：把快照收成一个 JSON 列。查询、索引、Swagger 契约都会退化，且与仓内既有的散列快照风格不一致。

### 2. 快照在创建时点**冻结**，不做实时跟随

写入一次，此后不可变。理由：询价单是要被报价和履约的**商业事实**，它必须记录"客户下单时说的是哪个地址"。若跟随地址更新，客户改一次地址就会改写历史单据的履约依据，快照等于不存在。

*备选（否决）*：查询时 join 地址表实时读取——地址被删后无内容可读，正是本缺陷的成因；视图/生成列同理不解决引用消失问题。

### 3. 保留 `onDelete: SetNull`，不改为 `Restrict`

快照已承担"信息不丢失"，引用是否存活就不再是数据完整性问题。改为 `Restrict` 会引入新的失败路径（客户整理地址簿时被历史询价单拦住删除），而收益仅是保住 `shippingAddressId` 的可追溯性——该收益由 P3-2 的软删方案以更低代价提供（软删后行仍在，引用天然存活，`deletedAt` 也不再是死条件）。

因此本变更**不动外键动作**。若 P3-2 决定保持硬删，则 `shippingAddressId` 可为 `null` 是预期状态，规格已如实写明。

### 4. `resolveShippingSnapshot` 是唯一接缝，归属校验在它内部

> 架构审查候选 A（Strong）落地：把归属校验收进同一个 interface，而不是留在 helper 之外由调用方各写一遍。

新增私有 `resolveShippingSnapshot(tx, addressId, ownerCustomerId?)`，在**事务内**完成三件事并产出 7 字段快照：

1. 按 `addressId` 读取地址（地址不存在或 `deletedAt` 非空 → `BadRequestException('INVALID_SHIPPING_ADDRESS')`）；
2. 当 `ownerCustomerId` 非空时，断言 `address.customerId === ownerCustomerId`（否则同码 400）——"地址有效"与"地址属于谁"是同一个不变量，只有一份表达；
3. 返回快照字段对象。

**调用合同**：

- 客户路径：`(tx, dto.shippingAddressId, customerId)`，**同时删除**原先位于事务外的那处归属校验——语义与状态码完全相同，只是从两处变一处（净删除，行为不变）。
- 管理端路径：`(tx, dto.shippingAddressId, null)`，即**不**校验归属，保持本变更前的外部行为；注释写明 P2-4 将把它改为传 `dto.customerId`。这样 interface 已就位，P2-4 只需改一个实参、替换掉它原本要新增的平行校验。

*备选（否决）*：让 helper 只做解析、归属校验留在调用方——同一不变量被两条路径各表达一次，P2-4 到来时要在旧校验之外再补一处。

### 5. 迁移：`ADD COLUMN` 可空 + 存量回填，不设 NOT NULL

单个 migration（`prisma migrate dev` 生成）：

```sql
ALTER TABLE "inquiries" ADD COLUMN "shippingReceiver" TEXT; -- 其余 6 列同型
UPDATE "inquiries" i SET "shippingReceiver" = a."receiver", ... 
FROM "customer_addresses" a WHERE i."shippingAddressId" = a."addressId";
```

回填只覆盖"引用仍然存活"的询价单；引用已被置空的历史单据**没有数据源**，保持 `null`（如实记录，不臆造）。列保持可空，因为匿名询价与"未选地址"都是合法状态。

### 6. 快照字段进 `InquiryResponseDto`（列表与详情同一形状）

快照是 7 个标量，体量可忽略；运营列表需要看到收货人，因此放在基础 DTO 而非详情 DTO——`Inquiry response projection` 接缝已把两个形状的映射收为单点（`projectInquiry` / `projectInquiryDetail`），加字段不需要碰任何出口。

创建入参 DTO（`CreateInquiryDto` / `CreateCustomerInquiryDto`）**不得**声明这 7 个字段：服务端派生字段暴露给客户端就等于允许伪造，靠 `forbidNonWhitelisted`（`configureApp`）拒绝。

### 7. 字段集收成 shape + select 常量，避免 7 字段三处人肉同步

> 架构审查候选 B（Worth exploring，依赖决策 4 成立）落地。

新增 `ShippingSnapshotShape`（TS 接口，7 个 `string | null`）与 `SHIPPING_SNAPSHOT_SELECT`（Prisma `select` 常量，供 helper 读取）。响应 DTO 的 7 个字段与 helper 的读取形状都引用同一份声明，字段集因此只有一个真值——加字段时 DTO 与读取不跟会在编译期暴露。迁移 SQL 无法被 TS 约束，由 tasks 的核对项覆盖。

*为什么不连迁移一起自动化*：迁移是一次性产物（见决策 5），引入代码生成器对它收益为负。候选 C「把回填写成可重跑的 module」已评估并否决——回填没有运行时消费者，其正确性由 tasks 5.4 的真库验证覆盖，为此新增一个 module 不满足删除测试（删掉它复杂度只会转移，不会集中）。

## Risks / Trade-offs

1. **[迁移在存量数据上执行]** → 迁移只做 `ADD COLUMN`（可空）与一次 `UPDATE ... FROM`，无 `NOT NULL`、无数据丢失风险；回填语句幂等可重跑。仍需在真实数据库上先验证（`prisma migrate dev` + 目标库 `migrate deploy`），并确认 `db-bootstrap` 的 fail-closed 路径不受影响。
2. **[快照与地址表内容不一致是刻意行为]** → 文档化：写进规格（"快照在创建时点冻结"）、DTO Swagger 描述与 ADR；否则后续维护者会把它当 bug 修成"跟随更新"。
3. **[引用已死的存量单据无法回填]** → 接受并记录；`shippingAddressId` 为 `null` 且快照为空是合法组合（与"客户没选地址"不可区分——本变更**不**声称能区分历史数据，仅保证此后不再发生）。
4. **[`AGENTS.md` 与 schema 事实漂移]** → AGENTS.md 声称 `relationMode = "prisma"`「无外键约束」，实际未声明且迁移建立了真实外键。本变更依赖"SetNull 是 DB 级行为"这一事实，因此把 AGENTS.md 与 schema 对齐列入 tasks（仅订正描述，不改 schema）。
5. **[PII 面扩大]** → `shippingReceiver`/`shippingPhone` 是收件人 PII，但同类字段（`customerName`/`customerEmail`/`customerPhone`）已在同一响应中，且端点由 `JwtAuthGuard` + 权限码保护；不引入新的暴露面，属既有口径的延续。
6. **[与 P3-2 / P2-4 的接缝]** → 三者的边界已在 Non-Goals 与决策 3/4 中写明；若 P2-4 先落地，本变更的 helper 会被 P2-4 复用（不冲突）；若 P3-2 先落地为软删，本变更的决策 3 依然成立（引用存活、快照冗余，均无冲突）。
