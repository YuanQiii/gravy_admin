## 1. 聚合 module（新）

- [ ] 1.1 新增 `packages/domain/src/inquiry/pricing/inquiry-pricing.service.ts`（providers-only，只注入 `PrismaService`）：`deriveLineSubtotal(quantity, unitPrice)` 纯函数 + `recomputeForInquiry(tx, inquiryId)`。`recomputeForInquiry` 用**一次 SQL/Decimal 聚合**求未软删明细行 `subtotal` 之和（`unitPrice` 为空的行计入 `null`，不参与求和；全部为空或无行 → `totalAmount = null`），并 `update` 该询价单。函数上方加注释说明"不得改成 JS `number` 逐行相加"及其原因。验证：单测断言 `unitPrice = null` 时 `subtotal` 为 `null` 而非 `0`；三条 `0.1`/`0.2` 类小数相加结果精确等于 `0.3`。
- [ ] 1.2 在 inquiry 的模块定义中注册并导出该 Service（两个消费方各自注入）。验证：`pnpm build` 通过；`grep -rn "InquiryPricingService" packages/domain/src apps/*/src` 命中"定义 1 处 + 注入 2 处"。
- [ ] 1.3 barrel：仅当控制器/Swagger 需要时才从 `packages/domain/src/index.ts` 导出；否则不导出（不扩大公开面）。验证：`grep -n "InquiryPricing" packages/domain/src/index.ts` 结果与决定一致。

- [ ] 1.4 精度约束升级为编译期约束（design 决策 9）：导出 branded type（如 `Money = Decimal & { readonly __money: unique symbol }`），`deriveLineSubtotal` 与内部聚合签名只接受 `Money`/`Decimal`。验证：写一行 `const t: Money = 1.5` 应编译失败（临时验证后还原）；`tsc -p packages/domain/tsconfig.json` 通过。

## 2. 明细行写路径：收成一条 writeLine 接缝（design 决策 8）

- [ ] 2.1 `InquiryLinesService` 新增私有 `writeLine(tx, op, args)`：派生 `subtotal`（调 `deriveLineSubtotal`）→ 执行写（create/update/delete/deleteMany 四种 op）→ 无条件调 `recomputeForInquiry(tx, inquiryId)`。四个公开出口 `create`/`update`/`remove`/`removeMany` 全部改为对它的单次调用，删除各自内联的 `subtotal: dto.subtotal ?? null`。验证：`grep -n "recomputeForInquiry" packages/domain/src/inquiry/inquiry-lines/inquiry-lines.service.ts` 只在 `writeLine` 内命中；`grep -c "async create\|async update\|async remove" ` 各出口的 body 长度显著下降（人工复核）。
- [ ] 2.2 `update` 的 subtotal 重算规则：`quantity`/`unitPrice` 任一出现在 patch 中即重算；两者都不出现则保持原值（避免"只改 remarks"时把人工值抹掉）。验证：单测覆盖「只改 quantity」「只改 unitPrice」「只改 remarks」三种输入。
- [ ] 2.3 删除路径同样经 `writeLine`：`remove` 与 `removeMany` 删除后在同一事务内重算。验证：单测断言删除后 `recomputeForInquiry` 被调用（mock 断言）。
- [ ] 2.4 DTO 收窄：`CreateInquiryLineDto` / `UpdateInquiryLineDto` 移除 `subtotal`。验证：e2e 断言请求体携带 `subtotal` 时返回 400。

## 3. 询价单写路径：totalAmount 派生 + 报价时重算

