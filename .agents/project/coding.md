# 编码规范

> 面向「改密码 / 日志 / 审计 / 安全策略」这类任务。
> 通用硬规则（Controller/Service 边界、响应与投影、路径 alias、包管理器、语言与提交）以 `AGENTS.md` 的「开发硬规则」为唯一出处，**本文件不复述**——复述的那份不会随原始规则一起更新。本文件只写机制与字段明细。

## TypeScript

- 目标版本：ES2023，`strictNullChecks: true`，`emitDecoratorMetadata: true`（见 `tsconfig.base.json`）。

## NestJS

- 使用构造函数注入依赖。
- 异常使用 NestJS 内置异常类：`BadRequestException`、`NotFoundException`、`ForbiddenException`、`ConflictException`。
- 全局异常由 `HttpExceptionFilter` 统一处理。
- 禁止裸 `console.*`，统一使用 NestJS `Logger`（其由 pino 接管，日志将自动结构化）。

## 密码与敏感信息

- 密码使用 `bcrypt.hash(password, 10)` 加密存储，比较使用 `bcrypt.compare(plain, hashed)`。
- 禁止在任何 API 响应或日志中返回 `password`、token、authorization、secret、captcha、refresh token、JWT 等敏感信息原文。
- 新增日志字段时必须确认脱敏和长度限制覆盖。

## 日志与审计（机制与字段）

> 三条不变量在 `AGENTS.md`；本节只写实现细节，不重述不变量。

- 结构化日志内核为 `nestjs-pino`，收敛在深模块 `packages/core/src/logging/`（见 [ADR 0006](../../docs/adr/0006-structured-logging-deep-module.md)）。生产输出单行 JSON，开发输出 pino-pretty 可读格式；级别由 `LOG_LEVEL` 控制，`pinoHttp.autologging` 已关闭。
- 访问日志字段：成功 → info（`userId` / `method` / `route` / `path` / `status` / `duration` / `requestId` / IP / UA / query）；慢请求（> `LOG_SLOW_MS`，默认 1000ms）附 body；失败 → error + stack。
- 请求关联 ID：统一收敛为 `req.id`。由 pinoHttp 的 `genReqId` 负责（读 `LOG_REQ_ID_HEADER`，默认 `x-request-id`，缺失自动生 UUID），`RequestIdMiddleware` 作为兜底，避免 pino-http 默认数字自增 id 覆盖关联 ID。业务审计经 `@RequestId()` 或 `req.id` 读取；`OperationLogInterceptor` 落库时写入 `operationLogs.requestId`。
- stdout 脱敏与 DB 审计脱敏是**两条独立链路**：pino `redact`（`SENSITIVE_KEYS` 单一来源 + `LOG_REDACT` 追加）负责 stdout；`OPLOG_MASK_FIELDS`（叠加 `SENSITIVE_KEYS`）负责落库。
- 操作日志：使用 `@OperationLog({ module, action, resource })` / `@NoOperationLog()` 配合 `OperationLogInterceptor`；默认只记录写请求（`POST` / `PUT` / `PATCH` / `DELETE`），可通过 `OPLOG_ENABLED=false` 关闭。
- 登录日志由 `AuthService` 登录流程写入 `login-logs` 模块。

## 功能开关缓存

`ConfigsService` 支持功能开关运行时读取与缓存。新增功能开关时：seed 中定义 `feature.xxx`；Controller 路由使用 `@FeatureFlag('xxx', '提示消息')`；后端逻辑使用 `ConfigsService.isFeatureEnabled('xxx')`。

## 提交 type 取值

`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`。提交格式与语言要求见 `AGENTS.md`「开发硬规则」。
