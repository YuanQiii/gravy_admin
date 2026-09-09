## 1. 工具脚本

- [x] 1.1 在 [package.json](package.json) 新增 `prisma:migrate:dev`（`prisma migrate dev`）、`prisma:migrate:deploy`（`prisma migrate deploy`）、`prisma:migrate:baseline`（`ts-node` 跑 `src/bootstrap/baseline.ts` main）三个 scripts，并验证 `pnpm prisma:migrate:dev --help` 等命令能解析脚本
- [x] 1.2 在 `src/bootstrap/baseline.ts` 实现 `verifyNoDrift(dbUrl): DriftReport`（spawn `migrate diff --from-url → --to-schema-datamodel`；判据：输出 trim 为空=无漂移、非空=有漂移、命令失败=硬错误，三态显式分离）与 `generateBaseline(): BaselineFiles`（`--from-empty` 全量生成 `prisma/migrations/0_init/migration.sql` + `migration.lock`；成功后打印含实际迁移名的 `prisma migrate resolve --applied` 命令行，不自动执行）；在真库上验证三条路径的输出契约与预期一致（漂移闸门对线上库为空=clean 已实测）
- [x] 1.3 编写 `src/bootstrap/baseline.spec.ts` 单测（注入假适配器模拟三态）：「无漂移→放行并生成」「有漂移→中止并携带 diff」「命令失败→硬错误且不报告为漂移」，验证 `pnpm test` 全绿

## 2. 建立初始迁移基线

- [x] 2.1 对目标既有数据库运行 `prisma:migrate:baseline`，确认线上 diff 闸门为空后提交生成的 `prisma/migrations/0_init/migration.sql` + `migration.lock` 进 git（commit 315c740），验证 `git status` 包含基线文件
- [x] 2.2 在全新空库 `gvray_baseline_test` 上执行 `prisma migrate deploy`，验证能完整重建 schema（31 业务表 + `_prisma_migrations`，与既有库 31 表一致，`prisma migrate deploy` 显示无 pending）
- [x] 2.3 对既有库（dev gvray_admin）执行 `prisma migrate resolve --applied 0_init`，验证 `prisma migrate deploy` 显示该迁移已应用、无 pending、数据未受影响（与生产库同路径，漂移闸门实测 clean）

## 3. db-bootstrap 深模块（ADR 0007）

- [x] 3.1 在 `src/bootstrap/` 实现 `bootstrapDatabase(deps): Promise<BootstrapResult>` 单一入口：fail-closed 校验迁移目录（缺失/空 → 抛出明确英文错误、绝不 db push）→ `runMigration()`（migrate deploy）→ seed 启发式（`countUsers() === 0 → runSeed()`）；执行适配器（runMigration / countUsers / runSeed / nodeEnv）全部由参数注入，验证模块不直接 import Prisma/spawn
- [x] 3.2 编写 `src/bootstrap/*.spec.ts` 单测（jest rootDir=src 自动收集）：覆盖「有迁移→应用后判定 seed」「缺迁移→fail-closed 抛错」「已有用户→跳过 seed」「migrate 失败→错误上抛」四条路径，全部用注入的假适配器，验证 `pnpm test` 全绿
- [x] 3.3 实现 `scripts/db-bootstrap.ts` CLI 壳（薄 adapter，无逻辑）：组装真实适配器（spawn `node_modules/.bin/prisma migrate deploy`、`user.count()` 查询、spawn seed：生产 `node dist/prisma/seed.js` / 开发 ts-node）并调用模块入口；先跑一次 `pnpm build` 核验 `dist/scripts/db-bootstrap.js` 存在（若 nest build 裁剪 scripts，按 seed 同法在 builder 阶段补 tsc）

## 4. entrypoint 收缩为薄 adapter

- [x] 4.1 修改 [docker/entrypoint.sh](docker/entrypoint.sh) 为薄 adapter：生产经 `node dist/scripts/db-bootstrap.js` 调用 db-bootstrap（fail-closed），dev 不做 schema 同步直接 `exec CMD`；删除全部 db push 分支与内嵌 seed 判定，保留 SUPER_ADMIN_INITIAL_PASSWORD 安全提示
- [x] 4.2 核对容器内运行链路（runner 镜像已含 `node_modules`、`dist/scripts`、`prisma/migrations`），本地 `docker build` runner 目标后验证容器内 `/app/dist/scripts/db-bootstrap.js` 与 `/app/prisma/migrations` 均存在且 entrypoint 可执行（白名单复制的 `0_init` 与 `schema.prisma` 均在，`prisma/scripts`/`prisma/backups` 已排除）
- [x] 4.3 更新 [.agents/project/deployment.md](.agents/project/deployment.md) 的「数据库迁移策略」与 entrypoint 顶部注释，使其指向 db-bootstrap 模块行为（单一 `migrate deploy` + fail-closed）

## 5. 镜像瘦身：白名单 + 黑名单双层（ADR 0008）

- [x] 5.1 修改 [Dockerfile](Dockerfile) runner 目标：把 `COPY prisma ./prisma` 改为仅 `COPY prisma/migrations ./prisma/migrations`（dev 目标维持 `COPY . .` 不变，构建镜像后验证 `/app/prisma/` 只含 `migrations/`）
- [x] 5.2 在 [.dockerignore](.dockerignore) 追加黑名单 `prisma/scripts/` 与 `prisma/backups/`（对 dev/runner 构建上下文全局生效的第二道防线），并在文档中标注 `prisma/scripts/migrate_af_eqm_to_gvray.sql` 为「已手动执行、仅历史参考、不入迁移链」

## 6. 文档与约束同步

- [x] 6.1 更新 [AGENTS.md](AGENTS.md)：数据库约定补充「生产禁跑 `db push`；一切 schema 变更走 migration，开发用 `migrate dev`」；常用命令补充三个 migrate 脚本
- [x] 6.2 复核 [.agents/project/deployment.md](.agents/project/deployment.md) 的常用命令与环境变量说明与 package.json 新脚本一致

## 7. 集成验证

- [x] 7.1 依序执行一次完整的「新库 → db-bootstrap（migrate deploy + seed）→ 启动」容器冒烟（沿用 dev/test compose），验证生产路径不再出现 `db push` 字样与 `--accept-data-loss`，且 db-bootstrap 单测覆盖的判定在真实容器中行为一致（均已在真库与 runner 容器中验证通过）