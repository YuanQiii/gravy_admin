## Context

当前仓库没有任何 `prisma/migrations/` 历史，[docker/entrypoint.sh](docker/entrypoint.sh) 在生产实际走 `prisma db push --accept-data-loss`，不可回滚。部署为镜像制（build.sh → deploy.sh，单实例、容器级回滚）。镜像通过 [Dockerfile](Dockerfile) `COPY prisma ./prisma` 把 17MB 一次性数据迁移 SQL 与 17MB 备份 dump 一并带入生产。目标与动机见 [proposal.md](proposal.md) - Why，契约见 [specs/schema-migrations/spec.md](specs/schema-migrations/spec.md)。

## Goals / Non-Goals

**Goals:**
- 生产 schema 变更只走 `prisma migrate deploy`，缺失迁移 fail-closed，杜绝 `db push` 的不可回滚路径。
- 为既有数据库建立可提交、可在新库重建的迁移基线。
- 开发用 `migrate dev` 生成迁移，让迁移历史成为 schema 变更唯一来源。
- 运行镜像不携带一次性迁移产物。

**Non-Goals:**
- 不实现每次部署的常驻 drift 闸门（只在基线时校验一次，见 Decision 4）。
- 不改造为多副本/多实例部署（`migrate deploy` 仍跑在 entrypoint，单实例模型下竞争可控）。
- 不把基线流程纳入部署自动化（一次性、手工执行）。
- 不重写开发容器机制；仅切换 dev 的 schema 同步方式。

## Decisions

**D1 — 基线形态：全量 CREATE 文件 + 线上 diff 作为提交闸门**
用 `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` 生成 `migrations/0_init/migration.sql`（空库 → 全量建表）与 `migration.lock`，保证全新环境可经 `migrate deploy` 完整重建。同时用 `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` 作为提交闸门——必须为空才生成；非空则中止并暴露漂移。
- 备选（弃）：仅用 `--from-url` 生成 delta 基线——新库 `migrate deploy` 会漏建已有表，破坏重建能力。
- 备选（弃）：仅用 `--from-empty` 不做闸门——会把 `schema.prisma` 与线上库的既有漂移静默焙进基线。

**D2 — 生产执行点：留在 entrypoint，单一 `migrate deploy` + fail-closed**
[entrypoint.sh](docker/entrypoint.sh) 不再按「目录存在与否」分支；一律执行 `prisma migrate deploy`。若 `prisma/migrations/` 缺失或为空 → 打印错误并以非零码退出（`set -e` 生效），绝不执行 `db push`。
- 备选（弃）：把迁移挪到 deploy.sh 前置步骤 / 独立 job——单实例模型下新增机制大于收益。

**D3 — 开发走 `migrate dev`，`db push` 仅留在破坏性重置工具**
dev 环境不再用 `db push` 自动同步；开发者改 schema 后本地跑 `prisma migrate dev`（生成 + 应用）。文件 entrypoint 在 dev 阶段随 [Dockerfile dev 目标](Dockerfile) 使用，dev 容器内不再承担 schema 同步职责（开发者在本机跑）。`db:reset` 保留 `prisma db push --force-reset` 作为纯破坏性重置。新增脚本：`prisma:migrate:dev`、`prisma:migrate:deploy`、`prisma:migrate:baseline`。
- 备选（弃）：entrypoint 按 NODE_ENV 分支 dev→`db push`——把不可回滚链路留在开发容器，违背唯一来源原则。

**D4 — drift 校验只在基线时做一次**
基线建立是唯一需要「线上 vs schema」比对的场景；日常部署只 `migrate deploy`。`migrate deploy` 在 schema 与迁移累计不符时会显式报错，已构成基本保护。
- 备选（弃）：deploy.sh 加可选 drift 校验开关——过度工程，预支部署复杂度。

**D5 — 一次性产物排除出镜像与迁移链**
[.dockerignore](.dockerignore) 追加排除 `prisma/scripts/`、`prisma/backups/`，使 17MB 原始 SQL 与 dump 不进生产镜像。`migrate deploy` / `migrate dev` 不纳入该 SQL（已手动执行过，作历史参考）。`prisma/scripts/migrate_af_eqm_to_gvray.sql` 在文档中标注「已手动执行、仅历史参考」。
- 备选（弃）：把它改成真实 migration——一次性数据搬运对每个新库重放有重复/冲突风险，且 17MB 塞进迁移链不恰当。

**D6 — entrypoint 三合一 shell 下沉为 db-bootstrap 深模块（ADR 0007）**
schema 同步 + seed 启发式 + 启动编排从 [entrypoint.sh](docker/entrypoint.sh) 下沉为深模块：
- 实现放 `src/bootstrap/`（jest `rootDir: src`，spec 自动被 `pnpm test` 收集）；`scripts/db-bootstrap.ts` 只做 CLI 启动壳（沿 `scripts/docker-*.ts` 薄 adapter 惯例）。
- 接口收敛为单一入口 `bootstrapDatabase(deps: BootstrapDeps): Promise<BootstrapResult>`；执行适配器 `runMigration` / `countUsers` / `runSeed` / `nodeEnv` 由 CLI 壳注入。fail-closed 校验、顺序不变量、seed 启发式全部留在模块内部（internal seams，不进 interface）。
- `migrate deploy` 经 spawn Prisma CLI 调用（无公开程序化 API），spawn 封装在 `runMigration` 适配器内；测试给假实现，不起容器。
- seed 只编排不实现：`countUsers() === 0 → runSeed()`；生产适配器 spawn `node dist/prisma/seed.js`，开发走 ts-node。seed 内容仍归 [prisma/seed.ts](prisma/seed.ts)。
- entrypoint.sh 缩为 3 行 adapter：`node dist/scripts/db-bootstrap.js && exec "$@"`（dev 目标用 ts-node 形态调用同一模块）。
- 备选（弃）：逻辑留 shell 只抽判定函数——深度收益为零且不可测；模块整体放 `scripts/`——jest 不收集，需改全局测试配置；吞并 seed 实现——删除测试表明 seed 内容自成体系，混入即巨石。

