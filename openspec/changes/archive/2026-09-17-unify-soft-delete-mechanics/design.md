## Context

本变更解决业务审查报告 P3-2：同一域内删除机制混用 + `CustomerAddress` 的死条件。

**事实核查（实现前已逐点核实，非照抄报告）：**

- `Inquiry.remove`（`packages/domain/src/inquiry/inquiries/inquiries.service.ts:506`）走 `SoftDeleteService.softDelete`；`Inquiry.removeMany`（同文件 `:513-518`）直接 `updateMany({ where: { inquiryId: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } })`。二者**都是软删**（置 `deletedAt`），分歧仅在机制。
- `CustomerAddress` 删除为**硬删**且在两个应用都存在：Mall `removeForCustomer` 走 `customerAddress.delete`（`apps/mall/src/modules/mall/addresses/customer-addresses.service.ts:127`）；Admin `remove`/`removeMany` 走 `delete`/`deleteMany`（`apps/admin/src/modules/addresses/addresses.service.ts:156,160`）。Admin **确有**删除入口（报告未明确，已补核实）。
- 读路径普遍检查 `CustomerAddress.deletedAt`（Mall `findMyAddresses:73`/`assertOwned:138`；Admin `findAll:61`/`findOne:82`/`update:97`/`setDefault:130`/`remove:153`），但硬删从不写入该列 → 全为永不为真的死条件。
- 全局 `grep` 确认**没有任何代码写入 `customerAddress.deletedAt`**（零命中）。`InquiryLine.deletedAt` 是活条件（`INQUIRY_DETAIL_INCLUDE` 过滤 `deletedAt:null`，`inquiries.service.ts:38`），**不在本变更范围**。
- `Customer` 本身走 `SoftDeleteService`（Admin `customers.service.ts:227`），其 `deletedAt` 保留。本变更只动 `CustomerAddress`。

**与 P0-2 的继承关系（必读，不修改 P0-2 目录）：**

并行变更 `openspec/changes/snapshot-inquiry-shipping-address/`（P0-2 收货地址快照）已决定保留 `Inquiry.shippingAddress → CustomerAddress` 的 `onDelete: SetNull`（`design.md` 决策 3），理由是「快照已承担信息不丢失，引用是否存活不再是数据完整性问题；改为 Restrict 会引入新的删除失败路径」。其 Non-Goals 明确把「地址删除的软删化/引用保护，以及 `deletedAt` 列的去留」划给本变更（P3-2）。P0-2 原文：「若 P3-2 决定保持硬删，则 `shippingAddressId` 可为 `null` 是预期状态」、「若 P3-2 先落地为软删，本变更的决策 3 依然成立（引用存活、快照冗余，均无冲突）」。因此本变更在「删列（明确硬删）」与「真软删」两条自洽路径中**必须选一**，且与 P0-2 的 `SetNull` 决策协调。

## Goals / Non-Goals

**Goals:**

- 两条删除机制收敛到 `SoftDeleteService`，单条与批量删除共用同一软删实现（便于未来在软删层统一加审计/唯一性诊断）。
- 明确 `CustomerAddress` 为硬删语义，移除 `deletedAt` 死列与全部读路径死条件，消除信息误导与潜在误判。
- 迁移可安全重跑、与 P0-2 的 `SetNull` 决策自洽。

**Non-Goals:**

- **不做** `InquiryLine` 或 `Customer` 的软删改动（活条件，保持现状）。
- **不做** `Inquiry.shippingAddress` 外键动作的调整（属 P0-2 已决范围）。
- **不做** 地址删除的引用保护（如改 `Restrict`），由 P0-2 的快照 + `SetNull` 覆盖。
- **不改** `openspec/specs/**` 主规格、P0-2 变更目录、或任何项目代码（仅规划件）。

## Decisions

### 1. Inquiry 单条与批量删除统一走 `SoftDeleteService`

