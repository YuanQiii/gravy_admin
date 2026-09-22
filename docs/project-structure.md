# 项目结构详解

Monorepo 双应用 + 共享内核（决策与被否方案见 [ADR 0010](adr/0010-monorepo-dual-app-shared-kernel.md)）。本文只讲**每个位置为什么这么挂**——具体目录清单的权威来源是 [AGENTS.md](../AGENTS.md) 的「关键目录」与各包自己的 `AGENTS.md`，此处不复述（复述必然漂移）。

## 为什么是两个 app

`apps/admin`（运营端）与 `apps/mall`（商城端）是两个消费域，各有独立进程、端口、镜像与 Swagger。拆开的收益是**变更与爆炸半径互不相扰**：任一端发版不再重启另一端；限流预算按端核算；横切按端挂载——mall 的匿名流量不查 admin 的 FeatureFlag 配置表、也不写 admin 的审计表。

边界与代价：两端仍共享同一 DB 与 Redis（本决策拆进程不拆数据）；两端**互不 import**，只能经共享内核通信（有 eslint 守卫）。

## 为什么是两个 packages

分界线是**变更节奏**：`packages/core` 随基础设施演进（季度级），`packages/domain` 随业务漂移（周级）。合成一个 god package 会让"改一行加权排序"也 bump 基础设施版本；再拆细则在 2 人团队里是负杠杆。

- `packages/core`：共享内核（装饰器 / 守卫 / 拦截器 / 过滤器 / 管道 / 策略 + Prisma + Redis + 日志 + BaseService）。唯一 import 面是 barrel `index.ts`，禁止 `@gvray/*/src` 深路径。
- `packages/domain`：共享领域包（equipment 五件套 + inquiry 的 Service/DTO）。
- **没有 customer 共享包**：两端 customer 相关零共享 service 代码，合并是空接缝，且违背 [ADR 0002](adr/0002-independent-customer-model.md) 的两种信任维度。

## 为什么包只导出 Module（providers-only）

包只导出 Nest Module（Service + DTO），**不带 controller**。路由前缀、守卫组合、限流预算、Swagger 分组都是**端特定**关注点，所以 controller 是两端各自的薄 adapter，归端不归包。

## 为什么 `prisma/` 挂在根

单一所有权：`schema.prisma` + `migrations` + PrismaService 全归 `@gvray/core`，两个 app 都禁止各自 generate；`migrate deploy` 只随 **admin** 容器入口执行（fail-closed），mall 容器永不碰 schema——防双容器启动时的竞争。

## 为什么 apps 直接消费包的源码

apps 的 tsconfig paths 把 `@gvray/*` 指向 `packages/*/src`，包源码与 app 进同一次编译（无需先构建包）。代价是公共 rootDir 上移后 dist 结构变为 `dist/apps/... + dist/packages/...`，启动命令与 Dockerfile 需相应调整。

## 其他顶层目录

- `prisma/`：Schema + 迁移 + seed，两端共享（单一所有权）。
- `scripts/`：db-bootstrap 薄 CLI、docker-build / docker-deploy 等工程脚本。
- `docker/`：`entrypoint.sh`、nginx 配置、部署与构建脚本。
- `openspec/`：行为规格（`specs/`）与变更流水线（`changes/`）。
- `docs/`：人向文档，含 `adr/`（决策记录）与经验库、以及 `wayfinder/`（在役专题）。
- `.agents/project/`：agent 按需语料，路由表见 [AGENTS.md](../AGENTS.md)。

> mall 路由的旧→新映射是一次性 BREAKING 发布说明，已随迁移报告收敛进 [ADR 0010 的补充说明](adr/0010-monorepo-dual-app-shared-kernel.md)。
