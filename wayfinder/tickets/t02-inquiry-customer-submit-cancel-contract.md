# T02 · 询价客户提交/取消端点契约

label: `wayfinder:grilling`
status: open
blocked_by: T01

## Question

`mall-inquiries.controller.ts` 仅暴露 create/list/detail，客户侧按下述方向需要提交与取消，REST 契约如何定？

- 端点形态：`POST /inquiries/:id/submit`、`POST /inquiries/:id/cancel`？还是 PATCH `/inquiries/:id/status`？
- 由 `@CurrentCustomer()` 强制归属：非本人询价 404，与现有 `findOneForCustomer` 一致。
- 幂等：重复 submit/cancel 是否幂等（政治地 409 / 静默返回）？
- 与后台 `updateStatus` 的一致性：客户 submit 复用 `INQUIRY_STATUS_TRANSITIONS` + `isValidStatusTransition` 还是独立守卫？客户 cancel 是否清理 `submittedAt/quotedAt` 字段？
- request/response DTO 与 Swagger 描述（中文），`ResponseUtil.created/success` 包装。

依赖 T01 先定 CANCELLED 状态机边界。

## Resolution

（待关闭后记录；map 仅一行要点。）