## 1. 抽出 HistorySideEffect 深 module（架构审查 C1 采纳）

- [ ] 1.1 新增深 module `apps/mall/src/modules/customer-activity/history-side-effect.module.ts`（建议）：对外 interface `record(customerId, filterId, requestId?): void`，内部 `void this.activityService.recordView(customerId, filterId).catch((err) => this.logger.warn('record_view_failed', { filterId, customerId, requestId, err }))`；`.catch` 为强制项，杜绝 unhandled rejection。验证：模块存在、`record` 签名为 fire-and-forget、`pnpm lint` 通过。
- [ ] 1.2 改写 `apps/mall/src/modules/mall/browse/filter-detail.flow.ts:23-39`：`viewFilterDetail` 改为先 `const data = await findOne(...)`，再 `if (customerId) this.historySideEffect.record(customerId, filterId, requestId)`（fire-and-forget，无 await、无 try/catch），最后 `return data`。从控制器透传 `requestId`（`req.id`，见 `packages/core/src/logging/logging.constants.ts` 的 `REQUEST_ID_PROP`）。验证：grep 确认 flow 内 `recordView` 不再被直接 `await`，改为委托 `historySideEffect.record`。
- [ ] 1.3 确认 `record` 仍仅在 `customerId` 非空分支触发（匿名不写），且 `findOne` 与 `return data` 间无任何写入 await。验证：`viewFilterDetail` 在 spy `historySideEffect.record` 为 pending 时已 resolve 返回 `data`。

## 2. 失败可见性（设计 D3 + C2）

- [ ] 2.1 失败日志使用稳定 message key `record_view_failed`，携带 `{ filterId, customerId, requestId }` 字段，始终输出 `err.stack`，不静默吞掉。验证：单测中让 `recordView` reject，断言 `historySideEffect` 的 `Logger.warn` 被调用且参数含 `record_view_failed`、`requestId` 与 `err.stack`。
- [ ] 2.2 确认 `record` 内 `void` 的 promise 已挂 `.catch`，不存在裸 promise（杜绝 unhandled rejection）。验证：单测中 `recordView` reject 时 `viewFilterDetail` 正常 resolve、进程无 unhandledRejection。

## 3. 测试与验收

- [ ] 3.1 单测：spy `recordView` 让其保持 pending（不 resolve），断言 `viewFilterDetail` 已 resolve 并返回正确 `data`（off-path 契约可测，对应反转归档 D3 的确定性）。验证：测试断言 `await viewFilterDetail(...)` 在 spy 未 settle 时已返回。
- [ ] 3.2 集成验证：携带客户 token 访问 `GET /filters/:id`，断言响应在 `recordView` 完成前即返回、状态码 200、体含滤清器详情；`recordView` 完成后 DB 仍存在对应 `CustomerHistory`（upsert 生效）。验证：用延迟注入的 `recordView` spy 测响应早于写完成。
- [ ] 3.3 回归：匿名访问 `GET /filters/:id` 仍返回 200 且零 `CustomerHistory` 写入。验证：集成测试断言匿名请求后数据库无新增历史。

## 4. 文档与归档补注记

- [ ] 4.1 归档本变更前，于 ADR 0013（`docs/adr/0013-customer-history-retention-and-snapshot-policy.md`）「后果/参考」补注记：说明 `recordView` 写入自 `2026-09-10` 归档变更的 `await`（D3）改为 fire-and-forget，依据为 P2-5 延迟证据与既有失败无关性。验证：ADR 文件含本反转的注记且链接本变更名。
- [ ] 4.2 运行 `openspec validate take-history-write-off-request-path --strict` 通过后再归档。验证：命令退出码 0、无 MODIFIED 遗漏 scenario 报错。
