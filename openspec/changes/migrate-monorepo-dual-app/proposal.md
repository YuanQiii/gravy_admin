# 迁移到 Monorepo 双应用（apps/admin + apps/mall）+ 共享内核

> 依据 ADR 0010（docs/adr/0010-monorepo-dual-app-shared-kernel.md，2026-09-09 已接受），本变更将其 15 项决策落为可实施的迁移。

## Why

单 NestJS 进程同时承载两个消费域——Admin（运营端）与 B2C 商城端：任一端发版即另一端重启（爆炸半径共享）；`BrowseModule` 整图 import 后台领域 Module，"mall 依赖 admin、反向禁止"只是约定而非物理结构；`src/modules/customer/` 混居 admin 代管与 mall 自助四种关注点；mall 匿名请求每请求空穿 FeatureFlagGuard（查 admin 配置表）与 OperationLogInterceptor（写 admin 审计表）。ADR 0009 预言的"独立商城服务"演进窗口已到（mall 前端尚在建设期，路由变更破坏面最小）。

## What Changes

- **工作区拆分**：裸 pnpm workspace——`apps/admin`（运营端）+ `apps/mall`（商城端）+ `packages/core`（`@gvray/core`：prisma+migrations、redis、SessionStore、JwtService、logging、Response/Exception、SoftDelete、BaseService）+ `packages/domain`（`@gvray/domain`：equipment 五件套 + inquiry 的 Service/DTO，providers-only，VisibilityOpts 三分流 seam 原样随行）。

- **命名收敛**：`b2c` 不再用作应用/模块名（CONTEXT.md 已定案禁用）；`B2cModule`→`MallModule`、`B2C_OPTS`→`MALL_OPTS`。

- **Prisma 单一所有权**：`schema.prisma` + `prisma/migrations` + PrismaService 归 `@gvray/core`；`migrate deploy`（db-bootstrap）只随 admin 镜像入口执行，mall 容器永不执行 schema 同步。

- **双镜像双容器**：`gvray-admin` / `gvray-mall` 各自 Dockerfile、compose service、端口、Swagger 文档。

- **BREAKING（路由前缀剥除）**：mall 侧路由 `b2c/filters`→`/filters`、`customer/auth`→`/auth`、`customer/favorites`→`/favorites`、`customer/history`→`/history`、`b2c/addresses`→`/addresses`、`b2c/inquiries`→`/inquiries`——资源名即路径，端口即命名空间。现有 mall 调用点需同版本更新。

- **横切按端挂载**：mall 挂 RequestLog/Response/HttpException/Throttler（独立预算）；OperationLogInterceptor、FeatureFlagGuard、PermissionsGuard 只挂 admin——mall 匿名流量不再触发 admin 域查询与审计写。

- **认证安全加固**：admin `jwt.strategy` 补显式 `realm === 'user'` 断言，关闭"customer token 恰好缺 roleKeys"的巧合防线（ADR 0009 标注的安全项）。`authenticateByRealm` 维持缓做。

- **消费机制**：tsconfig paths 源码直连（`@gvray/*` → `packages/*/src`）；dist 结构变为 `dist/apps/... + dist/packages/...`。

- **测试与配置**：根 jest 配置 rootDir 上移仓库根（spec 零搬迁）；每 app 独立 `.env.*`。

## Capabilities

### New Capabilities

- `workspace`：Monorepo 双应用工作区——admin/mall 进程与部署隔离、共享内核两包的依赖方向约束（apps 互不 import、domain→core 单向）、限流预算按应用独立核算、横切设施按端挂载。

### Modified Capabilities

- `b2c/browse`：全部浏览端点路径从 `b2c/*` 前缀改为无前缀（BREAKING）；其余行为（enabled-only、加权排序、60/min 限流、匿名开放）不变。

- `customer/auth`：认证端点路径 `customer/auth/*` → `/auth/*`（BREAKING）；凭证、令牌域隔离、刷新/登出行为不变。

- `customer`：客户自助地址端点 `/b2c/addresses` → `/addresses`、询价地址引用 `POST /b2c/inquiries` → `POST /inquiries`（BREAKING）。

- `inquiry`：B2C 客户询价端点 `/b2c/inquiries` → `/inquiries`（BREAKING）。

- `schema-migrations`：迁移执行收敛——`migrate deploy` 仅由 admin 应用容器入口执行，mall 容器不执行任何 schema 同步。

## Impact

- **构建系统**：根 `package.json` + `pnpm-workspace.yaml`、tsconfig 别名延伸（`@gvray/*`）、nest-cli 双 app、启动命令（`start:prod` 路径随 dist 结构变化）、jest rootDir 与 moduleNameMapper。

- **目录重组**：`src/{core,shared,prisma,logging,redis}` → `packages/core/src`；`src/modules/equipment`（五件套）+ inquiry Service/DTO → `packages/domain/src`；剩余模块 → `apps/admin/src`；`src/modules/b2c` + `customer-auth` + `customer-activity` → `apps/mall/src`。全部 `git mv` 保 blame 链。

- **部署**：Dockerfile ×2、`docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.test.yml` 双 service；entrypoint 保持 LF 行尾（CRLF→exit 127 先例）；migrate deploy 只挂 admin 入口。

- **外部调用方**：mall 前端/商城进程需同版本更新路由（同 ADR 0005 supersede 先例）。

- **不迁移**：共享 DB 与 Redis（拆进程不拆数据，数据级拆分留待独立写模型需求出现时另立 ADR）；`b2c/browse` 能力的 specs 目录路径保持不变（OpenSpec 既有路径约束）。

