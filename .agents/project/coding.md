# 编码规范

## TypeScript

- 目标版本：ES2023，`strictNullChecks: true`，`emitDecoratorMetadata: true`。

- 路径优先使用 tsconfig alias：应用内用 `@/*`（分别指向 `apps/admin/src`、`apps/mall/src`）；跨 app 共享一律 `@gvray/core` / `@gvray/domain` 的 barrel 公开面，禁止 `@gvray/*/src` 深路径与 app 间交叉 import。

## NestJS

- 使用构造函数注入依赖。

- 异常使用 NestJS 内置异常类：`BadRequestException`、`NotFoundException`、`ForbiddenException`、`ConflictException`。

- 全局异常由 `HttpExceptionFilter` 统一处理。

- Controller 不写业务逻辑；Service 不直接暴露未过滤的 Prisma 对象。

## 密码与敏感信息

- 密码使用 `bcrypt.hash(password, 10)` 加密存储，比较使用 `bcrypt.compare(plain, hashed)`。

- 禁止在任何 API 响应或日志中返回 `password`、token、authorization、secret、captcha、refresh token、JWT 等敏感信息原文。

- 新增日志字段时必须确认脱敏和长度限制覆盖。

## 日志与审计

- 结构化日志内核为 `nestjs-pino`，收敛在深模块 `packages/core/src/logging/`（见 ADR 0006）。生产输出单行 JSON，开发输出 pino-pretty 可读格式；级别由 `LOG_LEVEL` 控制，`pinoHttp.autologging` 已关闭。

- 访问日志由最外层全局 `RequestLogInterceptor` 统一产出：成功 → info（含 userId/method/route/path/status/duration/requestId/IP/UA/query），慢请求（> `LOG_SLOW_MS`，默认 1000ms）附 body，失败 → error+stack 只记一次。`HttpExceptionFilter` 不记日志，只做响应整形。

- 请求关联 ID：统一收敛为 `req.id`。由 pinoHttp 的 `genReqId` 负责（读 `LOG_REQ_ID_HEADER`，默认 `x-request-id`，缺失自动生 UUID），`RequestIdMiddleware` 作为守卫兜底，避免 pino-http 默认数字自增 id 覆盖关联 ID。业务审计经 `@RequestId()` 或 `req.id` 读取；`OperationLogInterceptor` 落库时写入 `operationLogs.requestId`。

- stdout 脱敏与 DB 审计脱敏为两条独立链路：pino `redact`（`SENSITIVE_KEYS` 单一来源 + `LOG_REDACT` 追加）负责 stdout；`OPLOG_MASK_FIELDS`（叠加 `SENSITIVE_KEYS`）负责落库。改日志/审计敏感字段名单时优先改 `packages/core/src/shared/constants/sensitive-keys.constant.ts`。

- 操作日志：使用 `@OperationLog({ module, action, resource })` / `@NoOperationLog()` 配合 `OperationLogInterceptor`。

- 操作日志默认只记录写请求（`POST` / `PUT` / `PATCH` / `DELETE`），可通过 `OPLOG_ENABLED=false` 关闭。

- 登录日志由 `AuthService` 登录流程写入 `login-logs` 模块。

- 禁止裸 `console.*`，统一使用 NestJS `Logger`（其由 pino 接管，日志将自动结构化）。

## 功能开关缓存

`ConfigsService` 支持功能开关运行时读取与缓存。新增功能开关时：seed 中定义 `feature.xxx`；Controller 路由使用 `@FeatureFlag('xxx', '提示消息')`；后端逻辑使用 `ConfigsService.isFeatureEnabled('xxx')`。

## 语言与提交

- 错误信息与日志 message 统一使用英文，Swagger 描述统一使用中文。

- 提交使用 conventional commits：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`。

