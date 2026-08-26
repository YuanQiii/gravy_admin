## 1. Schema 与 seed 代码

- [x] 1.1 修改 `prisma/schema.prisma` 的 `provider = "mysql"` 为 `"postgresql"`（其余含 `@db.VarChar`/`@db.Text`/enum 均不动），运行 `pnpm prisma:generate` 验证无报错（实施中发现：PG 不支持 `NoAction`，54 处已机械替换为语义等价的 `Restrict`，已记入 design.md 决策 3）
- [x] 1.2 修改 `prisma/seed.ts`：将 `GET_LOCK`/`RELEASE_LOCK` 替换为 PG advisory lock 方案——循环 `pg_try_advisory_lock(<id>)` + 500ms 退避、累计 30 秒未获取则抛错（保留原超时语义），`<id>` 为 `'nest_admin_seed'` 的 TS 侧预计算整数常量，释放用 `pg_advisory_unlock(<id>)`；eslint + tsc 校验通过（`pnpm lint` 全局报错均为 src/test 存量问题，与本次改动无关）

## 2. 基础设施编排

- [x] 2.1 替换 `docker-compose.yml` 中 MySQL 服务为 `postgres:17-alpine`（env 改 `POSTGRES_USER: postgres`/`POSTGRES_PASSWORD`/`POSTGRES_DB`、健康检查改 `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB`、`DATABASE_URL` 改 `postgresql://` 前缀、卷名改 `postgres-data`、删除 my.cnf 挂载），`docker compose config` 校验通过（需临时 JWT_SECRET 哑变量，原有 `:?` 必填设计）
- [x] 2.2 同构替换 `docker-compose.dev.yml`（服务名 mysql → postgres、容器名、卷 `postgres-dev-data`、连接串），`docker compose -f docker-compose.dev.yml config` 校验通过
- [x] 2.3 同构替换 `docker-compose.test.yml`（`mysql-test` → `postgres-test`、端口 3307:3306 → 5433:5432、卷 `postgres-test-data`），`docker compose -f docker-compose.test.yml config` 校验通过
- [x] 2.4 删除 `docker/mysql/` 目录（含 my.cnf、init.sql）及其挂载引用，全局 Grep `mysql` 确认无残留（发现规划遗漏的 `Dockerfile` 两处构建期哑连接串，已一并改为 postgresql://）

## 3. 脚本与配置元数据

- [x] 3.1 更新 `package.json`：`db:up` 的服务名 mysql → postgres；description 中 MySQL 改为 PostgreSQL
- [x] 3.2 更新 `.env.example` 的 `DATABASE_URL` 为 `postgresql://postgres:password@localhost:5432/gvray_admin`，补充 `POSTGRES_PASSWORD`/`POSTGRES_DB` 变量（若 compose 引用）
- [x] 3.3 更新 `README.md`：技术栈、快速开始（方式一 `up -d postgres redis`、方式二本地 PG >= 17）、`.env` 说明（顺手将快速开始的 `prisma migrate dev` 改为 `prisma db push`，与实际工作流对齐）

## 4. 决策记录

- [x] 4.1 创建 `docs/adr/0001-migrate-mysql-to-postgresql.md`：记录动机（技术栈统一）、被否备选（双跑过渡、切 foreignKeys、迁数据、citext）、保留 `relationMode = "prisma"` 与接受大小写敏感（见 design.md 决策 8）的权衡

## 5. 端到端验证

- [x] 5.1 清理旧环境并启动 PG：`pnpm db:down`（清 MySQL 卷）→ `pnpm db:up` → `docker ps` 确认 postgres 容器 healthy（发现 dev compose 的 postgres 未映射宿主机端口，已补 `5432:5432`，否则宿主机 `db:reset` 不可达）
- [x] 5.2 重置与 seed：创建本地 `.env`（DATABASE_URL + SUPER_ADMIN_INITIAL_PASSWORD，后者为 seed 原有必填项）后执行 `pnpm db:reset`，确认 `db push` + 全量 seed 无报错（advisory lock 获取/释放路径已覆盖）
- [x] 5.3 冒烟验证：`pnpm start:dev` 启动应用——精确匹配登录成功（`access_token`/`refresh_token` 均签发）；大小写变体登录（`SUPER_ADMIN`）按预期返回 401（PG 大小写敏感，见 design.md 决策 8）；用户（3）/角色（5）/菜单（10）列表读取 + 角色创建/删除写操作全部通过
- [x] 5.4 测试 harness 验证：`pnpm test:harness:up` 起 postgres-test 容器 healthy，`pnpm test` 结果 2 failed / 9 passed——**与迁移前基线完全一致**（git stash 对照验证），失败为存量问题（`src/modules/auth/*` 等存在未提交的 WIP 改动），与本次迁移无关；`pnpm test:harness:down` 清理完成
- [x] 5.5 迁移收尾复查清理 MySQL 残留（主流程验收后补充）：全局 grep 定位并修复 `docker/scripts/deploy.sh`（`ensure_mysql` → `ensure_postgres`，含 my.cnf 引用、卷名、健康检查）、`docs/deployment.md`（7 处）、`.env.production`、`.env.test`、`test/harness/create-app.ts` 注释；已记录至 ADR-0001「迁移完成后的额外清理」
- [x] 5.6 切换数据库原生外键（推翻 design.md 决策 2，应用户要求）：删除 schema 中 `relationMode = "prisma"` 一行（所有 `@relation` 已带显式 onDelete/onUpdate，无需其他改动）；`db:reset` 重建库生成 39 个真实 FK 约束 + 全量 seed 通过；冒烟（登录/用户/角色/菜单）全通；SQL 直删被引用用户被数据库拒绝，约束真实生效；已记录至 ADR-0001「后续：切换原生外键」
