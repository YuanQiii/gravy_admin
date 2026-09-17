## 1. 响应层收敛

- [ ] 1.1 抽出纯函数 `resolveErrorPresentation(exception, { isProduction })` → `{ status, message, showType }`（位置贴近 filter，或放入 `packages/core/src/shared/utils/`）：把异常分类、message 提取与环境收敛、`showType` 映射、业务码 → HTTP 状态映射四件规则移入其中。验证：单测**不起 HTTP**、直打纯函数，覆盖四类输入（`HttpException`（string / object / 数组 message 三种）与非 `HttpException` 的 `Error` / 非 Error）× 两种 `isProduction`；并断言一组代表性业务错误码在 `isProduction: true` 下展示结果与改动前**逐字一致**（决策 4 的护栏）。
- [ ] 1.2 `HttpExceptionFilter.catch` 退化为薄适配器：注入 `ConfigService` 读 `app.nodeEnv` → 调 `resolveErrorPresentation` → `response.status(...).json(ResponseUtil.error(...))`；删除内联的 `getShowType`/`getHttpStatus` 主体（移入纯函数）。**不改**包络结构与业务分支语义。验证：filter 的 `catch` 方法体行数显著下降；`grep -n "exception.message" packages/core/src/core/filters/http-exception.filter.ts` 无命中（全部收敛进纯函数）。
- [ ] 1.3 确认 filter 仍可通过 `APP_FILTER` + `useClass` 注入 `ConfigService`（两个 app 的 `app.module.ts` 均在提供者上下文中）。验证：两个应用 `pnpm build` 通过 + 起 app 冒烟打一个会抛非预期异常的请求。
- [ ] 1.4 **不新增任何 logger 调用**。验证：`grep -n "Logger\|logger\." packages/core/src/core/filters/http-exception.filter.ts` 无命中（保持"失败只记一次"的唯一归属）。

## 2. 影响面核查（先做，决定 tasks 3 的形态）

- [ ] 2.1 grep 现有测试对 500 响应体的断言：`grep -rn "服务器内部错误\|INTERNAL_SERVER_ERROR" test/ packages/**/*.spec.ts apps/**/*.spec.ts`。若有断言原始 message 的用例，逐一改为「断言泛化文案」+「断言细节出现在日志中」。验证：`pnpm test` 与 `pnpm test:e2e` 相关套件全绿；改动清单记入变更备注。
- [ ] 2.2 确认 `test/` 的 e2e harness 是否能构造一个非 `HttpException` 的失败（例如 stub 一个抛 `new Error('boom')` 的依赖）。验证：能则补 e2e（tasks 3.2）；不能则在单测层覆盖并注明。

## 3. 可关联性：请求 ID 回写响应头

- [ ] 3.1 `packages/core/src/logging/request-id.middleware.ts` 在挂载 `req.id` 后，把同一 ID 回写到响应头（键名读 `app.logRequestIdHeader`，默认 `x-request-id`）。验证：单测断言响应头等于 `req.id`（含"请求已带该头时沿用原值"与"缺失时生成"两种输入）。
- [ ] 3.2 e2e：构造一个 500（非预期异常）与一个 200，断言两者的响应头都带 `x-request-id`，且该值与访问日志的 `requestId` 一致。验证：`pnpm test:e2e` 相关套件全绿。
- [ ] 3.3 部署侧核对：反向代理/网关是否已有同名响应头会被覆盖或冲突（`nginx.conf.example`、`docker/`、云网关配置）。验证：`grep -rn "x-request-id\|X-Request-Id" nginx.conf.example docker/ docs/` 结果记入变更备注；有冲突则调整头名或明确覆盖意图。

## 4. 规格与文档

- [ ] 4.1 delta 已在 `specs/logging/spec.md`（ADDED「非预期异常的对外响应」）。验证：`openspec validate converge-non-http-exception-response --strict` 通过。
- [ ] 4.2 在 Swagger/文档中说明 500 的 message 为泛化文案、需靠响应头 `x-request-id` 关联日志。验证：两个应用构建后 Swagger 无该说明的则补在全局 description（`configure-app` 的 Swagger 配置）。
- [ ] 4.3 归档时把 delta 合并进 `openspec/specs/logging/spec.md`。验证：合并后「非预期异常的对外响应」恰有一条；`openspec validate --specs` 通过。
- [ ] 4.4 记录后续项：`HttpException` 分支的 `exception.message` 回退路径（design 风险 4）建议独立变更 `converge-http-exception-message-fallback`，本次不实现。验证：结论写入变更备注。

## 5. 门禁

- [ ] 5.1 `pnpm build && pnpm test && pnpm test:e2e` 通过（e2e 存在既有失败时，如实区分归属）。验证：命令输出与基线对比。
