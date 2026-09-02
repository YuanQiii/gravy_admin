## 1. 依赖与 deep logging module 骨架

- [x] 1.1 安装 `nestjs-pino`、`pino-http`（运行依赖）与 `pino-pretty`（dev）并验证 `pnpm install` 成功、`package.json` 就位

- [x] 1.2 新建 `src/logging/` module，在 `app.module` 接入 `LoggerModule.forRootAsync`：`isProduction` 纯 JSON、否则 `pino-pretty`，映射 `LOG_LEVEL`；验证启动正常、stdout 为 JSON

- [x] 1.3 在 `src/shared/constants` 建单一来源 `SENSITIVE_KEYS`，pino `redact.paths`（默认覆盖 `authorization`/`*.password`/`*.token`/`*.secret` + `LOG_REDACT` 追加）与 operation-log mask 都从它派生；关闭 `pinoHttp.autologging`；用单测验证默认掩码与追加字段脱敏

## 2. module 内部 seam（RequestId + 访问日志拦截器）

- [x] 2.1 实现 RequestId seam：读 `LOG_REQ_ID_HEADER`（默认 `x-request-id`），缺失则生成 UUID，写 `req.id`（稳定命名），并暴露 `@RequestId()` 访问器；用单测验证外部头透传、缺失生成无 HTTP 上下文时返回 null、operation-log 经该 seam 读到同值（不引入 AsyncLocalStorage）

- [x] 2.2 实现最外层 `RequestLogInterceptor`（注册在 ResponseInterceptor/OperationLogInterceptor 之前）单一 owner 三分支：正常 → info（含 userId/method/route/path/status/duration/req.id/IP/UA/脱敏 query）；超 `LOG_SLOW_MS`（默认 1000）→ 附 `req.body`；抛错 → error+stack 只打一次；跳过 `OPTIONS`；用单一 seam 测试覆盖成功/慢/失败三分支各只产出一条符合字段约定的日志

- [x] 2.3 调整 `HttpExceptionFilter`：移除日志职责，只做响应整形；验证失败请求仍由拦截器错误分支产出唯一 error 日志、无重复

## 3. 配置项

- [x] 3.1 在 app.config / `.env.example` 增加 `LOG_LEVEL`、`LOG_REDACT`、`LOG_SLOW_MS`、`LOG_REQ_ID_HEADER`，并确认默认值在配置校验生效

## 4. operation-log 关联

- [x] 4.1 扩展 operation-log 落库：增加可空 `requestId` 字段，经 logging module 的 `@RequestId()` 读取写入；验证 schema 变更与查询返回结构

- [x] 4.2 验证 `oLogMaskFields` 脱敏逻辑不受 pino redact 影响，保持独立生效

## 5. 集中采集栈与文档

- [x] 5.1 新增 `docker-compose.observability.yml`（loki + promtail/Alloy + grafana），解析 stdout JSON 并按 `env`/`service`/`level` 打 label、配置保留策略；验证 `docker compose -f docker-compose.observability.yml config` 合法且独立启停

- [x] 5.2 更新 `.agents/project/deployment.md` 与 `.agents/project/coding.md`，在 AGENTS.md 同步结构化日志/采集约定，并在 CONTEXT.md 补 `logging module` 术语；验证文档引用路径一致

## 6. 集成验证

- [x] 6.1 端到端：启动观测栈（Loki+promtail+Grafana）+ Postgres，跑真实成功/慢/失败请求；确认 Loki 可按 `req.id` 检索到结构化日志、慢请求 body 与 `authorization` 头已脱敏（`[Redacted]`）、真实失败只出现一条 error、operation_logs.requestId 与日志同关联 ID 可关联。过程中修复 `req.id` 被 pino-http 数字自增 id 覆盖导致关联 ID 为 null 的问题（pinoHttp `genReqId` 收敛写入）

- [x] 6.2 回归 `pnpm test` 与 `pnpm build`，确认新增改动未破坏既有模块、权限/响应包装

