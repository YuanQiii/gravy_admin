# 部署摘要

详细说明见 [../../DOCKER\_DEPLOYMENT.md](../../DOCKER_DEPLOYMENT.md)。

## 常用命令

```bash
pnpm build
pnpm start:prod
pnpm docker:dev:up
pnpm docker:up
pnpm docker:deploy
```

## 两套 Docker 工作流

- **开发**：`docker-compose.dev.yml`，挂载 `./src`，build 目标 `dev`，端口 `3000`。

- **测试 / 生产**：`docker-compose.yml`，pull 镜像 + `.env` 注入，端口 `3000`。

## 集中日志采集（可选）

- 结构化日志由 pino 输出到 app 容器 stdout（生产为单行 JSON）。

- 可选观测栈为独立 `docker-compose.observability.yml`（`loki` + `promtail` + `grafana`），**默认不随主栈启动**。

- 与主栈叠加启动：`docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d`；promtail 经 Docker socket 采集 app 容器 stdout，按 `env`/`service`/`level` 打 label 推往 Loki。

- Grafana 默认 `http://localhost:3001`（`GRAFANA_PORT` 可改），已预置 Loki 数据源；登录见 `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`（默认 admin/admin，请务必修改）。

- 日志保留时长由 `LOG_RETENTION` 控制（Loki 语法，默认 `168h`，可如 `30d`）。

## 环境变量注意点

- `docker-compose.yml` 中 `DATABASE_URL` 由 `POSTGRES_USER` + `POSTGRES_PASSWORD` + `POSTGRES_DB` 自动组装为 `postgresql://...@postgres:5432/...`，直接修改 `.env` 中的 `DATABASE_URL` 对 compose 模式不生效。

- `CORS_ORIGINS` 在生产环境（`NODE_ENV !== development`）下必须配置，否则 CORS origin 为 `undefined`。

- `JWT_ACCESS_TOKEN_EXPIRES_IN` / `JWT_REFRESH_TOKEN_EXPIRES_IN` 控制 token 过期，默认 `2h` / `7d`。

- `docker-compose.yml` 的 app healthcheck 使用 `node -e "fetch(...)"`，不依赖 wget/curl。

- 结构化日志相关：`LOG_LEVEL`（级别，默认 info）、`LOG_REDACT`（追加 stdout 脱敏字段，逗号分隔）、`LOG_SLOW_MS`（慢请求阈值，默认 1000）、`LOG_REQ_ID_HEADER`（请求关联 ID 头名，默认 `x-request-id`）；`LOG_RETENTION` 仅用于观测栈的 Loki 保留时长。

## 数据库迁移策略

- **生产（非 development）**：容器启动经 [db-bootstrap 深模块](../../src/bootstrap/bootstrap.ts)（见 [ADR 0007](../../docs/adr/0007-db-bootstrap-deep-module.md)）执行 `prisma migrate deploy` 并做 fail-closed 校验——`prisma/migrations/` 缺失/为空时打印英文错误并以非零退出，**绝不回退到** **`prisma db push`**。

- **开发**：dev 容器不做 schema 同步；开发者在本机用 `prisma migrate dev`（生成 + 应用）与 `prisma:seed`。

- **一次性基线（首次接入迁移历史）**：对既有数据库跑 `pnpm prisma:migrate:baseline`（线上库 diff 必须为空），生成 `prisma/migrations/0_init/` 后对生产库手工执行 `prisma migrate resolve --applied 0_init`（见 [ADR 0008](../../docs/adr/0008-baseline-drift-gate-and-image-whitelist.md)）。

- `prisma/scripts/migrate_af_eqm_to_gvray.sql` 与 `prisma/backups/`：**已手动执行的一次性历史产物，仅历史参考，不入迁移链、不进运行镜像**（.dockerignore 已排除，runner 只 COPY `prisma/migrations`）。

## 修改部署相关内容时

- 修改 `.env.example` 时，同步部署文档的环境变量说明。

- 修改 Docker Compose、Nginx、端口、健康检查或部署脚本时，同步 [../../DOCKER\_DEPLOYMENT.md](../../DOCKER_DEPLOYMENT.md)。

- 修改运行时配置前，确认 `src/config/*.ts` 和环境变量读取逻辑。