**D7 — Baseline-drift gate 独立双操作模块（ADR 0008）**
基线流程实现为 `src/bootstrap/baseline.ts`（与 db-bootstrap 同家族、interface 分开：baseline 一次性离线、bootstrap 每次容器启动）。两个意图命名的操作：`verifyNoDrift(dbUrl): DriftReport` 与 `generateBaseline(): BaselineFiles`；`migrate resolve --applied` 保留人工步骤（模块打印含实际迁移名的命令行，不自动执行）。判据契约：diff 输出 trim 后为空 = 无漂移；非空 = 有漂移（中止并输出 diff）；命令运行失败 = 硬错误而非漂移——三种结果在 `DriftReport` 中显式分离。CLI 入口：pnpm `prisma:migrate:baseline` → ts-node 跑模块 main 函数。落地义务：真库上验证三条路径输出契约后再固化判定。
- 备选（弃）：并入 db-bootstrap——生命周期/调用者/失败语义全不同，合并即巨石；退出码判漂移——连接失败非零退出会被误判为漂移；bash 手串 CLI——判定语义成隐式契约且不可测。

**D8 — 运行镜像 prisma 载荷白名单 + 黑名单双层（ADR 0008）**
runner 目标白名单仅 COPY 运行所需：`prisma/migrations` 与 `prisma/schema.prisma`。注：`prisma migrate deploy` 会从 schema 读取数据源 provider 与迁移路径，故 schema.prisma 必须随镜像（这是对初步「仅 migrations」设计的事实验证修正）。一次性产物（`prisma/scripts/`、`prisma/backups/`）、seed 源、seeds/ 不进镜像（seed 走已编译 `dist/prisma/seed.js`，Prisma Client 已在 node_modules）。`.dockerignore` 黑名单仍全局追加 `prisma/scripts/`、`prisma/backups/`（同时保护 dev 构建上下文）。两层正交：白名单定「必进」（镜像内仅含显式 COPY 的明文子目录），黑名单定「永不进」（显式防线，防新子目录误进 dev 上下文）。dev 目标维持 `COPY . .` 不变。
- 备选（弃）：仅黑名单——对未来新增子目录不设防，正是 17MB 产物进镜像的根因；runner 完整 COPY prisma——携带 17MB 一次性产物，违背瘦身目标。

## Risks / Trade-offs

- **[切换即风险] 从 db push 切到 migrate deploy 的首批部署若缺某条迁移，会直接启动失败** → 基线流程（D1）在迁移史建立前必须先完成并提交；该步是激活 fail-closed 的前置条件，须在部署切换前执行。
- **[漂移残留] 基线闸门只证「线上 = schema.prisma」，无法证「schema.prisma = 代码期望」** → 通过评审基线 diff 产物 + 在测试环境跑一次新库重建（D1 全量 CREATE）来验证。
- **[一次性产物意外进镜像] 若 .dockerignore 规则与 Dockerfile `COPY prisma ./prisma` 顺序遗漏，仍会带进镜像** → build 后检查镜像内 `prisma/` 内容作为验收项（对应 tasks）。
- **[开发流程摩擦] 开发者从此必须先 `migrate dev` 才能同步 dev 库** → 文档补一句「改 schema 第一步生成迁移」，并在 entrypoint dev 场景下不以 schema 失败阻塞（dev 容器不执行同步）。
- **[编译产物风险] db-bootstrap 的 CLI 壳依赖 `nest build` 产出 `dist/scripts/db-bootstrap.js`（tsconfig.build.json 未排除 `scripts/`，预期成立但未验证）** → 实现时先构建一次并核验 dist 结构，若 nest build 裁剪了 scripts 则用 builder 阶段补一次 tsc（与 seed 编译同法）。
- **[外部契约风险] Prisma CLI `migrate diff --script` 的输出语义（空=无差异）是外部行为，版本升级可能改变** → D7 的真库验证环节锁定当前版本行为；单测以注入适配器模拟三态，CLI 契约变化只需调整真实适配器一处（locality）。

## Migration Plan

1. 建基线条目（一次性，手工）：跑 `prisma:migrate:baseline`（线上 diff 闸门必须为空）→ 生成 `migrations/0_init/` → 对现有生产库 `prisma migrate resolve --applied 0_init` → 提交 `migration.sql` + `migration.lock` 进 git。
2. 切换 entrypoint：去掉 db push fallback，改为单一 `migrate deploy` + fail-closed。
3. 更新脚本、`.dockerignore`、构建校验、文档。
4. 回滚：数据库层由迁移回滚/前滚负责；应用层沿用 deploy.sh 容器 `_backup_*` 回滚。若首批部署失败，检查基线是否已应用，必要时 `prisma migrate resolve` 修正后重试。

## Open Questions

无。