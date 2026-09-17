## Context

两条流转路径是同一模式的两次内联实现：

- `inquiries.service.ts` 的 `transitionForCustomer`：`findFirst({ inquiryId, customerId })` → 校验 `deletedAt` → `isValidStatusTransition(existing.status, newStatus)` → `update({ where: { inquiryId }, data })`。
- `updateStatus`（admin）：`findUnique({ inquiryId })` → 同样三步，副作用字段更多（`updatedById`、`quotedAt`、`expiresAt`）。

`update` 的 `WHERE` 只有 `inquiryId`，因此"我读到的是 draft"这件事在写入时**没有被断言**；两次调用也不在事务内，无乐观锁列。读-改-写间隙因此是真实存在的数据损坏路径：并发 `submit`(draft→submitted) 与 `cancel`(draft→cancelled) 都会通过校验，后写者覆盖，留下 `status = "submitted"` ∧ `cancelledAt ≠ null` 的组合，或反之。

流转**规则**已有单点：`packages/core/src/shared/constants/inquiry.constant.ts` 的 `INQUIRY_STATUS_TRANSITIONS` + `isValidStatusTransition`。缺的不是规则，是**执行的原子性**，以及"状态 → 时间戳字段"这层副作用的单一所有者（当前两条路径各写一遍，字段集合不同）。

## Goals / Non-Goals

**Goals:**

- 状态与时间戳不可能再落入互斥组合——由写入语句本身保证，而不是靠调用方不并发。
- 流转执行只有一处实现，两条路径退化为薄适配器；副作用的字段映射只有一个真值。
- 并发失效更新对外可观测且语义明确（409 + 不写入任何字段）。

**Non-Goals:**

- **不引入**乐观锁版本列、显式事务、`SELECT … FOR UPDATE`（见决策 1）。
- **不改** `expireDueQuoted` 的存储语义与读路径写放大（P1-3）。它的批量流转本身已是条件写（`where: { status: quoted, expiresAt: { lte: now } }`），不在本缺陷的成因内。
- **不做**同向重复流转的幂等化（见决策 5）。
- **不封闭**「直接写 `status`」的另外两扇门——`update`（PATCH 主体可携带 `status`/`expiresAt`）与 `expireDueQuoted`。架构审查候选 C（表驱动 `INQUIRY_STATUS_FIELDS` + 守卫测试扫描裸 `status:` 写入）已评估：它的主体是 `expireDueQuoted` 的去留，而那是 P1-3 的决策范围，本变更先把 `buildStatusPatch` 做成表可派生的形状（决策 3），不引入扫描断言。
- **不清理**历史脏数据（见风险 2）。

## Decisions

### 1. 条件写入：期望状态进 `WHERE`，断言影响行数

```ts
const { count } = await client.inquiry.updateMany({
  where: { inquiryId, status: expectedStatus, deletedAt: null },
  data: buildStatusPatch(newStatus, { now, expiresAt, updatedById }),
});
if (count !== 1) { /* 归因，见决策 2 */ }
```

*备选否决*：版本列（`version Int`）需要迁移 + 全路径改签名 + 客户端乐观锁语义，收益却与条件写入完全相同；`SELECT … FOR UPDATE` 需要显式事务并把行锁持有到事务结束，在高并发流转下把"写冲突"换成"锁等待"，而冲突本身是低频事件——条件写入让冲突立即失败而不是排队。

### 2. `count === 0` 的归因：重读一次，复用既有错误码

`count === 0` 有两种成因：行不存在/已软删（应 404），或状态已被并发改变（应 409）。重读该行即可区分，不需额外机制。

409 **复用** `INQUIRY_INVALID_STATUS_TRANSITION`，不新增错误码。理由：重读后 `isValidStatusTransition(当前状态, 目标状态)` 在并发场景下均为假（例如 `quoted → cancelled`、`submitted → submitted`），该错误码的语义**在本场景中是真的**；新增错误码会让客户端多一个分支，而外部行为差异为零。

*备选否决*：新增 `INQUIRY_STATUS_CONFLICT` 以区分"并发"与"非法流转"——区分对调用方没有可执行差异（两者的处置都是重新拉取当前状态），却增加一处必须长期维护的外部契约。

### 3. 「状态 → 时间戳字段」派生收成纯函数，与流转规则同址

在 `packages/core/src/shared/constants/inquiry.constant.ts` 新增 `buildStatusPatch(toStatus, { now, expiresAt, updatedById })`：把目标状态映射为字段补丁（`submitted` → `submittedAt`；`quoted` → `quotedAt` + 可选 `expiresAt`；`cancelled` → `cancelledAt`；`expired` → 无新时间戳）。

