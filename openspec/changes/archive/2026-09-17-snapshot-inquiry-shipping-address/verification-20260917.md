# 验证报告：`snapshot-inquiry-shipping-address`

- 日期：2026-09-17
- Schema：`spec-driven`（四件规划件齐备 → 三个维度全部检查，无跳过项）
- 验证时进度：**16/17 任务**

## Summary

| Dimension | Status |
|---|---|
| Completeness | 16/17 tasks；2/2 Requirement 有实现 |
| Correctness | 10/10 Scenario 均有实现证据（1 条无测试覆盖，见 WARNING 2） |
| Coherence | design 决策 1–7 全部落实；1 处任务措辞偏离已在 tasks 中记录 |

## CRITICAL（归档前必须处理）

1. **4.4** `tasks.md:30` — 归档时用 delta 更新 `openspec/specs/{inquiry,customer}/spec.md`。这是 `/opsx-archive` 的动作本身，**由本次归档满足**；不构成实现缺口。→ 无需额外处理。

**没有任何「实现未做但任务勾了」或「任务未勾但实现已做」的错配。**

## WARNING

- **W1｜PATCH 可以改地址引用而不动快照，产生「引用与快照分属两个地址」的状态。**
  `InquiriesService.update`（`packages/domain/src/inquiry/inquiries/inquiries.service.ts:519-528`）用 `const { expiresAt, ...rest } = dto` 后整块 spread，而 `UpdateInquiryDto extends PartialType(CreateInquiryDto)` 仍声明 `shippingAddressId`（`create-inquiry.dto.ts:53`）。因此后台 PATCH 可以把引用换成另一张地址，而 7 个快照字段保持原值 —— 响应里 `shippingAddressId` 指向 B、`shippingReceiver` 是 A 的内容。规格只写了"地址的修改/删除不影响快照"，**未定义"询价单自身换引用"该怎样**，也没有测试。
  → 建议二选一并落进规格：(a) 引用在创建后**不可变**（`update` 显式剔除 `shippingAddressId`，与"快照是创建时点冻结的商业事实"一致）；(b) 允许改引用，但**在同一事务内重解析快照**（复用 `resolveShippingSnapshot`）。我倾向 (a)：换址应等价于换一张单据，而不是悄悄改写履约依据。
- **W2｜Scenario「地址修改不回溯已创建询价单」无测试覆盖。**
  结构上成立（`CustomerAddressesService` 只写 `customer_addresses`，没有任何路径更新 `inquiries.shipping*`），但没有任何用例断言它。→ 建议补一条便宜的断言：e2e 里 `PATCH /addresses/:id` 后 `GET /inquiries/:id` 断言快照逐字不变；或单测断言 `CustomerAddressesService.updateForCustomer` 不触碰 `inquiry` 模型。

## SUGGESTION

- **S1｜`*.shape.ts` 是仓内新后缀。** 全仓 `find -name "*.shape.ts"` 无先例（`dto/` 下既有约定是 `*-response.dto.ts` / `*-request.dto.ts`）。当前文件名 `shipping-snapshot.shape.ts` 语义清楚，若要与既有约定对齐可改为 `shipping-snapshot.contract.ts` 或并入 DTO 文件。**不阻塞。**
- **S2｜tasks 1.3 的措辞与实现不一致（已在 tasks 内注明）。** 任务原文要求 "位置贴近 `INQUIRY_DETAIL_INCLUDE`（同一文件）"，实现改为 `dto/shipping-snapshot.shape.ts`（接口若留在 service，DTO 为 `implements` 它就会反向依赖 service）。tasks 1.3 已如实记录偏离与理由；若后续有人只读 design 决策 7，不会看到该约束（决策 7 未规定位置），无矛盾。

## Coherence 明细

| design 决策 | 实现证据 | 结论 |
|---|---|---|
| 1 · 7 个 `shipping*` 字段命名 | `prisma/schema.prisma`（7 列，全 `String?`；`information_schema` 实测 7 列 / `text` / nullable） | ✅ |
| 2 · 快照创建时点冻结、不跟随 | 无任何写路径更新 `inquiries.shipping*`（除一次性迁移回填）；DTO 单测「快照与引用可独立存在」 | ✅（覆盖见 W2） |
| 3 · 保留 `onDelete: SetNull`，不改 `Restrict` | 关系行未改动；e2e ②演练被置空后的稳态 | ✅ |
| 4 · `resolveShippingSnapshot` 唯一接缝 + 归属校验在其内部 | 定义 `inquiries.service.ts:116`；调用点 `:159`（客户，传 `customerId`）与 `:232`（管理端，传 `null`）；`INVALID_SHIPPING_ADDRESS` 全文件 **1** 处；`customerAddress.findUnique` 全文件 **1** 处 | ✅ |
| 5 · 迁移 `ADD COLUMN` 可空 + 存量回填 | 迁移已应用（`Database schema is up to date!`）；回填 SQL 在可回滚事务内实证（影响 1 行、四字段正确、零残留） | ✅ |
| 6 · 快照字段进 `InquiryResponseDto`（列表与详情同形状） | `inquiry-response.dto.ts:16`（`implements`）+ 7 字段；DTO 单测覆盖列表/详情/`null`/引用置空 | ✅ |
| 7 · shape + select 常量，避免人肉同步 | `dto/shipping-snapshot.shape.ts`（接口 + `SHIPPING_SNAPSHOT_KEYS` + 穷尽性断言）、`inquiries.service.ts:50`（select） | ✅（位置偏离见 S2） |

代码模式一致性：命名（`*-response.dto.ts`、`*.spec.ts`、`test/*.e2e-spec.ts`）、模块边界（shape 不进 barrel）、错误码沿用既有风格，均合项目惯例。

## 门禁（验证时实测）

| 项 | 结果 |
|---|---|
| `tsc -p packages/domain` | ✅ |
| `nest build` mall / admin | ✅ ✅ |
| domain 单测 | ✅ 47/47 |
| 全量 e2e | ✅ 5 套件 / 60 用例 |
| `openspec validate --strict` | ✅ |
| 迁移状态 | ✅ `Database schema is up to date!` |

## Final Assessment

**1 critical issue（即归档动作本身）+ 2 warning。** 该 critical 由本次归档满足；两个 warning 不阻塞归档，但 **W1 建议在归档后立即单独立项**（它是一条未定义的对外行为，属实现边界的补充而非本变更的缺陷）。