- [ ] 3.1 `InquiriesService.create` / `createForCustomer`：不再接受 `totalAmount`（`CreateInquiryDto` 移除该字段），创建时 `totalAmount = null`（新建无明细或明细无价）。验证：单测断言创建结果 `totalAmount` 为 `null`；e2e 断言请求体携带 `totalAmount` 返回 400。
- [ ] 3.2 `UpdateInquiryDto` 改为 `PartialType(OmitType(CreateInquiryDto, ['shippingAddressId', 'totalAmount'] as const))` —— 两个**创建期字段**一并移出更新契约：`totalAmount`（见 3.1）与 `shippingAddressId`（**并入的 W1 修复**，见下）。验证：单测断言该 DTO 的字段集不含这两个键；e2e 断言 `PATCH /inquiry/inquiries/:id` 携带任一字段 → 400，且该单据的 `shippingAddressId`、7 个快照字段与 `totalAmount` **逐字段不变**。
- [ ] 3.3 `updateStatus`：流转到 `quoted` 后调用 `recomputeForInquiry`（复用事务或在接缝调用之后紧接着执行），使"报价动作"与"合计落定"在同一次请求内完成。验证：单测断言流转到 `quoted` 后调用了重算；结合 `resolve-inquiry-expiry-semantics` 的 `expiresAt` 校验，两者顺序无依赖。
- [ ] 3.4 **（W1，并入自 P0-2 的验证报告）** 在 `update` 的方法注释与 `UpdateInquiryDto` 的类注释中写明"换址/改价 = 新建一张询价单"的语义，使后来者不再把它当作遗漏的功能（此前 `...rest` 透传让 PATCH 能改写履约依据，见 `openspec/changes/archive/2026-09-17-snapshot-inquiry-shipping-address/verification-20260917.md` 的 W1）。验证：两处注释存在；`grep -n "shippingAddressId" packages/domain/src/inquiry/inquiries/inquiries.service.ts` 在 `update` 方法体内**无**命中。

> **本 delta 已跨变更重放**：`snapshot-inquiry-shipping-address`（P0-2）归档时把主规格「询价单创建」从 3 个场景扩到 5 个（新增「创建时写入地址快照」「未提供地址时快照为空」）。本变更的 MODIFIED 块写在其归档之前，`openspec validate --strict` 因此报 `MODIFIED "询价单创建" omits scenario(s)`。现已按 P0-2 合并后的主规格**重放**该块（描述并入快照语义，场景 5 + 3 原有 + 1 新增 = 9），并在其中**并入 W1** 的条款与场景。

## 4. 迁移与存量回填（需用户确认后执行）

- [ ] 4.1 写核查 SQL（只读，先跑）：输出会被改动的 `inquiry_lines` 行数与差额分布、`inquiries.total_amount` 与按明细重算值的差异行清单。验证：结果记入变更备注；若差异行数超预期（例如 > 存量 10%）则**暂停并上报**，不自动放行。
- [ ] 4.2 生成迁移（**需用户显式确认**，仓库硬规则）：回填 `subtotal = quantity * unit_price`（仅 `unit_price IS NOT NULL` 的行）+ 重算 `total_amount`。`unit_price` 为空的行**保持原值不动**（若历史值非空则保留并记录）。验证：迁移文件含两条 `UPDATE`；在本地 dev 库上 `migrate dev` 成功；回填后抽样 3 张询价单核对 `totalAmount = Σ subtotal`。
- [ ] 4.3 回填后跑一次核查 SQL 确认差异归零。验证：同一 SQL 返回空集。

## 5. 文档与验收

- [ ] 5.1 Swagger 描述同步：`subtotal` / `totalAmount` 标注「由服务端派生，不接受客户端传入」；请求 DTO 的字段删除后重新生成文档。验证：`pnpm build` 后 Swagger 中两个字段描述为新文案。
- [ ] 5.2 核对 admin 前端调用点是否传过 `totalAmount`/`subtotal`（**BREAKING** 影响面）。验证：`grep -rn "totalAmount\|subtotal" apps/admin/src` 逐一确认；结果记入变更备注。
- [ ] 5.3 端到端：客户创建带明细的询价单 → admin 为明细填价 → 客户查询详情断言 `subtotal = quantity × unitPrice` 且 `totalAmount = Σ subtotal`。验证：`pnpm test:e2e` 相关套件全绿（可与 `inquiry-detail-lines.e2e-spec.ts` 合并用例）。
- [ ] 5.4 归档时把 delta 合并进 `openspec/specs/inquiry/spec.md`；**注意与 `snapshot-inquiry-shipping-address` 的串行顺序**（design 决策 6）：必须以对方合并后的主规格为基准重放本变更的 MODIFIED「询价单创建」，并核对合并后该 Requirement 同时含地址快照与合计派生两组约束。验证：合并后 `grep -n "shippingReceiver\|totalAmount" openspec/specs/inquiry/spec.md` 两组约束均在；`openspec validate --specs` 通过。
- [ ] 5.5 评估 `docs/adr/0014` 决策 5（"聚合划归 admin 职责"）是否需补一句"已由 `derive-inquiry-price-aggregates` 落实"；**本次不改 ADR 文件**，记录结论。验证：给出"需要/不需要 + 理由"一句话结论。
