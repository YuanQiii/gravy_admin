## 1. 流转规则与副作用映射同址

- [x] 1.1 `packages/core/src/shared/constants/inquiry.constant.ts` 新增 `buildStatusPatch(toStatus, { now, expiresAt?, updatedById? })` 纯函数：`submitted` → `{ status, submittedAt: now }`；`quoted` → `{ status, quotedAt: now, ...(expiresAt ? { expiresAt } : {}) }`；`cancelled` → `{ status, cancelledAt: now }`；`expired` / `draft` → `{ status }`；`updatedById` 非 `undefined` 时并入。函数注释写明「状态与时间戳必须一致」这条不变量。验证：单测覆盖四个目标状态 + `updatedById` 有/无 + `expiresAt` 有/无（6 个用例，纯函数，无 DB）。
- [x] 1.2 在 `INQUIRY_STATUS_TRANSITIONS` 附近加注释，指向 `buildStatusPatch`，说明二者共同构成流转 module。验证：`grep -n "buildStatusPatch" packages/core/src/shared/constants/inquiry.constant.ts` 命中；barrel 导出（core 的 index）已包含。

## 2. 原子执行接缝

- [x] 2.1 `inquiries.service.ts` 新增私有 `applyStatusTransition(client, args)`，签名见 design 决策 4（语义参数：`expectedStatus` / `newStatus` / `now` / `expiresAt?` / `updatedById?` / `scope?`）。内部：调 `buildStatusPatch` → `updateMany({ where: { inquiryId, status: expectedStatus, deletedAt: null }, data: patch })` → `count === 1` 时按 `inquiryId` 回读并投影；`count !== 1` 时按 `scope` 重读归因（不存在/软删/不在 scope 内 → 404，否则 → 409 `INQUIRY_INVALID_STATUS_TRANSITION`）。**不得**回退为「按 inquiryId 无条件 update」。验证：单测断言 `updateMany` 的 `where` 含 `status` 与 `deletedAt`；断言失败归因两种分支各自抛 404 / 409；`grep -n "buildStatusPatch" inquiries.service.ts` 只在接缝内命中。
- [x] 2.2 `transitionForCustomer`：保留 `findFirst({ inquiryId, customerId })` 前置读取（404 语义不变）与 `isValidStatusTransition` 快校验（无效流转仍是快速 409，不降级为"写入失败"），随后改调接缝，传入读到的状态作为 `expectedStatus`、`scope: { customerId }`。**不**自己组装 data。验证：「非法逆向流转 → 409」用例保持通过；「失效更新 → 409 且字段不变」新用例通过；「非本人单据 → 404」用例保持通过。
- [x] 2.3 `updateStatus`：改为薄适配器，传 `newStatus` / `now` / `expiresAt: dto?.expiresAt` / `updatedById`，**不传** `scope`（管理员按权限码可见，失败一律 409）；删除内联的时间戳三元表达式。验证：单测断言接缝产出与变更前逐字段等价（`submittedAt`/`quotedAt`/`expiresAt`/`cancelledAt`/`updatedById`）。

## 3. 接口与错误语义同步

- [x] 3.1 Mall `mall-inquiries.controller.ts` 与 Admin `inquiries.controller.ts` 的 `submit`/`cancel`/`status` 端点补 `@ApiResponse({ status: 409, description: '状态已被并发流转改变，或流转不合法' })`（Swagger 描述用中文）。验证：`pnpm build` 通过，Swagger 中三个端点均可见 409。
- [x] 3.2 错误码 `INQUIRY_INVALID_STATUS_TRANSITION` 的响应描述统一为「流转不合法或前置状态已失效」，避免客户端把它理解成"请求格式错误"。验证：`grep -rn "INQUIRY_INVALID_STATUS_TRANSITION" apps packages` 的注释/描述一致。

## 4. 规格与文档同步

- [x] 4.1 delta 合并进 `openspec/specs/inquiry/spec.md`（归档动作，本次不执行）：MODIFIED「询价单状态流转」，REMOVED「询价单状态只读约束」，ADDED「客户提交与取消权限边界」。
- [x] 4.2 核对 `docs/adr/0014-inquiry-customer-submit-cancel-and-state-harden.md` 的决策描述是否已覆盖原子性要求；若 ADR 明确写了"无乐观锁即可接受"，需补更正注记（与 P0-3 结论一致）。验证：`grep -n "乐观锁\|原子" docs/adr/0014*.md`。
- [x] 4.3 归档前核对主规格结构：`询价单状态只读约束` 不再出现、「客户提交与取消权限边界」恰有一条、Requirement 总数与 REMOVED/ADDED 净增一致。验证：`grep -c "### Requirement:" openspec/specs/inquiry/spec.md` 归档前后差值为 0（-1 +1）；`openspec validate --specs` 通过。
- [x] 4.4 若 `docs/features.md` 或 `CONTEXT.md` 描述询价状态机，同步"流转原子执行"这一性质。验证：`grep -rn "状态流转" docs/ CONTEXT.md`。

