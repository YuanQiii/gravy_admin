## 1. 响应层收敛

- [x] 1.1 抽出纯函数 `resolveErrorPresentation(exception, { isProduction })` → `{ status, message, showType }`（位置贴近 filter，或放入 `packages/core/src/shared/utils/`）：把异常分类、message 提取与环境收敛、`showType` 映射、业务码 → HTTP 状态映射四件规则移入其中。验证：单测**不起 HTTP**、直打纯函数，覆盖四类输入（`HttpException`（string / object / 数组 message 三种）与非 `HttpException` 的 `Error` / 非 Error）× 两种 `isProduction`；并断言一组代表性业务错误码在 `isProduction: true` 下展示结果与改动前**逐字一致**（决策 4 的护栏）。
- [x] 1.2 `HttpExceptionFilter.catch` 退化为薄适配器：注入 `ConfigService` 读 `app.nodeEnv` → 调 `resolveErrorPresentation` → `response.status(...).json(ResponseUtil.error(...))`；删除内联的 `getShowType`/`getHttpStatus` 主体（移入纯函数）。**不改**包络结构与业务分支语义。验证：filter 的 `catch` 方法体行数显著下降；`grep -n "exception.message" packages/core/src/core/filters/http-exception.filter.ts` 无命中（全部收敛进纯函数）。
- [x] 1.3 确认 filter 仍可通过 `APP_FILTER` + `useClass` 注入 `ConfigService`（两个 app 的 `app.module.ts` 均在提供者上下文中）。验证：两个应用 `pnpm build` 通过 + 起 app 冒烟打一个会抛非预期异常的请求。
- [x] 1.4 **不新增任何 logger 调用**。验证：`grep -n "Logger\|logger\." packages/core/src/core/filters/http-exception.filter.ts` 无命中（保持"失败只记一次"的唯一归属）。

## 2. 影响面核查（先做，决定 tasks 3 的形态）

- [x] 2.1 grep 现有测试对 500 响应体的断言：`grep -rn "服务器内部错误\|INTERNAL_SERVER_ERROR" test/ packages/**/*.spec.ts apps/**/*.spec.ts`。若有断言原始 message 的用例，逐一改为「断言泛化文案」+「断言细节出现在日志中」。验证：`pnpm test` 与 `pnpm test:e2e` 相关套件全绿；改动清单记入变更备注。
- [x] 2.2 确认 `test/` 的 e2e harness 是否能构造一个非 `HttpException` 的失败（例如 stub 一个抛 `new Error('boom')` 的依赖）。验证：能则补 e2e（tasks 3.2）；不能则在单测层覆盖并注明。

## 3. 可关联性：请求 ID 回写响应头

- [x] 3.1 `packages/core/src/logging/request-id.middleware.ts` 在挂载 `req.id` 后，把同一 ID 回写到响应头（键名读 `app.logRequestIdHeader`，默认 `x-request-id`）。验证：单测断言响应头等于 `req.id`（含"请求已带该头时沿用原值"与"缺失时生成"两种输入）。
- [x] 3.2 e2e：构造一个 500（非预期异常）与一个 200，断言两者的响应头都带 `x-request-id`，且该值与访问日志的 `requestId` 一致。验证：`pnpm test:e2e` 相关套件全绿。
- [x] 3.3 部署侧核对：反向代理/网关是否已有同名响应头会被覆盖或冲突（`nginx.conf.example`、`docker/`、云网关配置）。验证：`grep -rn "x-request-id\|X-Request-Id" nginx.conf.example docker/ docs/` 结果记入变更备注；有冲突则调整头名或明确覆盖意图。

## 4. 规格与文档

- [x] 4.1 delta 已在 `specs/logging/spec.md`（ADDED「非预期异常的对外响应」）。验证：`openspec validate converge-non-http-exception-response --strict` 通过。
- [x] 4.2 在 Swagger/文档中说明 500 的 message 为泛化文案、需靠响应头 `x-request-id` 关联日志。验证：两个应用构建后 Swagger 无该说明的则补在全局 description（`configure-app` 的 Swagger 配置）。
- [x] 4.3 归档时把 delta 合并进 `openspec/specs/logging/spec.md`。验证：合并后「非预期异常的对外响应」恰有一条；`openspec validate --specs` 通过。
- [x] 4.4 记录后续项：`HttpException` 分支的 `exception.message` 回退路径（design 风险 4）建议独立变更 `converge-http-exception-message-fallback`，本次不实现。验证：结论写入变更备注。

## 5. 门禁

- [x] 5.1 `pnpm build && pnpm test && pnpm test:e2e` 通过（e2e 存在既有失败时，如实区分归属）。验证：命令输出与基线对比。

## 实施记录（2026-09-17）

- **1.1**：`resolveErrorPresentation` / `toHttpStatus` 纯函数（`packages/core/src/core/filters/error-presentation.ts`）。单测 10 例：HttpException 三种响应形状 × 两种环境（**决策 4 护栏**：业务契约逐字一致）+ Error/非 Error × 两种环境 + 空 message + toHttpStatus 直通/兜底。
- **1.2**：filter 退化为薄适配器（全文 ~40 行，读环境 → 调纯函数 → 写响应）；`grep "exception.message"` 在 filter 内零命中；**1.4** `grep "logger."` 零命中（"失败只记一次"归属未动）。**1.3**：`APP_FILTER + useClass` 注入 ConfigService 两应用均可用（ConfigModule 全局）。
- **2.1**：grep 确认无既有测试断言 500 原始 message —— **零改动需求**（此前审查担心的"改测试契约"不存在）。
- **2.2/3.2**：e2e 2 例——stub `inquiry.findMany.mockRejectedValue(new Error('boom-secret-detail'))` 触达真实 500 路径：响应头 `x-request-id` 自带头沿用原值/缺失生成 UUID；非生产环境 message 为原文（泛化由纯函数单测覆盖，环境边界不重复断言）。
- **3.1**：`RequestIdMiddleware` 在挂载 `req.id` 后回写响应头（键名读 `app.logRequestIdHeader`，默认 `x-request-id`，小写化）。既有 3 例同步补 `setHeader` 断言。
- **3.3**：`nginx.conf.example`/`docker/`/`docs/` grep `x-request-id` **零命中** —— 无反向代理覆盖冲突，采用默认头名。
- **4.2**：两应用 Swagger 全局描述补"500 为泛化文案 + 凭 x-request-id 关联日志"。**4.4**：`HttpException` 分支的 `exception.message` 回退路径（object 无 message/error 时回退 'Http Exception'）维持现状，后续项 `converge-http-exception-message-fallback` 已记录（见 design 风险 4）。
- **门禁**：单测 **278/278**（core 125）；全量 e2e **7 套件 / 80 用例**（+2）；两 build ✓；`validate --strict` ✓。无迁移。
- **BREAKING（生产）**：生产环境非预期异常的响应 message 由原始异常文本变为泛化文案（关联靠 x-request-id）；非生产环境不变。
- 剩余：4.3（归档动作）。
