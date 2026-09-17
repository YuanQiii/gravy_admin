# 验证报告：`atomic-inquiry-status-transition`

- 日期：2026-09-17
- Schema：`spec-driven`（四件规划件齐备 → 三个维度全部检查）
- 验证时进度：**13/15 任务**（4.1 / 4.3 为归档动作）

## Summary

| Dimension | Status |
|---|---|
| Completeness | 13/15 tasks；3 个 delta 操作（1 MODIFIED + 1 REMOVED + 1 ADDED）全部有实现对应 |
| Correctness | 10/10 Scenario 有实现证据 |
| Coherence | design 决策 1–6 全部落实；`CONTEXT.md` 已同步 |

## CRITICAL（归档前必须处理）

1. **4.1 / 4.3** — 归档时合并 delta 并核对主规格结构（`询价单状态只读约束` 消失、「客户提交与取消权限边界」恰一条、Requirement 总数不变）。由本次归档满足，非实现缺口。

## WARNING

无。

## SUGGESTION

- **S1｜「客户不能报价或过期」无自动化断言。** 该场景断言的是"不存在的能力"（B2C 无对应路由）。结构上成立（控制器无该路由），但没有测试锁住 —— 与 `clarify-customer-registration-scope` 采纳的"公开路由清单 + 表驱动契约测试"是同一类问题。→ 若后续做路由清单，把 `POST /inquiries/:id/quote|expire` 一并纳入否定清单即可。
- **S2｜「客户流转他人询价单 → 404」无流转端点专属用例。** 现有覆盖是 `findOneForCustomer` 的 404 用例；流转端点与详情端点走同一个 `findFirst({ inquiryId, customerId })` 前置读取，实现共享、用例未共享。→ 可选补一条 `submit` 他人单据 → 404 的用例。**不阻塞。**

## Coherence 明细

| design 决策 | 实现证据 | 结论 |
|---|---|---|
| 1 · 条件写（期望状态进 WHERE） | `applyStatusTransition` 的 `updateMany({ where: { inquiryId, status: expectedStatus, deletedAt: null } })`；单测断言 where 形状 | ✅ |
| 2 · `count===0` 由接缝归因，复用既有错误码 | 接缝内按 `scope` 重读 → 404 / 409；错误码仍为 `INQUIRY_INVALID_STATUS_TRANSITION`（无新增码） | ✅ |
| 3 · 状态→字段映射与规则同址 | `packages/core/src/shared/constants/inquiry.constant.ts` 的 `buildStatusPatch`，紧邻流转矩阵；barrel 已导出 | ✅ |
| 4 · 两条路径各自保留前置读取，共用执行接缝 | `transitionForCustomer`（`findFirst({ inquiryId, customerId })` + scope）与 `updateStatus`（`findUnique`，无 scope）都只调接缝；service 内无任何时间戳三元表达式 | ✅ |
| 5 · 同向重复流转 → 409（不幂等） | spec 场景「重复提交被拒」+ domain 单测（不触达写入）+ e2e | ✅ |
| 6 · 规格漂移用 REMOVED + ADDED | delta 结构即 REMOVED「询价单状态只读约束」+ ADDED「客户提交与取消权限边界」，REMOVED 块带 Reason/Migration | ✅ |

审查采纳项（架构审查回写）：A（Strong）`buildStatusPatch` 收进接缝内部 ✅（service 不再拼任何 `data`，`grep buildStatusPatch` 仅接缝内命中）；B（Worth exploring）失败归因由接缝负责（`scope` 仅失败路径使用）✅；C（Speculative）封第二个 `status` 写入门 → 已按审查结论**不做**，记录在 design（属 P1-3 范围）✅。

## Scenario 覆盖映射（10/10）

| Scenario | 测试 |
|---|---|
| 提交询价单（记 `submittedAt`） | domain 单测（条件写 where + data.status）+ e2e「submit 成功」 |
| 非法逆向流转（`quoted → submitted`）409 | domain 单测「quoted 不可客户取消」 |
| 并发流转只有一个成功 | e2e「陈旧 draft 视图 → cancel 409」 |
| 失效更新不写入任何字段 | domain 单测「409 且 `inquiry.update` 不存在」+ e2e 同场景 |
| 重复提交被拒 | domain 单测 + e2e「重复 submit 409 且不触达写入」 |
| 客户提交本人询价单 | domain 单测（submit 置 `submittedAt`） |
| 客户取消本人询价单 | domain 单测（cancel 置 `cancelledAt`） |
| 客户不能报价或过期 | 结构性成立（无路由）；见 S1 |
| 客户流转他人询价单 → 404 | 前置读取共享实现；见 S2 |
| 后台运营执行报价（记 `quotedAt`/`expiresAt`） | domain 单测「updateStatus 流转到 quoted」（含 `updatedById`、不传 `expiresAt` 不清空） |

## 门禁（验证时实测）

| 项 | 结果 |
|---|---|
| `tsc` core / domain | ✅ ✅ |
| `nest build` mall / admin | ✅ ✅ |
| domain 单测 | ✅ 63/63（+4 接缝用例） |
| core 单测 | ✅ 105/105（+9：`buildStatusPatch` 穷尽 + 互斥 + 流转合法性反向/自环） |
| 全量 e2e | ✅ 6 套件 / 65 用例（新增 3 例） |
| `openspec validate --strict` | ✅ |
| 5.4 存量脏数据核查 | ✅ dev 库 2 行，四组"状态∧时间戳矛盾"全 0 |

## Final Assessment

**1 critical issue（即归档动作本身）。** 无 warning，2 条 suggestion 不阻塞。**可以归档。** 归档后需重跑全量 `validate --strict`：本变更 REMOVED「询价单状态只读约束」+ ADDED「客户提交与取消权限边界」会改变主规格结构，改写该区域的未归档变更（若有）需再重放。
