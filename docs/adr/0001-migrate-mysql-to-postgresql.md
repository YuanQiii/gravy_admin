# ADR-0001: 将数据库从 MySQL 迁移到 PostgreSQL

- 状态：已接受（2026-08-25）
- 关联变更：openspec/changes/migrate-mysql-to-postgresql

## 背景

项目最初基于 MySQL 8.0（Prisma datasource、三套 docker-compose 编排、seed 并发锁均绑定 MySQL）。出于技术栈统一与长期运维考量决定切换到 PostgreSQL。切换发生在开发/测试阶段，无存量生产数据需要迁移。

## 决策

采用 PostgreSQL 17（`postgres:17-alpine`），一次性替换三套容器编排（生产/开发/测试），不做双跑过渡。

关键取舍：

1. **保留 `relationMode = "prisma"`**：换库与收紧数据库层外键约束是两个正交决策。Prisma 在应用层模拟关系的行为在两种数据库下完全一致，切换零回归。切换为真实外键（`foreignKeys`）留待未来独立变更。
   > **2026-08-26 更新**：本决策已被推翻——迁移完成后随即切换为数据库原生外键（删除 `relationMode`，默认 `foreignKeys` 模式）。schema 中全部关系本就带显式 `onDelete/onUpdate`，切换后 Prisma 生成 39 个真实 FK 约束，动作语义与应用层模拟时一致。详见「后续：切换原生外键」。
2. **不迁移存量数据**：开发数据可随时重新 seed，推倒重来（`db:reset`）成本最低。
3. **接受大小写敏感**：MySQL `utf8mb4_unicode_ci` 下字符串比较大小写不敏感，PostgreSQL 默认敏感。这是一处**已知的应用行为变化**：登录需精确匹配（`Admin` 不再匹配 `admin`）、`User@x.com` 与 `user@x.com` 在 PG 下可分别注册。精确匹配是业界更常见的登录语义，且避免了改动业务代码；不引入 `citext`。
4. **schema 中 `NoAction` → `Restrict`**：PG + `relationMode = "prisma"` 不支持 `NoAction` 引用动作，Prisma 官方建议用语义等价的 `Restrict` 替代（实施时发现，机械替换 54 处）。
5. **seed 锁超时语义保留**：MySQL `GET_LOCK` 的 30 秒超时用 `pg_try_advisory_lock` 循环 + 500ms 退避复刻；直接换 `pg_advisory_lock` 会无限期阻塞，语义不等价。
6. **维持 `db push` 工作流**：项目从未建立迁移历史，空库直接建表即为天然 baseline，不引入 `prisma migrate`。

## 被否的备选

- **MySQL/PG 双跑过渡**：单容器编排的中小项目，双跑徒增维护成本，git 历史即回滚手段
- **切换 `relationMode = "foreignKeys"`**：与换库混做会扩大回归范围
- **迁移存量 MySQL 数据（pgloader 等）**：无生产数据，纯增工作量
- **`citext` / 函数式唯一索引保持大小写不敏感**：需改 schema 与数据库扩展，扩大变更面
- **PostgreSQL 16 / 18**：16 过于保守，18 太新

## 后果

- `DATABASE_URL` 格式变更为 `postgresql://`，所有环境（本地 `.env`、CI、部署）需同步更新
- 旧 MySQL 容器/卷不再使用；生产清理按卷名删除（`docker volume rm`），不要 `down -v`（会连带删 redis-data）
- 登录与唯一约束的大小写语义变化是**有意的**，未来若有"大小写不敏感登录"需求，作为独立变更评估 `citext`

### 迁移完成后的额外清理（收尾补充）

主流程验收后复查发现以下 MySQL 残留（不属 commit 主变更，但同属迁移收尾，一并补齐）：

- `docker/scripts/deploy.sh`：`ensure_mysql` 改写为 `ensure_postgres`——该脚本独立于 compose，自行管理数据库容器，原实现引用已删除的 `docker/mysql/my.cnf` 且会拉取 mysql 镜像。现解析 `postgresql://` 用户/密码/端口、起 `postgres:17-alpine`、用 `pg_isready` 健康检查、卷改名 `gvray_admin_postgres_data`；reset/status 同步。bash 语法验证通过。
- `docs/deployment.md`：7 处 MySQL 表述更新为 PostgreSQL（含 `.env` 最小配置段保持一致）。
- `.env.production` / `.env.test`：`DATABASE_URL` 及 DB 相关变量改为 PostgreSQL（test 对齐 harness 的 5433 端口 / postgres 用户 / test 密码）。
- `test/harness/create-app.ts`：注释由"无需真实 MySQL"改为"无需真实 PostgreSQL"。

保留的 MySQL 字眼仅存在于迁移决策文档（本 ADR）与 seed 的历史语义注释，均非功能性引用。

## 后续：切换原生外键（2026-08-26）

迁移验收后，应用户要求将 `relationMode = "prisma"` 切换为数据库原生外键（Prisma 默认 `foreignKeys` 模式），推翻上方取舍 1：

- **改动**：仅删除 `datasource db` 中的 `relationMode = "prisma"` 一行。schema 中所有 `@relation` 本就带显式 `onDelete/onUpdate`（Cascade/Restrict），无需其他修改。
- **效果**：`prisma db push` 后数据库建立 39 个真实 FOREIGN KEY 约束，引用完整性由数据库层保证，不再依赖 Prisma 应用层模拟（后者仅覆盖通过 Prisma Client 的操作，绕过 ORM 的写入不受保护）。
- **验证**：重建库 + 全量 seed 通过；应用启动后登录/用户/角色/菜单接口正常；直接 SQL 删除被引用用户被数据库拒绝（`violates foreign key constraint "notices_createdById_fkey"`），证明约束真实生效。
- **回滚**：恢复 `relationMode = "prisma"` 并重新 `db push` 即可。
