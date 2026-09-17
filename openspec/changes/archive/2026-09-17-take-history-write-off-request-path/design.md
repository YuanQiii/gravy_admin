## Context

`GET /filters/:id` 是匿名也可访问的热点只读端点，由 `MallFiltersController.findOne`（`apps/mall/src/modules/mall/browse/mall-filters.controller.ts:58`）薄透传给 `FilterDetailFlow.viewFilterDetail`。该 flow 在返回可见性数据前 `await recordView`（`filter-detail.flow.ts:23-39`），而 `recordView` 在单一事务内执行 `upsert` + `findMany(skip:100)` + 可能 `deleteMany`（`customer-activity.service.ts:215-237`）——3+ 次 DB 往返，使登录客户的详情 P95 被写路径拖累。

已核实的现状（非照抄审查报告）：
- **失败确实不影响响应**：`filter-detail.flow.ts:29-36` 的 `try/catch` 仅 `logger.warn` 且只包住 `await recordView`。本次只解除**延迟耦合**，不改「失败不打挂浏览」这一既有不变量。
- **索引已存在**：`CustomerHistory` 有 `@@index([customerId, visitedAt])`（`prisma/schema.prisma:828`），迁移 `20260910011104_customer_history_customer_id_visited_at_index` 已建 `customer_history_customerId_visitedAt_idx`。故 `findMany(skip:100)` 走索引 seek，非全表扫描；报告「每次写都全量有序扫描」的严重程度因此被削弱。
- **100 条上限来源一致**：`HISTORY_LIMIT=100`（`customer-activity.service.ts:57`）+ spec「浏览历史管理」+ ADR 0013（`:18-24` 写入事务内淘汰）。本次不动该上限与淘汰语义。
- **既有决策张力**：归档变更 `2026-09-10-close-mall-customer-activity-loop` 的 **D3** 曾为「确定性、可测」显式选择 `await`。本次依据新延迟证据反转该选择，并补齐 D3 缺失的失败可见性论证。

## Goals / Non-Goals

**Goals:**
- 让 `GET /filters/:id` 的响应延迟与登录/匿名一致，登录客户不再因历史写被拖慢。
- 保持「失败不影响响应」不变量，并把写失败的**可见性**显式化、可观测。
- 范围仅限 `FilterDetailFlow.viewFilterDetail` 内的历史写入链路。

**Non-Goals:**
- 不改 `recordView` 的淘汰逻辑、`HISTORY_LIMIT`、索引或任何数据模型。
- 不做「全局 fire-and-forget 化」改造（仅此一处公开只读热路径）。
- 不引入指标/监控基础设施（本仓库当前仅有 logging 模块，无 metrics 模块；见 D3）。
- 不改匿名访客行为与任何对外响应契约。

## Decisions

**D1 · 采用 fire-and-forget 让写历史脱离响应主链路**
- 做法：`viewFilterDetail` 内将 `await this.activityService.recordView(...)` 改为 `void this.activityService.recordView(customerId, filterId).catch((err) => this.logger.warn(...))`；`const data = await findOne(...)` 与 `return data` 之间不再有写阻塞。
- 理由：这是直接消除 P2-5 延迟耦合的杠杆；既有 try/catch 已证明写失败与响应无关，fire-and-forget 是把「已无关」升级为「已解耦」。登录/匿名延迟对齐。
- 备选否决（保持 `await`）：保留 await 即保留 P2-5 现状，不可取。否决。

**D2 · 保留「写入事务内按阈值淘汰」，不采纳「按计数阈值触发淘汰」**
- 做法：`recordView` 的 `upsert` + `findMany(skip:100)` + `deleteMany` 整体作为 fire-and-forget 后台事务运行，逻辑不动。
- 理由：① 既有 `(customerId, visitedAt)` 索引使 `skip:100` 为廉价索引 seek，「每次写全量扫描」不成立；② 写已脱离响应主链路，其 DB 耗时不再进入用户可见延迟；③ 阈值淘汰需先 `count` 再决定，反而新增一次往返，边际收益被索引与 off-path 双重中和。故阈值淘汰在本变更内**不采纳**。
- 备选否决（count 阈值淘汰）：收益不足且增加复杂度。否决（若未来写放大成为 DB 侧瓶颈，可单列变更重评）。

