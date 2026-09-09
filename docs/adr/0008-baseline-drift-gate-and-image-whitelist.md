# ADR 0008: 基线漂移闸门契约与运行镜像 prisma 载荷白名单

- 状态：已接受
- 日期：2026-09-03
- 关联：ADR 0007（db-bootstrap 深模块）、OpenSpec 变更 `migration-driven-schema-sync`、CONTEXT.md 词条 `Baseline-drift gate`

## 背景

两个遗留摩擦点：

1. 基线流程（线上 diff 闸门 → 全量生成 → resolve 标记）原规划为 bash 串三条 Prisma CLI。漂移判定若靠手抄命令行，「空输出=无漂移」「连不上库=硬错误」的语义成为隐式契约，一旦误判「无漂移」，坏基线会被永久提交进 git。仓库既有惯例（`runWeightedSort`、`extractPermissionCodes`）是把这类共享判定下沉为可测 TS 模块。
2. runner 镜像对 `prisma/` 整目录 COPY + `.dockerignore` 黑名单打洞：任何新增子目录默认进镜像——这正是 17MB 一次性迁移 SQL + 17MB 备份 dump 进入生产镜像的根因。「镜像只含运行所需」这一不变量靠纪律维持，不在结构里。

## 决策

### 一、Baseline-drift gate：独立双操作模块

- 落位 `src/bootstrap/baseline.ts`（与 db-bootstrap 同家族独立 interface；jest rootDir=src 自动收集 spec）。
- 两个意图命名的操作：`verifyNoDrift(dbUrl): DriftReport` 与 `generateBaseline(): BaselineFiles`；`migrate resolve --applied` 保留为人工步骤（模块打印具体命令行含迁移名，不自动执行）。
- **判据契约**：diff 输出 trim 后为空 = 无漂移（放行生成）；非空 = 有漂移（中止并输出 diff）；命令运行失败（连接错误等）= 硬错误，**不是漂移**。`DriftReport` 结构化返回，三种结果显式分离——「漂移」与「不可达」永不塌缩为同一个错误。
- CLI 入口：pnpm `prisma:migrate:baseline` → `ts-node` 跑模块的 main 函数，与 db-bootstrap 壳同模式（逻辑在 `src/`，壳薄）。
- 落地义务：在真库上验证三条路径的输出契约后再固化判定。

### 二、运行镜像载荷：白名单 + 黑名单双层

- runner 目标改为白名单：仅 `COPY prisma/migrations ./prisma/migrations`。运行镜像对 `prisma/` 的全部真实需求就是迁移目录（seed 走已编译 `dist/prisma/seed.js`；Prisma Client 已生成进 node_modules，无需 `schema.prisma`）。
- `.dockerignore` 黑名单仍全局追加 `prisma/scripts/`、`prisma/backups/`（同时保护 dev/runner 两目标与构建上下文）。**两层正交**：白名单定「必进」，黑名单定「永不进」；白名单已使黑名单对 runner 冗余，黑名单是第二道防线与对 dev 构建上下文的瘦身。
- dev 目标维持 `COPY . .` 不变（开发镜像不发布）。

## 备选方案（已否决）

- **baseline 并入 db-bootstrap 模块**：生命周期（一次性离线 vs 每次容器启动）、调用者、失败语义全不同，合并即巨石。
- **退出码判漂移**：连接失败的非零退出会被误判为「有漂移」，语义塌缩。
- **runner 顺带 COPY schema.prisma（33KB 排障便利）**：不预支；容器内排障需求出现时再补。
- **仅黑名单（现状规划 tasks 5.1）**：对未来新增子目录不设防，正是本次问题的根因。

## 后果

- 漂移判定与基线生成首次可单测；坏基线风险由 DriftReport 契约 + spec 场景覆盖。
- 运行镜像载荷从「默认全带」反转为「默认最小」；新增 prisma 子目录不再隐式进镜像。
- 风险：Prisma CLI diff 输出契约是外部行为，若未来 Prisma 版本变更输出语义，需同步更新判定与单测（在真库验证环节锁定版本行为）。
