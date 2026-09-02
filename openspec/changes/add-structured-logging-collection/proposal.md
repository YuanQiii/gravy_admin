## Why

当前应用仅依赖 NestJS 内置 `Logger`（由 `LOG_LEVEL` 控制级别）输出非结构化文本到 stdout，正常请求是"沉默"的、异常日志零散，无法关联同一请求的多个事件，也无法在单机 Docker 环境中集中检索、定位线上问题。需要一套**结构化日志 + 集中采集**的可观测性基础设施，把"系统发生了什么、多快、错在哪"落成统一、可查询的日志流。

## What Changes

- 引入 `nestjs-pino` 作为日志内核，产出**结构化 JSON 单行日志**；prod 输出纯 JSON，dev 输出 pretty 可读格式。

- 新增**结构化 access log 拦截器**：记录 `userId`、method、route、path、status、duration、`req.id`、IP、UA、脱敏后的 query；超过慢请求阈值时才额外附带脱敏后的 body。

- 引入 **request correlation id（`x-request-id`** **头或本地生成 UUID）**，注入 pino `req.id`，并透传给 operation-log 一并落库，打通业务审计与可观测日志。

- 在 pino 层配置 **敏感字段脱敏（redact）**：`password`/`token`/`secret`/`authorization` 等默认掩码，并支持 `LOG_REDACT` 追加字段；现有 `oLogMaskFields` 继续服务于 operation-log 落库。

- 调整 `HttpExceptionFilter`：失败请求细节只在此处以结构化 error 日志记录（含 stack），避免与 access log 重复记录，用 `req.id` 关联。

- 新增独立 `docker-compose.observability.yml`：内置 `loki` + `promtail`（或 `alloy`）+ `grafana`，从 stdout 采集日志、按 label 组织、配置基本 retention；主 compose 保持最小。

## Capabilities

### New Capabilities

- `logging`: 应用的日志行为契约——结构化格式、级别与输出目标、access log 内容与去重、关联 ID 传播、敏感字段脱敏、慢请求阈值，以及集中采集（Loki/Grafana）的可观测性交付面。

### Modified Capabilities

- `rbac`: 权限/角色 spec 若涉及 operation-log 与日志关联字段扩展，需求层面此处仅登记 `requestId` 透传到 operation-log 的行为边界；如无需求级变化则保持空。

## Impact

- **代码**：`src/main.ts`（接入 pino、设置级别/redact）、新增 pino 初始化与请求关联中间件、新增 access-log 拦截器、调整 `src/core/filters/http-exception.filter.ts`、调整 `src/core/interceptors/operation-log.interceptor.ts`（关联 `requestId`）。

- **配置**：`.env.example` / app config 增加 `LOG_LEVEL`、`LOG_REDACT`、`LOG_SLOW_MS`、`LOG_REQ_ID_HEADER` 语义；`LOG_LEVEL` 现有含义沿用。

- **依赖**：新增 `nestjs-pino` / `pino` 及 `pino-http`。

- **部署/系统**：新增 `docker-compose.observability.yml`（loki、promtail/alloy、grafana）；`AGENTS.md` 按需同步文档。