**D3 · 失败可见性方案（fire-and-forget 的必补项）**
- **收进一个深 module（架构审查 C1 采纳）**：detached 写与失败可见性**不内联在 `FilterDetailFlow`**，而是收束进一个深 module `HistorySideEffect`（建议落地于 `apps/mall/src/modules/customer-activity/`），对外暴露单一 interface `record(customerId, filterId, requestId?): void`。`FilterDetailFlow` 仅调用该 interface（fire-and-forget），不再持有 `.catch` / warn / 可见性逻辑。这样「失败如何被看见」获得 locality（集中一处、可单测），flow 的 interface 收窄为纯编排。
- **禁止 unhandled rejection（强制）**：仓库无全局 `process.on('unhandledRejection')` 处理器；Node 默认 `--unhandled-rejections=throw` 下裸 reject 会终止进程。因此 `HistorySideEffect.record` 内部的 `void promise.catch(...)` 是强制项而非可选项。
- **结构化、可检索的 warn**：复用既有 `Logger.warn(message, stack)` 约定，日志携带**稳定 message key `record_view_failed`** 与字段 `{ filterId, customerId, requestId }`，便于 grep / 告警规则匹配；**始终输出 `err.stack`**，绝不静默吞掉。
- **指标取舍**：仓库当前只有 `packages/core/src/logging/`（请求 ID + 访问日志拦截器，`request-log.interceptor.ts`），**无 metrics 模块**。本变更**不新增大局指标基础设施**；失败可见性以「日志告警」实现。若未来引入 metrics 模块，应补 `record_view_failure_total` 计数器（列为后续候选，非本变更范围）。
- **requestId 关联（架构审查 C2 采纳，窄化）**：为让 detached warn 重新并入 `RequestLogInterceptor` 的请求日志，`viewFilterDetail` 由控制器透传 `requestId`（控制器已可通过 `req.id` 取到，见 `logging.constants.ts` 的 `REQUEST_ID_PROP`）给 `HistorySideEffect.record`。由此修正 D3 初稿「不传 requestId」的让步——关联断点改为经既有 logging seam 闭环，无新增职责。
- 备选否决（不记录只 fire）：会致失败完全不可见，违背可观测性。否决。
- 备选否决（全局泛化 fire-and-forget runner）：超出本变更范围边界（仅此一处公开只读热路径），见 D4。否决。

**D5 · 架构审查采纳结论（grilling，用户预授权「同意推荐」）**
- **C1（Strong）→ 采纳**：抽出 `HistorySideEffect` 深 module 独占 detached 写 + 失败可见性，落点见 D3 与 tasks §1/§2。
- **C2（Worth exploring）→ 采纳（窄化）**：经已有 logging seam 透传 `requestId` 使 warn 重连请求日志，落点见 D3 `requestId 关联` 与 tasks §1.1/§2.1。
- **C3（Speculative）→ 否决（留作独立后续变更）**：按 D2，`(customerId, visitedAt)` 索引已使 `skip:100` 为廉价 seek、写已 off-path，阈值淘汰边际收益被中和且新增一次 `count` 往返；不纳入本变更，若未来写放大成为 DB 侧瓶颈可单列变更重评。

**D4 · 范围边界**
- 仅改 `FilterDetailFlow.viewFilterDetail` 一处写入链路；不动 `CustomerActivityService`、`HistoryController`、收藏或其它 fire-and-forget 场景。避免范围蔓延。

## Risks / Trade-offs

- **[失败不可见]** fire-and-forget 若漏挂 `.catch` 会静默丢失写入错误 → 缓解：D3 强制 `.catch` + 稳定 message key `record_view_failed` + 始终打 `err.stack`；验收用例断言 `recordView` reject 时仍打 warn、且详情响应正常返回。
- **[未处理 rejection 致进程退出]** 裸 reject 在 Node 默认策略下可终止进程 → 缓解：D3 的 `.catch` 是强制实现项；apply 阶段以 lint/单测守住（spy `recordView` resolve/reject，断言流程未抛、response 已返回）。
- **[best-effort 偶发丢记录]** 响应已返回、进程在写完成前崩溃会丢一条历史 → 缓解：历史本就是 best-effort 副作用（原 await 路径失败也静默丢弃），语义一致，可接受；文档化于 spec「浏览历史写为非阻塞副作用」场景。
- **[确定性/可测性下降]** 反转归档 D3 失去「调用完成才返回」的确定性 → 缓解：新增单测断言「`recordView` 未完成（pending）时 `viewFilterDetail` 已 resolve 并返回正确 `data`」，把 off-path 行为本身变成可测契约。
- **[日志噪音]** 仅失败才 warn，正常路径零新增日志；无显著增量。
- **[淘汰查询索引使用]** 已核实 `(customerId, visitedAt)` 索引存在，无需补 `select`（当前 `select: { historyId: true }` 已足够，`visitedAt` 由 `orderBy` 走索引，不进投影），不改动淘汰查询投影。