给 `SoftDeleteService` 新增 `softDeleteMany(model, idField, ids)`（`packages/core/src/shared/services/soft-delete.service.ts`），内部 `updateMany({ where: { [idField]: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } })`；`Inquiry.removeMany` 改调它。

*备选（否决）*：在 `removeMany` 内循环调用 `softDelete`（逐条 `update`）。批量场景下 N 次单条 SQL 不如一次 `updateMany`，且 `remove` 已用集中服务，循环只是把分叉换个位置，未消除机制差异。

*备选（否决）*：让 `removeMany` 继续裸 `updateMany`，仅补注释「与 remove 等价」。机制分叉持续存在，未来软删层加逻辑需两处同步，正是报告所述痛点。

### 2. `CustomerAddress` 选择「删列 + 明确硬删」，而非「真软删」

**采纳方案（a）：从 `prisma/schema.prisma` 移除 `CustomerAddress.deletedAt`（含 `@@index([deletedAt])`），删除行为保持物理硬删，并清除全部读路径的 `deletedAt` 死条件。**

理由：

1. **继承 P0-2 的 `SetNull` 决策并使其自洽**。硬删触发 `ON DELETE SET NULL` → `Inquiry.shippingAddressId` 置空，地址信息由 P0-2 快照兜住。逻辑闭环成立。
2. **与既有规格一致**。`customer/spec.md`「客户自助管理收货地址」场景「客户删除默认地址」已写明「系统硬删该地址」；Admin `addresses.service.ts:145-148` 注释亦确认「spec scenario：硬删」。本变更是让 schema/代码对齐既有规格，而非推翻它。
3. **数据零风险**。全局核查：无任何代码写入 `customerAddress.deletedAt`，全部删除均为物理 `delete`；列内无历史 `deletedAt != null` 行，删列不会「复活」任何软删行。即使假设存在人工 SQL 残留，迁移也以防御性 `DELETE FROM "customer_addresses" WHERE "deletedAt" IS NOT NULL;` 先行清理。
4. **消除死条件本身即修复**。7 处 `deletedAt` 判断（Mall 2 处、Admin 5 处）永不为真，移除后读路径以「记录存在性 + `customerId` 归属」为唯一判据，语义清晰、无误导。

*备选（否决）方案（b）：真软删*——把硬删改为走 `SoftDeleteService`、让 `deletedAt` 从死条件变活条件。否决理由：

- 与 P0-2 的 `SetNull` **互斥**：软删不物理删除行，`ON DELETE SET NULL` 永不触发，`shippingAddressId` 会持续指向一个「已删除」地址，使 P0-2 决策 3 形同虚设，并制造永远无法清理的悬挂引用。
- 引入地址表无限堆积与历史不可清理问题，超出本变更范围。
- 既有规格与管理端注释均明确硬删，推翻需同时改 P0-2 继承前提，收益为负。

### 3. 读路径死条件的清理口径

Mall：`findMyAddresses` 改 `where = { customerId }`（去 `deletedAt:null`）；`assertOwned` 改 `if (!address || address.customerId !== customerId)`（去 `address.deletedAt`）。Admin：`findAll` 去 `where.deletedAt=null`；`findOne`/`update`/`setDefault`/`remove` 的存在性判断去 `existing.deletedAt`/`address.deletedAt`，仅保留记录存在 + `customerId` 归属校验。

*备选（否决）*：保留 `deletedAt` 列但仅删除读路径判断。这会让 schema 与「硬删」语义继续冲突，列成为无用的历史包袱，未来仍可能被误用，未根治问题。

## Risks / Trade-offs

