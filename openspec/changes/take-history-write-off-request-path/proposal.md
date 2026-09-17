## Why

公开只读端点 `GET /filters/:id`（`apps/mall/src/modules/mall/browse/mall-filters.controller.ts:58`，匿名也可访问）在 `FilterDetailFlow.viewFilterDetail` 内对**已登录**客户 `await` 了 `recordView` 的整段写入事务——`upsert` + `findMany(skip:100)` + 可能的 `deleteMany`，3+ 次 DB 往返（`apps/mall/src/modules/customer-activity/customer-activity.service.ts:215-237`、`apps/mall/src/modules/mall/browse/filter-detail.flow.ts:23-39`）。结果：登录客户的详情 P95 延迟被写路径拖累，而匿名客户不受影响，造成内部体验不一致，且该问题在压测中因匿名流量占比高而易被掩盖（见 `reports/mall-business-review-20260916.html` P2-5）。

事实核实（非照抄报告）：① `recordView` 失败**当前确实不影响响应**——`filter-detail.flow.ts:29-36` 的 `try/catch` 仅 `logger.warn`，且只包住 `await recordView`，所以「失败不打挂浏览」这一不变量已成立，本次只移除**延迟耦合**，不改变正确性语义；② `(customerId, visitedAt)` 索引**已存在**（`prisma/schema.prisma:828` + 迁移 `20260910011104_customer_history_customer_id_visited_at_index/migration.sql`），`findMany(skip:100)` 走的是索引 seek 而非全表扫描，因此报告「每次写都全量有序扫描」的严重程度已被该索引削弱；③ 100 条上限来源 = `HISTORY_LIMIT=100`（`customer-activity.service.ts:57`）、spec「浏览历史管理」（`openspec/specs/customer/spec.md`）、ADR 0013（`docs/adr/0013-customer-history-retention-and-snapshot-policy.md:18-24`）三方一致，本次不改变该上限与淘汰语义。

## What Changes

- 将 `FilterDetailFlow.viewFilterDetail` 内的历史写入由「`await` 同步等待」改为 **fire-and-forget**（`void recordView(...).catch(warn)`），使写路径完全脱离公开详情端点的响应主链路；可见性查询 `findOne` 与 `return data` 不再被写事务阻塞。
- 保留淘汰逻辑与其「写入事务内按阈值淘汰最旧」语义不变（`customer-activity.service.ts:215-237`），仅随 `recordView` 一起移到后台执行。
- 明确历史写为**尽力而为（best-effort）副作用**的契约：写入失败/未完成 SHALL NOT 影响详情响应、状态码或返回体。
- **不采用**「按计数阈值触发淘汰」作为本变更的一部分（理由见 design.md D2：既有 `(customerId, visitedAt)` 索引已使 `skip:100` 为廉价 seek，阈值淘汰的边际收益被中和，且会新增一次 `count` 往返）。
- 无 **BREAKING**：对外响应契约（字段、状态码、匿名/登录行为）保持不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `customer`：浏览历史管理 Requirement 增加「历史写为非阻塞副作用」场景，明确 `recordView` 调用为 fire-and-forget、其成败不耦合详情响应；其余既有 Scenario 全部保留（详见 `specs/customer/spec.md` 的 `## MODIFIED Requirements`）。

## Impact

- 代码：`apps/mall/src/modules/mall/browse/filter-detail.flow.ts`（`viewFilterDetail` 去除对 `recordView` 的 `await`，改为 `void ….catch`）。
- API：`GET /filters/:id` 响应延迟与登录/匿名一致性改善；响应体、状态码、限流（`60 req/min/IP`）不变。
- 依赖：无新增依赖、无数据表/迁移变更（索引已存在）。
- 可观测性：`recordView` 失败由「同步 warn」转为「异步 warn」，需在 design 中给出失败可见性方案（见 design.md `## Risks / Trade-offs`）。
- 关联决策：本变更**反转**了归档变更 `2026-09-10-close-mall-customer-activity-loop` 的 D3（该设计曾为「确定性、可测」选择 `await`）；本次依据新的延迟证据与既有 try/catch 已证明的失败无关性，改回 fire-and-forget，并在 design 中显式补上 D3 缺失的失败可见性论证。
