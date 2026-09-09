# ADR 0007: 数据库引导下沉为 db-bootstrap 深模块

- 状态：已接受
- 日期：2026-09-03
- 关联：ADR 0001（MySQL → PostgreSQL 迁移）、OpenSpec 变更 `migration-driven-schema-sync`、CONTEXT.md 词条 `Db-bootstrap module`

## 背景

`docker/entrypoint.sh` 是 dev 与 runner 两个 Dockerfile 目标共用的容器入口，同时承担三件事：schema 同步（`migrate deploy` / `db push` fallback）、新库 seed 启发式（`user.count() == 0`）、启动应用（`exec CMD`）。它是典型的**浅模块**：调用者要懂的知识（`MIGRATIONS_DIR` 探测规则、`NODE_ENV` 分支、`node_modules/.bin/prisma` 路径、seed 判定语义）几乎与实现一样多，且这些语义被 Dockerfile 注释、`.agents/project/deployment.md`、deploy.sh 的健康检查逻辑各自复述一份，没有局部性（locality）。

`migration-driven-schema-sync` 变更要求移除 `db push` fallback 并改为 fail-closed，若直接在 shell 上继续叠分支，浅模块会更宽；关键判定（fail-closed、何时 seed）依旧只能靠起容器验证，不可测试。

## 决策

把「数据库引导」下沉为深模块：

- **实现**放在 `src/bootstrap/`（jest `rootDir: src`，单测自动被 `pnpm test` 收集）；`scripts/db-bootstrap.ts` 只做 CLI 启动壳（沿 `scripts/docker-*.ts` 的薄 adapter 惯例），不含逻辑。
- **接口**收敛为单一入口 `bootstrapDatabase(deps): Promise<BootstrapResult>`；执行适配器（`runMigration` / `countUsers` / `runSeed` / `nodeEnv`）全部由 CLI 壳注入。fail-closed 校验、顺序不变量、seed 启发式全部在模块内部，对调用者不可见。
- **prisma migrate deploy 经 spawn CLI 调用**（Prisma 无公开程序化迁移 API），spawn 被封装为注入的 `runMigration` 适配器，测试给假实现即可。
- **seed 只编排不实现**：`countUsers() === 0 → runSeed()`，seed 内容仍归 `prisma/seed.ts`。生产适配器 spawn `node dist/prisma/seed.js`，开发走 ts-node。
- **`entrypoint.sh` 缩为 3 行 adapter**：`node dist/scripts/db-bootstrap.js && exec "$@"`（dev 目标对应 ts-node 形态）。

## 备选方案（已否决）

- **逻辑留在 shell，只抽判定小函数**：改动最小，但深度收益为零，判定仍不可单测。
- **整个模块（含 seed 执行）放 `scripts/`**：与 docker-*.ts 风格一致，但 jest 不收集 `scripts/`，要为一个模块动全局测试配置。
- **`prisma.$executeRaw` 自写迁移执行器**：脱离 CLI 后需自行维护 `_prisma_migrations` 表语义，等于重写迁移引擎。
- **吞并 seed 实现**：模块变巨石；删除测试表明 seed 内容复杂度在原处已自成体系，不属于同一模块。

## 后果

- fail-closed 与 seed 启发式首次获得单测（注入假适配器，不起容器）。
- 两个 Dockerfile 目标共用同一条接缝，引导策略变更只改模块内部，文档只引用不改写。
- 风险：`nest build` 产物须包含 `dist/scripts/db-bootstrap.js`（tsconfig.build.json 未排除 `scripts/`，预期成立，落地时以构建产物核验）。
- 运行镜像瘦身（白名单 COPY）与基线闸门模块化（候选 2/3）与之同族，可分别并入后续变更。
