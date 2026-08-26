## Why

项目当前以 MySQL 8.0 作为主数据库（Prisma datasource、三个 docker-compose 编排、seed 脚本均绑定 MySQL）。出于技术栈统一与长期运维考量，需要将数据库切换为 PostgreSQL。当前为开发/测试阶段，无存量生产数据需迁移，是切换成本最低的时机。

## What Changes

- **BREAKING** 数据库由 MySQL 8.0 切换为 PostgreSQL 17（`postgres:17-alpine`）：应用行为不变，但部署环境与 `DATABASE_URL` 格式变更，旧 MySQL 数据卷/容器不再使用
- `prisma/schema.prisma`：`provider` 由 `mysql` 改为 `postgresql`；~~保留 `relationMode = "prisma"`~~ **[已推翻]** 见 tasks.md 5.6——已删除 `relationMode`，切换为数据库原生外键
- `prisma/seed.ts`：并发锁由 MySQL `GET_LOCK`/`RELEASE_LOCK` 替换为等价的 `pg_advisory_lock`/`pg_advisory_unlock`
- 三个 compose 文件（生产 `docker-compose.yml`、开发 `docker-compose.dev.yml`、测试 `docker-compose.test.yml`）：MySQL 服务替换为 PostgreSQL 服务，健康检查改 `pg_isready`，连接字符串改 `postgresql://`
- 删除 `docker/mysql/my.cnf` 挂载与 `docker/mysql/` 目录（PG 默认 UTF8，无需等价配置）
- `package.json`：`db:up` 目标服务名 mysql → postgres；description 同步更新
- `.env.example` 的 `DATABASE_URL` 示例改为 PostgreSQL 格式
- README 技术栈与快速开始章节同步更新
- **BREAKING** 不做存量数据迁移：开发环境直接 `prisma db push --force-reset` + 重新 seed（对应 `db:reset` 流程）
- 新增 `docs/adr/0001-migrate-mysql-to-postgresql.md` 记录换库决策

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——本变更为纯基础设施替换，应用对外行为与领域模型均不变，故 `skip_specs: true`）

## Impact

- **数据访问层**：`prisma/schema.prisma`、`prisma/seed.ts`；`src/` 业务代码无裸 SQL（已确认无 `$queryRaw`/`$executeRaw` 调用），Prisma Client 屏蔽差异，无需改动
- **基础设施**：`docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.test.yml`、`docker/mysql/`（删除）
- **配置**：`.env.example`、`src/config/database.config.ts`（仅读取 `DATABASE_URL`，无需改动）
- **脚本**：`package.json` 的 `db:up`；`prisma:migrate`/`db:reset` 工作流不变（项目无 `prisma/migrations` 目录，一直使用 `db push`，无迁移历史需处理）
- **依赖**：无新增 npm 依赖；Prisma 6.8.2 原生支持 PostgreSQL
- **文档**：README、`docs/adr/`
