## Context

见 proposal.md。关键现状约束：Prisma 6.8.2 + `relationMode = "prisma"`；无 `prisma/migrations` 目录（`db push` 工作流）；`src/` 无裸 SQL，唯一 MySQL 特有语法是 `prisma/seed.ts` 的 `GET_LOCK`；MySQL 出现在三个 compose 文件 + `docker/mysql/my.cnf`；e2e 测试默认内存 mock，不连真实库。

## Goals / Non-Goals

**Goals:**

- 应用在 PostgreSQL 17 上完整运行：schema 同步、seed 全量跑通、登录与核心 CRUD 冒烟通过
- 部署/开发/测试三套编排一次性切换，不留双跑过渡期
- 所有面向开发者的文档与示例配置（README、`.env.example`、package.json description）与实际一致

**Non-Goals:**

- 不迁移存量 MySQL 数据（推倒重来，`db:reset` 流程）
- 不改变数据完整性策略（~~保留 `relationMode = "prisma"`，不切换为数据库层外键~~ **[已推翻]** 见 tasks.md 5.6，已切换为原生外键）
- 不引入 `prisma migrate` 迁移历史（维持 `db push` 工作流）
- 不改动测试 harness 结构（`mysql-test` 机械替换为 `postgres-test`，不借机删容器）
- 不改任何业务代码（`src/` 零改动）

## Decisions

1. **PG 版本 `postgres:17-alpine`**：发布近两年、生态成熟；16 过于保守，18 太新。备选被否。
2. ~~**保留 `relationMode = "prisma"`**：换库与收紧约束是两个正交决策，混做会扩大回归范围。切外键留待未来独立变更。~~ **[已推翻]** 见 tasks.md 5.6——应用户要求，在迁移完成后删除了 `relationMode`，切换为数据库原生外键（39 个 FK 约束生效）。权衡记录见 ADR-0001「后续：切换原生外键」。
3. **schema 改动最小化**：`@db.VarChar(n)`/`@db.Text` 在 PG provider 下合法（映射 `varchar(n)`/`text`）；`enum PermissionOrigin`/`MenuType` PG 原生支持。除 `provider` 一行外，唯一必要改动是 54 处 `onDelete/onUpdate: NoAction` → `Restrict`——PG + `relationMode = "prisma"` 不支持 `NoAction`，Prisma 官方建议 `Restrict` 替代（语义等价：阻止删除/更新被引用行）。实施时发现并修正。
4. **seed 锁用 PG advisory lock，以 try-lock 循环保留 30 秒超时语义**：MySQL `GET_LOCK('name', 30)` 等待至多 30 秒后返回失败；PG `pg_advisory_lock` 会**无限期阻塞**，二者并不等价。方案：循环调用 `pg_try_advisory_lock(<id>)` + 短退避（如 500ms），累计 30 秒未获取则抛错退出——与原语义对齐。`<id>` 为锁名字符串 `'nest_admin_seed'` 的稳定整数哈希，**TS 侧预计算为常量**（可 grep、不依赖 `hashtext` 内置函数）。释放用 `pg_advisory_unlock(<id>)`。备选"去掉锁"被否——并发防护语义要保留；备选 `SET LOCAL lock_timeout` 被否——需包裹事务，Prisma 连接池下复杂度更高。
5. **compose 同构替换**：`mysql:8.0` → `postgres:17-alpine`；环境变量 `MYSQL_ROOT_PASSWORD`/`MYSQL_DATABASE` → `POSTGRES_USER`（显式声明为 `postgres`）/`POSTGRES_PASSWORD`/`POSTGRES_DB`；健康检查 `mysqladmin ping` → `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB`（注意：`pg_isready` 只探测服务可达、不校验密码，作为容器健康检查是有意取舍，数据库真正可用性由应用侧连接错误暴露）；卷 `mysql-*-data` → `postgres-*-data`；`DATABASE_URL` 改 `postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`；删除 my.cnf 挂载与 `docker/mysql/`（PG 默认 UTF8，无等价配置需求）。
6. **不生成 migration baseline**：项目从未有迁移历史，`db push` 在空库上直接建表即为天然 baseline。
7. **决策记录为 ADR-0001**：满足难逆转、无上下文会疑惑、真实权衡三条件，落 `docs/adr/0001-migrate-mysql-to-postgresql.md`。
8. **接受大小写敏感，不引入 `citext`**：MySQL `utf8mb4_unicode_ci` 下字符串比较大小写不敏感，PG 默认敏感——这是一处**已知的应用行为变化**（详见 Risks）。经查 `auth.service.ts` 的 `validateUser` 用原始字符串匹配 `email/username/phone`，未做规范化。方案 (a) 接受大小写敏感被采纳：登录需精确匹配（业界更常见的语义），且守住"src/ 零改动"边界；方案 (b) `citext` 类型/函数式唯一索引被否——需改 schema 与数据库扩展，扩大变更面，若未来需要可作独立变更。

## Risks / Trade-offs

- [**排序规则差异：字符串比较由大小写不敏感变为敏感（已知行为变化，见决策 8）**] → 影响登录匹配（`Admin` 不再匹配 `admin`）与唯一约束（`User@x.com` 与 `user@x.com` 在 PG 下可共存）。缓解：冒烟测试显式覆盖"精确匹配登录成功 + 大小写变体登录失败"两种情况，确认新语义符合预期；ADR-0001 记录该取舍。
- [advisory lock try-lock 循环退避期间连接池占用] → 单次 seed 进程、退避 500ms 级别，占用可忽略；30 秒超时兜底防止无限挂起。
- [Prisma 生成的 PG DDL 与 MySQL 版有隐性差异（如 `Json` 类型、索引行为）] → `prisma db push` 后用 `prisma studio` 或 `\d` 抽查关键表；冒烟覆盖登录 + 用户/角色/菜单 CRUD。
- [`@db.VarChar(500)` 的 RefreshToken.token 若实际 token 更长会插入失败（MySQL 下同样存在，非新风险）] → 冒烟时验证登录（签发 refresh token）通过即覆盖。
- [PG advisory lock 的 id 哈希碰撞（理论上）] → 锁名 `nest_admin_seed` 固定单一用途，碰撞无实际影响。
- [开发者本地 `.env` 仍是 MySQL URL] → `.env.example` 更新 + README 明确说明需更新本地 `.env`；`db:reset` 前置校验连接失败会显式报错。
- [换库后 `docker/mysql/my.cnf` 删除导致旧容器启动失败] → `db:down`/`docker:dev:down` 带 `-v` 清理旧卷；README 快速开始指引重建。

## Migration Plan

1. 全部代码/配置改动合入后，本地执行：`pnpm db:down`（清理 MySQL 容器与卷）→ `pnpm db:up`（起 PG）→ 更新本地 `.env` 的 `DATABASE_URL` → `pnpm db:reset`（`db push --force-reset` + seed）→ `pnpm start:dev` 冒烟。
2. 生产环境切换：旧 `mysql-data` 卷在 `git revert` 回滚时仍可复用（MySQL 容器可由旧 compose 重建）；确认新栈稳定后再按名清理（`docker volume rm <project>_mysql-data`）——**不要**用 `docker compose down -v` 清理，会连带删除 `redis-data`。
3. 回滚：git revert 全部改动即可（无数据迁移，开发数据可重 seed）。