与 `INQUIRY_STATUS_TRANSITIONS` 放在同一文件，使「哪些流转合法」与「流转要写哪些字段」构成一个 module 的两半——这正是当初"状态与时间戳互斥"无人负责的根因。纯函数也给了它一个便宜且完整的测试面。

**它不面向调用方**：`buildStatusPatch` 是接缝的 implementation（决策 4），两条路径不自己组装 patch。否则"状态决定写哪些时间戳"这条不变量仍要经调用方之手，接缝就只是"带条件的 update 封装"。

### 4. 两条路径各自保留前置读取，只共用执行接缝

```ts
private async applyStatusTransition(
  client: Prisma.TransactionClient | PrismaService,
  args: {
    inquiryId: string;
    expectedStatus: string;     // 放入 WHERE，是原子性的全部依据
    newStatus: InquiryStatus;   // 目标状态
    now: Date;
    expiresAt?: string | Date;  // quoted 专用
    updatedById?: string | null; // 后台路径专用；传入即写入
    scope?: { customerId: string }; // 仅失败归因使用
  },
): Promise<InquiryResponseDto>
```

接缝内部依次：`buildStatusPatch(newStatus, {now, expiresAt, updatedById})` → 条件 `updateMany` → `count === 1` 时回读并投影；`count !== 1` 时按 `scope` 重读归因（不可见/不存在 → 404；否则 → 409）。

**前置读取各自保留**：`transitionForCustomer` 用 `findFirst({ inquiryId, customerId })` 表达「他人单据不可见 → 404」，`updateStatus` 用 `findUnique({ inquiryId })`（管理员凭权限码可见）。两者可见性语义不同，**不合并**；`scope` 只在失败路径上花钱，不改变正常路径的读取。

两个调用方因此只剩"我是谁、我能看到什么、我要去哪"三件事，接口收窄成语义参数而不是"请把 patch 拼好给我"。

### 5. 同向重复流转返回 409，不做幂等 200

规格把状态机定义为单向且终态不可逆，`isValidStatusTransition(submitted, submitted)` 为假。把它特判成幂等成功会引入"第二次 submit 返回 200 但不更新时间戳"的隐式规则，而没有任何消费方要求该行为。保持 409，并把这条语义写进规格（新增场景「重复提交被拒」）。

### 6. 规格漂移的修正方式：REMOVED + ADDED

`openspec/specs/inquiry/spec.md` 的「询价单状态只读约束」与 ADR 0014 已实现的客户 `submit`/`cancel` 相悖。本变更**移除**该 Requirement，并**新增**「客户提交与取消权限边界」——保留其意图（界定客户在状态机上的能力边界），内容按实际能力重写。REMOVED 块带 `**Reason**` 与 `**Migration**`。

*为什么不用 MODIFIED 或 RENAMED + MODIFIED*：`openspec validate --strict` 已经给出答案——MODIFIED 要求承载原 Requirement 的全部场景，而旧场景「客户无法直接提交询价单」叙述的正是要被纠正的假命题（"B2C 端点不提供状态流转接口"）。承载它就必须连同名字一起改写成另一个命题，那不如显式移除并新增：移除记录了"这句话曾经存在且是错的"，新增记录了"现在的边界是什么"。归档时的合并也因此是机械的（删一条、加一条），没有"替换整个块、场景随名字走"的模糊地带。

## Risks / Trade-offs

1. **[409 是新增的对外结果]** → 修复前该场景的结局是数据损坏，因此 409 是严格改进；但仍需同步 Swagger 描述（`@ApiResponse` 补 409）与错误码文档，否则客户端会把它当作未知错误。
2. **[历史脏数据不会被修复]** → 若生产库已存在 `status` 与时间戳矛盾的记录，本变更不写回填。列入 tasks 的核查项：给一条只读 SQL 供运维确认（`status = 'submitted' AND cancelledAt IS NOT NULL` 等），有命中再单独立项处理。
3. **[单测无法证明真并发]** → 用「顺序调用 + 中间改变状态」构造失效更新（等价于并发交错的可观测结果），并在 e2e 中对同一记录发起两次流转断言"一成一败"。真实的并行交错不做压力测试（成本高、收益低），条件的单条 SQL 已是原子性证明。
4. **[`expireDueQuoted` 仍是读路径写]** → 本变更不碰它，但它与本次接缝紧邻（同为状态写）。P1-3 决策后可能需要让 `expired` 流转也走本接缝——决策 3 的纯函数已把 `expired` 的补丁形状准备好。
5. **[新增 Requirement 而非改写既有]** → 主规格的 Requirement 数在归档时净增 1（移除 1、新增 1）。这是刻意的：REMOVED 块本身就是"此规格曾出过错的记录"，比就地抹掉更有信息量。
