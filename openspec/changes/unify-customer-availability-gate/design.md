## Context

客户域授权为纯所有权模型（`CustomerJwtGuard` + `@CurrentCustomer()` 注入身份，ADR 0011 决策 1）。access token 无状态：`CustomerJwtStrategy.validate`（`apps/mall/src/core/strategies/customer-jwt.strategy.ts:32-37`）仅解析 JWT payload，不查 DB/Redis；ADR 0011 决策 3 已接受此取舍，并明确否决「access token 每请求查业务状态」（代价是每个受保护请求多一次 DB 查询）。客户被禁用/软删时，仅 `customer-auth.service` 的 refresh 路径（`apps/mall/src/modules/customer-auth/customer-auth.service.ts:60, 89, 122`）校验 `status`/`deletedAt`，且**无**「禁用即撤销会话」机制（logout 仅撤销 refresh，ADR 0011 决策 4）。

现状偏差：同一语义「该客户是否还能操作」在各写路径结论分叉——`inquiries.service.ts:144-157` 查 `customer.deletedAt` 并返回 404；`customer-activity.service.ts:89-117, 215-237` 与 `customer-addresses.service.ts:51-128` 不查。Redis 能力（`packages/core/src/redis/redis.service.ts`、`cache.service.ts`，含 `isAvailable()` 降级）已具备，但本决策不依赖它。

## Goals / Non-Goals

**Goals:**
- 消除「一半查一半不查」的分叉，使所有受保护写路径对「客户可用性」结论一致。
- 使该策略成为单一、可审计的来源，防止未来再次漂移。
- 尊重已接受的 ADR 0011 无状态取舍，不引入每请求 DB/Redis 往返。

**Non-Goals:**
- 不引入守卫层/策略层的每请求客户可用性校验（不重开 ADR 0011 决策 3）。
- 不新增 `customerId` 存在性校验（软删行仍在，FK 不报错，存在性 ≡ 可用性）。
- 不处理被软删/禁用客户已累积的无主数据清理（favorites/history/addresses/inquiry）——归为独立后续动作，见 tasks T7。
- 不改动 `snapshot-inquiry-shipping-address` 与 `harden-client-ip-trust-boundary` 的任何文件。

## Decisions

### 决策 1：选定路线 ②——一致接受 TTL 内不校验，并消除分叉

**选择**：所有受 `CustomerJwtGuard` 保护的写路径在 access token TTL 内一致地**不**校验客户可用性；将这一统一策略写入 ADR 0011 决策 3 补充说明，并移除 `inquiries.service.ts:144-157` 中唯一的多余检查，达成全路径一致。

**理由**：
1. 已核实 `CustomerJwtStrategy.validate` 不读 DB/Redis（零每请求 IO）。若改走路线 ①（守卫层 `assertCustomerActive` + Redis 缓存），则每个受保护请求需新增一次 Redis 往返——这正是 ADR 0011 决策 3 已否决的「每请求查业务状态」的等价物（只是把 DB 换成了 Redis），与已接受的高并发自助域取舍冲突，且边际成本**非零**。
2. 客户域**无**「禁用即撤销会话」机制；ADR 0011 决策 3/4 已显式把「TTL 内残留权限」作为已接受取舍。路线 ② 让代码诚实地对齐这一文档化决策，而非保留一处文档外偏差。
3. 移除而非新增检查是消除分叉的**最小动作**：favorites/history/addresses 本就不查，只需「拆除」inquiry 一处即全路径一致。

**架构审查回写（采纳候选 1 — Strong）**：分叉的根因是「客户可用性」语义无单一归属 module。本变更将统一政策落地为一个真实代码边界 `CustomerAvailabilityPolicy` module——interface 暴露政策契约（如 `checksWithinTtl(): false`、`source(): 'adr-0011'`），implementation 读 ADR 0011 注记 / 常量 `CUSTOMER_AVAILABILITY_CHECKED_WITHIN_TTL = false`。所有受保护写路径引用同一 interface，而非各自隐式假设；spec 的「单一来源」由此成为可测试的 interface，而非仅文档注记。locality：政策决策只落一处；leverage：一个 interface 覆盖 N 个调用点。

**备选否决（路线 ①）**：守卫层统一谓词 `assertCustomerActive(prisma|redis, customerId)`，Redis 短 TTL 缓存。
- 否决理由：虽可复用 `RedisService`/`CacheService`（`isAvailable()` 降级），但它重开 ADR 0011 决策 3 否决的每请求校验，为每个受保护请求引入 Redis 往返（`validate` 当前零 IO，故成本真实存在）；还需新增 fail-open/fail-closed 策略（Redis 不可用时放行还是阻断），增加会话语义复杂度。若未来出现「要求即时封禁」需求，再按 ADR 0011 决策 3 附注触发条件改走此路线。

