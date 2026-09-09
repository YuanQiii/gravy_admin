## Why

仓库没有任何 `prisma/migrations/` 历史，导致 [docker/entrypoint.sh](docker/entrypoint.sh) 在生产环境实际每次都用 `prisma db push --accept-data-loss` 同步 schema——不可回滚、可在有数据的库上造成破坏。Schema 变更需要一个可追溯、单向、可回滚失败的迁移机制。

## What Changes

- **BREAKING**：生产 schema 同步从 `prisma db push --accept-data-loss` 切换为 `prisma migrate deploy`；entrypoint 对缺失 migration 目录 fail-closed（非零退出），绝不回退到 `db push`。
- schema 同步与 seed 启发式从 `docker/entrypoint.sh` 三合一 shell 下沉为 db-bootstrap 深模块（`src/bootstrap/` + `scripts/db-bootstrap.ts` CLI 壳，见 ADR 0007）：单一入口、注入执行适配器、判定逻辑可单测；entrypoint 缩为薄 adapter。

- 新增一次性基线流程：以「线上库 diff 校验漂移」做提交闸门（结构化 DriftReport 显式区分无漂移/有漂移/校验失败三态，ADR 0008），用「空库 → 全量 CREATE」生成 `migrations/0_init/`，生产库经 `prisma migrate resolve --applied` 标记，产物（`migration.sql` + `migration.lock`）提交进 git。基线闸门与生成实现为 `src/bootstrap/baseline.ts` 双操作模块（`verifyNoDrift` / `generateBaseline`）。

- 开发工作流切换到 migration 驱动：开发者通过 `prisma migrate dev` 生成并应用迁移，不再依赖 `db push`（破坏性 `db:reset` 保留）。

- 运行镜像瘦身：runner 目标 prisma 载荷改白名单（仅 `COPY prisma/migrations`，新目录默认不进镜像，ADR 0008），`.dockerignore` 黑名单排除 `prisma/scripts/`（17MB Af→GVRAY 一次性 SQL）与 `prisma/backups/`（17MB dump）作第二道防线。

- 新增工具脚本：`prisma:migrate:dev`、`prisma:migrate:deploy`、`prisma:migrate:baseline`。

- 同步更新部署文档 [.agents/project/deployment.md](.agents/project/deployment.md) 的「数据库迁移策略」与 [AGENTS.md](AGENTS.md) 的相关约束。

## Capabilities

### New Capabilities

- `schema-migrations`: 数据库 schema 变更的迁移驱动管理——生产只允许 `migrate deploy`、缺失迁移 fail-closed、开发经 `migrate dev` 生成、基线如何建立、镜像不携带一次性迁移产物。

### Modified Capabilities

无。现有 specs（customer / equipment / inquiry / logging / rbac）的运行时行为不因本次 schema 管理机制改变。

## Impact

- **脚本/流程**：`docker/entrypoint.sh`、`docker/scripts/build.sh`（可选校验）、[package.json](package.json) scripts、`.dockerignore`、`prisma/migrations/` 新目录。

- **文档**：`.agents/project/deployment.md`、`AGENTS.md`。

- **工程约定**：开发者 schema 变更必须「先生成迁移，再部署」，`db push` 退出日常路径。

- **依赖**：无新增依赖；Prisma CLI 现有能力（`migrate diff / migrate deploy / migrate dev / migrate resolve`）。

