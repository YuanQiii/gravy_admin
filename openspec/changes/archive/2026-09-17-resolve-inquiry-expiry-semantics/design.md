## Context

现状：`packages/domain/src/inquiry/inquiries/inquiries.service.ts` 的 `expireDueQuoted()`（L340-349，私有，`updateMany { status:'quoted', expiresAt: {lte: now}, deletedAt: null } → { status:'expired' }`）在 4 个读路径前置调用：`findMyInquiries` L269、`findOneForCustomer` L292、`findAll` L384、`findOne` L427。它同时满足三件错事：① 把写塞进只读端点；② 无视 `customerId`/权限做全表扫描式更新；③ 与 ADR 0014 决策 5「Mall 不做自动过期 job、不做被动过期展示；过期归 admin/ops 职责」冲突。代码注释 L337-338 自陈「无调度基础设施，故用读时补流转」。

约束（已核实）：

- 仓库无任何调度基础设施：`@nestjs/schedule` / `SchedulerModule` / `@Cron` / `node-cron` / `bullmq` / `@nestjs/bull` / `setInterval` 在全部 `package.json` 中均不存在（SQL 中的 "CRONER"/"MICRONFILTER" 为数据误匹配）。
- `atomic-inquiry-status-transition`（未归档）已把 `updateStatus` 改造为条件写 + `buildStatusPatch` 接缝，并在 design.md risk 4 显式把 `expired` 流转的「是否走接缝」交给本变更决策；它不修改 `expireDueQuoted`。
- ADR 0014 决策 5 仍生效，要求过期归 admin/ops、Mall 不做被动过期展示。

## Goals / Non-Goals

**Goals:**

- 消除读路径写：列表/详情查询恢复只读，可走只读副本，不再与真实写入争锁。
- 消除文档/实现不一致：以单一语义（派生展示态 + 人工过期）作为真值。
- 消除「永久报价」：`quoted` 必须带 `expiresAt`。
- 复用既有状态流转接缝，不为过期新增写路径。

**Non-Goals:**

- 不引入任何定时任务 / 队列 / 调度依赖。
- 不修改 `atomic-inquiry-status-transition` 的任何文件；不为 `expired` 新增独立写路径。
- 不回填历史 `quoted ∧ expiresAt=null` 数据（遗留行继续为永久 quoted，由人工处理）。
- 不改变 `INQUIRY_STATUS_TRANSITIONS`（`quoted→expired` 仍合法，仅限人工）。

## Decisions

### 1. 选定路线：派生展示态 + 移除读路径写（而非「承认被动过期」）

理由：仓库无调度基础设施（已核实），「承认被动过期」两子选项均不可取——(a) 后台定时任务需新增 `@nestjs/schedule` 整模块与依赖，与本仓刻意不调度的姿态相悖且成本高；(b) 收敛为按 `customerId`/`id` 作用域仍是在读路径写，仍违反「读路径不写」、仍无法走只读副本、仍与 ADR 0014 决策 5 冲突。本路线零新增依赖、零新增基础设施，直接消除写放大与锁竞争，并贴合 ADR 核心意图（Mall 无自动过期 job、过期是 admin/ops 显式动作）。

*备选否决*：承认被动过期（改 ADR 0014 决策 5）。否决——要么引入调度基建（成本高、偏离本仓姿态），要么保留读路径写（治标不治本，仍与「读路径不写」原则冲突）。

### 2. 物理 `expired` 仅由后台人工流转抵达，复用 `buildStatusPatch` 接缝

移除 `expireDueQuoted` 后，`expired` 只能经 `updateStatus` 的 `quoted→expired` 显式流转产生。该路径正由 `atomic-inquiry-status-transition` 改造为 `applyStatusTransition`/`buildStatusPatch` 条件写接缝（其 design.md 决策 3 已为 `expired` 备好补丁形状、risk 4 点名由本变更决定接缝复用）。本变更**不新增任何过期写**，仅声明：手动 `quoted→expired` 必须走该接缝；派生 `isExpired` 是投影层纯读取，与接缝无竞争。不在本变更触碰 `atomic-inquiry-status-transition` 文件。

*备选否决*：让 `expired` 走一条独立的 `updateMany` 直写。否决——会与接缝重复、制造第二处裸 `status` 写，违背该并行的「执行只有一处」目标。

### 3. `submitted → quoted` 强制 `expiresAt`（纳入范围，BREAKING）

理由：若不强制，quoted 行 `expiresAt=null` 时派生 `isExpired` 永为假，回到「永久报价」，本变更目标落空。强制后 `isExpired` 对所有 quoted 行一致可用。