## 5. 测试

- [x] 5.1 单测（`inquiries.service.spec.ts`）：① 正常流转三个方向（submit/cancel/admin quote）写对了字段；② 失效更新（读到的状态已被并发改变）→ 409 且 `updateMany` 之后无 `update` 调用；③ 重复提交 → 409；④ 非本人单据 → 404（既有用例保持）。验证：`pnpm test` 通过。
- [x] 5.2 单测（core）：`buildStatusPatch` 六种输入，含 `expired` 不产生新时间戳。验证：`pnpm test` 通过。
- [x] 5.3 e2e：对同一 `draft` 询价单连续发起 `submit` 与 `cancel`，断言首个 200、次个 409，且**后续 GET 详情中 `status` 与时间戳不矛盾**（同时校验 `status === 'submitted'` 时 `cancelledAt` 为 `null` 或不存在）。验证：`pnpm test:e2e` 相关套件全绿。
- [x] 5.4 数据核查（只读，不改数据）：提供一条 SQL 供运维在生产确认是否已存在 `status` 与时间戳矛盾的存量记录（`status='submitted' AND "cancelledAt" IS NOT NULL` 等），结果记入变更备注；有命中则单独立项回填。验证：SQL 在本地 dev 库执行返回 0 行（或如实记录命中数）。**已执行（dev 库，存量 2 行）：submitted∧cancelledAt / cancelled∧submittedAt|quotedAt / quoted∧cancelledAt / draft∧任一时间戳 四组核对全部为 0，无脏数据。**

## 归档记录（2026-09-17）

- 4.1：MODIFIED「询价单状态流转」（场景 2→**5**，补原子性与时间戳一致三段描述）、REMOVED「询价单状态只读约束」、ADDED「客户提交与取消权限边界」（5 场景，置于原 Requirement 位置）；主规格 Requirement 总数 11 不变（-1+1）；`validate --specs` 10/10。
- 4.3：旧名 0 命中、新名恰 1 条、总数核对通过。
- **连锁（第 4 次）**：`resolve-inquiry-expiry-semantics` 的「询价单状态流转」MODIFIED 块失效（缺 3 个原子性场景），已重放（4→**7** 场景，描述并入原子性段）。全量 15 个变更重查后 0 失效。

## 实施记录（2026-09-17）

- **接缝**：`applyStatusTransition(client, args)`（`inquiries.service.ts`）—— `updateMany({ where: { inquiryId, status: expectedStatus, deletedAt: null } })` → `count !== 1` 时按 `scope` 重读归因（404 / 409）；成功后回读并投影。字段映射完全交给 `buildStatusPatch`（core），service 内不再拼任何时间戳三元表达式。
- **两个适配器**：客户路径传 `scope: { customerId }`（他人单据 → 404）+ 前置 `findFirst` 保留；管理端不传 scope（失败一律 409），`updatedById: updatedById ?? null` 保持原有"始终写操作人"的语义。
- **门禁**：`tsc` core/domain ✓；mall/admin build ✓；domain **63/63**（+4：条件写 where 断言、失效更新 409 且无 update 退路、重复提交不触达写入、quoted 写 expiresAt/updatedById + 不传时不清空）；core **105/105**（+9：`buildStatusPatch` 6 输入 + 互斥断言 + `isValidStatusTransition` 反向/自环）；全量 e2e **6 套件 / 65 用例**（新增 `test/inquiry-status-transition.e2e-spec.ts` 3 例，含"陈旧 draft 视图 → 409 + 详情自洽"）。
- **文档核对结论**：4.2 —— ADR 0014 未对状态流转的并发语义作任何承诺（唯一"原子"字样指明细行删除粒度，无关），**无需更正注记**；4.4 —— `CONTEXT.md:49` 描述了状态序列，已补一句"Transitions execute **atomically** …; a conflicting concurrent transition returns 409 and writes nothing"。**顺带发现**：CONTEXT.md 同一行还写着 `INQ{YYYYMM}-{4-digit seq}` 与 "price snapshot/aggregation is the admin-quote domain"，分别会被 **P1-1**（编号 6 位）与 **P3-6**（聚合派生）改写——这两个变更归档时必须同步该行。
- 剩余：4.1 / 4.3（归档动作）。**未提交。**
