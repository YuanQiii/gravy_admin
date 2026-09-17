# 验证报告：`validate-inquiry-shipping-address-ownership`

- 日期：2026-09-17
- Schema：`spec-driven`（四件规划件齐备 → 三个维度全部检查，无跳过项）
- 验证时进度：**14/15 任务**

## Summary

| Dimension | Status |
|---|---|
| Completeness | 14/15 tasks；2/2 Requirement（1 MODIFIED + 1 ADDED）有实现 |
| Correctness | 10/10 Scenario 有实现证据 |
| Coherence | design 决策 1–4 与审查采纳 A/B/C 全部落实；决策 2 已按实现订正（见下） |

## CRITICAL（归档前必须处理）

1. **3.1** — 归档时把 delta 合入 `openspec/specs/inquiry/spec.md`。这是 `/opsx-archive` 的动作本身，**由本次归档满足**；不构成实现缺口。→ 无需额外处理。

**没有任何「实现未做但任务勾了」或「任务未勾但实现已做」的错配。**

## 已在本轮修掉的文档缺陷（验证过程中发现并已订正）

- **design 决策 2 描述了一个不可编译的写法。** 原文写"在 `CreateInquiryDto` 类上挂 `@Validate(ShippingAddressRequiresCustomerConstraint)`"；实施时实测 `TS1238`（`@Validate` 返回 `PropertyDecorator`，不能当类装饰器用）。已把决策 2 改写为实际机制（`registerDecorator` + `ClassDecorator`，导出 `ShippingAddressRequiresCustomer()`），保留理由与备选否决，并加「实现订正」段落交代原因。**这是"计划写了、实测否决"的正常回路，不是实现偏离规格。**

## WARNING

无。

## SUGGESTION

- **S1｜「管理端地址已软删被拒」无管理端专属用例。** 该场景由 `shipping-address-ownership.spec.ts` 在**纯函数层**直接覆盖（`assertShippingAddressOwned(softDeleted, 'cust-A')` 抛 400），而管理端 HTTP 层只覆盖了「错挂他人」「地址不存在」两条。由于三条判定走**同一个** seam（`resolveShippingSnapshot` → `assertShippingAddressOwned`），函数层覆盖已足以证明；补一条 e2e 只是把同一分支走一遍。→ 可选：如要齐整，在 `test/inquiry-shipping-snapshot.e2e-spec.ts` 的 Admin 段加一条 `deletedAt` 非空的行。**不阻塞。**
- **S2｜类级自定义约束是仓内首例。** 全仓此前无 `ValidatorConstraintInterface` 使用者（`grep -rln` 零命中），命名/位置（`dto/*.constraint.ts`）由本变更确定。若后续再出现跨字段约束，建议抽一个共用约定文档；现在只有一个样本，不值得预先抽象。

## Coherence 明细

| design 决策 / 采纳项 | 实现证据 | 结论 |
|---|---|---|
| 1 · 管理端 `create` 传 `dto.customerId` 作 owner | `inquiries.service.ts:158`（`resolveOwnerCustomerId({ realm: 'admin', customerId: dto.customerId })`），调用在 `$transaction` 内 | ✅ |
| 2 · 类级跨字段约束 | `dto/shipping-address-requires-customer.constraint.ts`（`registerDecorator` + `ClassDecorator`）+ `create-inquiry.dto.ts` 类上 `@ShippingAddressRequiresCustomer()` | ✅（原措辞已订正） |
| 3 · `customerId` 空 + `shippingAddressId` 非空 ⇒ 400 | DTO 约束（`ValidationPipe` 层）+ e2e 断言错误码 `SHIPPING_ADDRESS_REQUIRES_CUSTOMER` | ✅ |
| 4 · 约束仅挂管理端 DTO | `grep -c ShippingAddressRequiresCustomer .../customer-b2c/create-customer-inquiry.dto.ts` = 0；DTO 单测另有一条否定断言 | ✅ |
| 采纳 A（Strong）· 归属不变量收口为单一 interface | `shipping-address-ownership.ts` 的 `assertShippingAddressOwned`；`INVALID_SHIPPING_ADDRESS` 全 `packages/domain/src` **仅命中该文件 1 处**（错误码从 service 迁出，两个调用方不再各写校验） | ✅ |
| 采纳 B（Worth exploring）· 调用边界一次性解析 owner | `resolveOwnerCustomerId({ realm })`，两处调用点（管理端 `:158`、客户自助 `:238`） | ✅ |
| 否决 C（Speculative）· 不抽 `ShippingAddressSelection` | design 记有否决理由（删除测试不通过、仅两个消费者），未引入该模块 | ✅ |

代码模式一致性：新增文件用 kebab-case（`shipping-address-ownership.ts`、`*.constraint.ts`、`*.shape.ts`）与仓内约定一致；判定函数放在 service 同目录（紧邻使用者）、形状类型放在 `dto/`（DTO 与 service 的共同下游）；错误码沿用 `SCREAMING_SNAKE` 既有风格。

## Scenario 覆盖映射（10/10）

| Scenario | 实现 | 测试 |
|---|---|---|
| 已注册客户自助下单 | `createForCustomer` | domain 单测（既有） |
| 管理员代客下单 | `create(dto, createdById)` | e2e「管理端创建同样写入快照」 |
| 匿名询价（两字段皆空） | 两处 owner 解析 + 不读地址表 | DTO 单测「两者都不提供 → 通过」；e2e「不提供地址」 |
| 创建时写入地址快照 | `resolveShippingSnapshot` | domain 单测 + e2e ① |
| 未提供地址时快照为空 | 同上（不触发读取） | domain 单测 + e2e |
| 管理端代客下单携带有效地址 | `resolveOwnerCustomerId({ realm: 'admin' })` | domain 单测「归属该客户时通过」+ e2e（201） |
| 管理端仅传地址不传客户被拒 | 类级约束 | DTO 单测 + e2e（400 + 错误码，且未读地址表） |
| 管理端错挂他人地址被拒 | seam 归属断言 | domain 单测 + e2e（400 + `INVALID_SHIPPING_ADDRESS` + 未创建） |
| 管理端地址不存在返回 400 而非 500 | seam 存在性断言 | domain 单测（P0-2 引入）+ e2e |
| 管理端地址已软删被拒 | seam `deletedAt` 断言 | `shipping-address-ownership.spec.ts`（纯函数层；见 S1） |

## 门禁（验证时实测）

| 项 | 结果 |
|---|---|
| `tsc -p packages/domain` | ✅ |
| `nest build` mall / admin | ✅ ✅ |
| domain 单测 | ✅ 59/59（本变更 +12：约束 5 + 归属 6 + 管理端 2，替换 1 条 characterization） |
| 全量 e2e | ✅ 5 套件 / 62 用例（本变更 +2 管理端用例） |
| `openspec validate --strict` | ✅ |

## Final Assessment

**1 critical issue（即归档动作本身）。** 该 critical 由本次归档满足；无 warning，2 条 suggestion 均不阻塞。**可以归档。**
