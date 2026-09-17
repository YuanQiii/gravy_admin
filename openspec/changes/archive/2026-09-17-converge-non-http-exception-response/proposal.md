## Why

`packages/core/src/core/filters/http-exception.filter.ts` 的「非 `HttpException`」分支把**原始异常 message 原样下发**给客户端（`exception instanceof Error` → `message = exception.message || '服务器内部错误'`）。任何未预期的异常——Prisma 校验/约束错误、驱动错误、第三方 SDK 错误——都会把**内部信息**（字段名、查询片段、库/表名、有时是连接串片段）暴露给调用方，状态码统一 500。

这是业务审查报告 P2-1 的第三个子项。前两个子项（分页排序参数白名单、`sortOrder` 枚举校验）已由变更 `whitelist-pagination-sort-params` 承担，并把本子项**显式列为 Non-Goal** 并建议了独立变更名——即本变更。因此这里的触发面比报告的原始描述更窄：排序参数这条匿名可触发的路径已被堵住，但**信息泄露面本身仍在**，任何其他未预期异常依然会泄漏。

## What Changes

- **非预期异常的响应体收敛**：非 `HttpException` 的异常在生产环境返回**泛化文案**（如 `服务器内部错误`），不携带原始 message；非生产环境（dev/test）保留原始 message 以便调试。
- **不改日志**：`RequestLogInterceptor` 的失败分支已经记录 `error + stack`（且是全仓唯一所有者，`HttpExceptionFilter` 明确不记日志——见 `logging/spec.md` 的「失败请求不重复记录」场景）。本变更**只在响应层泛化**，日志侧零改动。这一判断是设计的核心，不是省略。
- **可排查性不退化的前提**：响应泛化后，调用方仍需要一条能定位日志的线索，因此响应侧沿用请求关联 ID（`req.id` / `LOG_REQ_ID_HEADER`）。若该 ID 目前未回写到响应，则补一个响应头（不改变既有响应包络结构）。
- **不动 `HttpException` 分支**：业务错误码（如 `INQUIRY_NOT_FOUND`、`CUSTOMER_USERNAME_DUPLICATED_SOFT_DELETED`）与 `ValidationPipe` 参数错误消息是**对外契约**，必须逐字保持。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `logging`: 新增「非预期异常的对外响应」约束——生产环境 SHALL NOT 在响应体中下发内部错误细节，同时 SHALL 保证失败细节在日志中可定位（经请求关联 ID 关联）。

## Impact

- **代码**：`packages/core/src/core/filters/http-exception.filter.ts`（唯一必改文件）；可能新增/复用环境判定工具与响应头回写。
- **接口**：**所有**端点的 500 响应体文案变化（`message` 从具体错误变为泛化文案；`code`/`showType`/包络结构不变）。既有调用方若依赖 500 的 `message` 内容，行为会变——这是修复而非破坏，但需在 Swagger/文档中说明。
- **测试**：若有测试断言 500 响应携带原始 message，需同步改为断言泛化文案 + 断言"细节出现在日志里"（见 tasks 3.2）。实现前必须先 grep 确认影响面。
- **文档**：`AGENTS.md` 已写明错误响应与日志的归属口径；若 `docs/` 中有错误响应契约描述则同步。
- **不在本次范围**：`HttpException` 分支内 `responseObj.message || responseObj.error || exception.message` 的**回退到 `exception.message`** 那条路径（它也可能泄漏，但属业务异常分支，风险等级不同）——记为 Risks 与后续项，不夹带进本变更。