兼容性影响（BREAKING）：admin 报价接口（`updateStatus` 至 `quoted`）由「可选 expiresAt」变为「必填」。`UpdateInquiryStatusDto` 需在校验层对 `status=quoted` 要求 `expiresAt`（如 class-validator 条件校验或控制器前置校验）；Swagger 与既有测试须同步。既有 admin 报价调用方未传 `expiresAt` 者将 400。遗留 `quoted ∧ expiresAt=null` 数据不回填，继续为永久 quoted，由人工过期或保留。

*备选否决*：保持 `expiresAt` 可选。否决——无法消除「永久报价」，派生展示态失去意义。

### 4. 派生 `isExpired` 落在 Admin 与 Mall 两侧响应；重界定 ADR 0014 决策 5 的「被动过期展示」

`isExpired` 为只读派生布尔（`status='quoted' ∧ expiresAt<now`），不改 `status`、不落库，Admin 与 Mall 响应均携带，使客户不再看到「过期却仍显示 quoted」。ADR 0014 决策 5 所禁的「被动过期展示」重界定为：**读路径的状态变更写** 与 **Mall 侧的自动过期 job**；纯只读派生标记（永不改动权威 `status`）不在其列。该重界定以 ADR 更正注记（tasks 动作项）落地，不改动 ADR 既有正文。

*备选否决*：仅 Admin 显示 `isExpired`、Mall 仅显示权威 `status`。否决——客户侧仍会出现「过期却显示 quoted」的半闭环，与 P1-3 现象一致，未真正修复。

## Risks / Trade-offs

1. **[BREAKING：admin 报价必填 expiresAt]** → 同步 `UpdateInquiryStatusDto` 校验 + Swagger + 既有测试；遗留未传 `expiresAt` 的调用方会 400。
2. **[历史 quoted ∧ expiresAt=null 行]** → 继续为永久 quoted，`isExpired` 恒假；列入 tasks 只读核查 SQL，命中再单独立项，不在本变更回填。
3. **[读路径不再自动过期]** → 若 admin 未及时人工过期，客户侧 `status` 仍为 quoted、仅 `isExpired=true` 提示；这是 ADR「过期归 admin/ops」的既定分工，非回归。
4. **[ADR 重界定需共识]** → 以 tasks 中的更正注记动作项固定，避免再次文档/实现分叉。
5. **[移除 4 处调用后读副本生效]** → 正面：查询可落只读副本；需确保部署侧确有副本路由，否则无可见收益（但无副作用）。

## Migration Plan

- 实现顺序：先移除 `expireDueQuoted` 与 4 调用点 → 在投影接缝（`projectInquiry`/`projectInquiryDetail`）算 `isExpired` 并加 DTO 字段 → 收紧 `UpdateInquiryStatusDto` 必填校验。
- 回滚：本变更纯删减 + 只读派生，回滚即恢复读路径写旧行为，无迁移/数据损失。
- 归档前动作：于 ADR 0014 增加更正注记，将「被动过期展示」重界定为「读路径状态写 + Mall 自动 job」，并登记本变更对决策 5 的落实。

## Open Questions

（无——路线、范围、接缝关系均已定，无需用户决策。）

## Architecture Review Follow-ups

架构审查（见 `architecture-review-P1-3-expiry.html`）对 4 份规划件给出 3 个 deepening 候选，用户已预授权「同意推荐」，结论如下（均已采纳推荐项，无否决）：

- **C1（Strong，已采纳）**：把「过期」概念收成单一 deep module。在 `packages/core/src/shared/constants/inquiry.constant.ts` 与 `buildStatusPatch` 同址新增纯函数 `isInquiryExpired(row)`，由投影接缝（`projectInquiry`/`projectInquiryDetail` 计算 `isExpired`）与人工 `quoted→expired` 流转（`buildStatusPatch`）共同引用。收益：locality（过期定义只在一处）+ leverage（一个 interface、两处 adapter）。
- **C2（Worth exploring，已采纳为前瞻 seam）**：把既有投影接缝扩展为 read adapter，使 4 个读方法经它取数、可钉到只读副本。仓库当前无副本基础设施，故本变更仅预留 seam 形状，不引入副本依赖；落地待副本就绪。收益：seam（读/写 client 分叉）+ leverage（副本即单一 adapter）。
- **C3（Speculative，已采纳=暂缓）**：在 Prisma schema 层以约束保证 `quoted ⇒ expiresAt`，把「防永久报价」下沉到数据 seam。因需迁移且存在遗留 `quoted ∧ expiresAt=null` 行，成本偏高，暂缓；DTO 校验（决策 3）暂为唯一守卫。收益：depth（守卫进 implementation）+ locality（不变量库内保证）。