- **[迁移删除列]** → 需用户显式确认后运行（`prisma migrate dev` 生成）；迁移含防御性 `DELETE WHERE deletedAt IS NOT NULL` 先行。验证前在本地 dev 库试跑，确认无外键/索引依赖阻断。
- **[Admin 行为保持不变的边界]** → 规格写明「Admin `customer/addresses` 行为保持不变（亦为硬删、无 `deletedAt`）」，本变更对 Admin 仅删死条件、不改删除方式，满足该约束。
- **[软删能力永久让渡]** → 删除 `deletedAt` 后 `CustomerAddress` 失去软删恢复能力；但规格与 P0-2 均确认硬删为预期状态，地址无审计恢复需求（与 `CustomerFavorite`/`CustomerHistory` 事件型表一致），此取舍可接受。
- **[P0-2 归档顺序]** → 若 P0-2 先归档，`customer/spec.md` 的快照场景已存在，本变更 MODIFIED 不冲突；若本变更先落地，P0-2 的 `SetNull` + 快照仍成立。二者解耦，归档次序无关。

## Migration Plan

1. `prisma/schema.prisma` 移除 `CustomerAddress.deletedAt` 与 `@@index([deletedAt])`；`SoftDeleteService` 新增 `softDeleteMany`。
2. **（需用户显式确认后执行）** `pnpm prisma:migrate:dev --name drop_customer_address_deleted_at` 生成迁移；在生成的 `migration.sql` 中 `DROP COLUMN` 前追加防御性 `DELETE FROM "customer_addresses" WHERE "deletedAt" IS NOT NULL;`（列已在 Prisma 层移除，`migrate dev` 自动产出 `ALTER TABLE "customer_addresses" DROP COLUMN "deletedAt";` 与索引清理）。
3. 代码清理：Mall/Admin 读路径移除 `deletedAt` 判断；`Inquiry.removeMany` 改调 `softDeleteMany`。
4. 回滚：迁移为纯删列，回滚需 `ADD COLUMN "deletedAt" TIMESTAMP(3)`（历史数据无列值，回滚后行为等同当前硬删，无数据损失风险）。

## Architecture Review Adoption

架构审查（2026-09-17）对 4 份规划件提出 3 个 deepening 候选，用户已预授权「同意推荐」，结论如下（全部采纳）：

### 候选 1（Strong，采纳）— 共享地址可见性 seam

新增 `ADDRESS_ACTIVE_WHERE` 常量（置于 `packages/core`，对标 `ACTIVE_FILTER_WHERE`），封装「地址可见 = 归属当前 `customerId` 且记录存在」的单一谓词；Mall（`findMyAddresses`/`assertOwned`）与 Admin（`findAll`/`findOne`/`update`/`setDefault`/`remove`）读路径均从此导入，不再各自手写 `where`。**收益**：可见性规则 locality 收进一个 module；一个谓词 leverage N 个读站点；删列后不会残留死条件写法。见 tasks 2.2/2.3 增补。

### 候选 2（Worth exploring，采纳）— CustomerAddress 硬删收进一个 module（两个 adapter）

新增 `CustomerAddressDeletion` module，暴露 `removeForOwner(tx, customerId, addressId)` 与 `removeMany(ids)`；Mall 提供 owner-check adapter、Admin 提供 operator adapter，**保留两个信任维度不合并**（与 `customer-addresses.service.ts:16-20` 的设计意图一致）。三处内联 `delete`/`deleteMany` 收敛为一个 interface。**收益**：删除逻辑 locality 在一个 module；删除策略被命名（depth）；3 站点 → 1 interface。见 tasks 2.5 增补。

### 候选 3（Speculative，采纳最小化 + 否决重方案）— 显式命名删除策略

**采纳最小化**：在删除 seam 处加显式 `DeleteStrategy.Hard` 标记（或一行 ADR 引用），记录 CustomerAddress 为有意 opt-out，使删列决策不在代码里「消失」。
**否决**把 CustomerAddress 路由进 `SoftDeleteService` 的更重方案：① 与 Mall/Admin 两个信任维度拆分冲突；② 与 P0-2 的 `onDelete: SetNull` 继承互斥（软删不触发物理删除 → `SetNull` 永不触发 → 悬挂引用无法清理）。**收益**：决策 locality 在 seam 处；opt-out 显式，死列陷阱不可复发。见 tasks 2.6 增补。