### 决策 2：以「移除」而非「补齐」达成一致

**选择**：不向 favorites/history/addresses 补 SQL 检查，而是移除 inquiry 中既有的 `customer.deletedAt` 检查。

**理由**：「逐处补 SQL」会放大无状态带来的 DB 往返、形成 N 处分散校验、与路线 ① 的守卫层缓存取舍重复，且违背 ADR 0011 决策 3。移除单点偏差是消除分叉成本最低、与架构取向最一致的路径。

### 决策 3：守卫/策略保持无状态，不新增存在性校验

**选择**：`CustomerJwtGuard`/`CustomerJwtStrategy` 维持零 DB/Redis；不校验 `customerId` 在库中是否存在。

**理由**：软删客户行仍保留，`customerId` 外键不报错，存在性校验等价于已被本决策排除的可用性校验，故一并排除。

### 决策 4（接缝）：与两个并行未归档变更的显式接缝

**Seam A — `snapshot-inquiry-shipping-address`**：该变更正在修改**同一文件** `inquiries.service.ts`（其范围：shippingAddressId 归属校验 + customer 快照填充，`inquiries.service.ts:159-167` 一带）。本决策要移除的 `customer.deletedAt` 检查（`:144-157`）与之**不重叠**（对方动归属/快照，本决策动可用性检查），但同文件需串行编辑。**本变更不修改该文件**；改为在其归档后执行移除（见 tasks T3 协调项）。运行期正交：守卫（authn）先于 controller 执行，与询价业务的地址归属/快照逻辑互不阻塞。

**Seam B — `harden-client-ip-trust-boundary`**：该变更改 client IP 解析/限流，属请求管线不同阶段（throttle/interceptor），与客户可用性门禁（authn 守卫）**无共享文件、无逻辑耦合**；本决策不触及，亦不依赖其结果。

### 决策 5（接缝）：守卫边界预置 `AvailabilityGate` 适配 seam（采纳候选 3 — Worth exploring）

**选择**：在 `CustomerJwtGuard` 与 `CustomerJwtStrategy` 之间预留一个 `AvailabilityGate` 适配 seam——interface 定义 `assertWithinTtl(customerId)` 契约，当前提供 no-op implementation（直接放行，与路线 ② 一致）。未来若出现「要求即时封禁」触发条件（见决策 1 否决项），可引入 cached implementation（Redis 短 TTL）而不修改守卫与策略内部。

**理由**：决策 1 的触发条件需要明确的插入点，否则届时需改动守卫内部逻辑。`AvailabilityGate` seam 使路线 ① 的接入成为「替换 adapter」而非「改守卫」，保持守卫 interface 稳定。adapter：no-op 现 prod，cached 未来；seam 吸收两种路线，locality 集中。

**否决候选 2（Speculative — 无主数据清理 module）**：否决作为本变更范围内的深化。无主数据清理已在 Non-Goals 明确排除，且由 tasks T7 独立跟踪（独立未来变更，经 soft-delete 事件 seam 统一清理四表）。纳入本变更会拓宽其边界，违背「仅消除分叉」的最小目标；故保留为 T7 后续动作，不在此落地。

## Risks / Trade-offs

- **[Risk] 无主数据累积** → 被软删/禁用客户在 TTL（默认 5m）内可新建 favorites/history/addresses/inquiry，形成无主数据。**Mitigation**：所有权模型阻止跨客户访问，风险仅限数据卫生；无主数据由独立软删后清理任务处理（tasks T7，Non-Goal 内）。

- **[Risk] 移除检查被视为安全回退** → `inquiries` 的 `customer.deletedAt` 检查在 ADR 0011 决策 3 下本属文档外偏差。**Mitigation**：本决策将其对齐为统一策略并显式写入 ADR 0011 补充，使行为透明、可审计；安全影响受 TTL 上限与自助域绑定数据的约束。

- **[Risk] 未来「即时封禁」需求与本决策冲突** → **Mitigation**：ADR 0011 已记录该场景需重新评估；本补充注明触发条件为出现「要求即时封禁」需求时改按路线 ①（守卫层缓存校验）。

## Migration Plan

1. 归档前：将统一策略作为 ADR 0011 决策 3 补充说明写入（tasks T1）。
2. 待 `snapshot-inquiry-shipping-address` 归档后，移除 `inquiries.service.ts:144-157` 的 `customer.deletedAt` 检查（tasks T3）。
3. 回归：守卫无状态单测 + 软删客户 TTL 内三路径端到端（tasks T5/T6）。
4. 回滚：本变更仅移除一处检查 + 文档补注记，回滚即恢复 `inquiries` 检查（若该文件未被并行变更改写）；因与并行变更同文件，回滚需先确认 `snapshot-inquiry-shipping-address` 状态。

## Open Questions

无。路线选择、接缝、回归均已在上文确定，无需延后决策。
