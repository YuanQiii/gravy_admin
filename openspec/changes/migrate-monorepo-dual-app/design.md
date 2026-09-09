# Design: 迁移到 Monorepo 双应用 + 共享内核

> 决策依据：ADR 0010（docs/adr/0010-monorepo-dual-app-shared-kernel.md）——15 项决策已定案，本文只展开实施面的 HOW。

## Context

现状为单 NestJS 应用：`src/app.module.ts` 同时挂载 Admin 全模块与 `B2cModule`，单容器 `gvray-admin-app`、单 Swagger、全局横切（RequestLog/Response/OperationLog 拦截器、FeatureFlag/Throttler 守卫）两端共用。B2C browse 经 VisibilityOpts 三分流复用后台领域 Service（ADR 0005）；认证为两套 JWT 域（ADR 0009）。构建事实：`nest-cli.json` 单 app（sourceRoot: `src`）、tsconfig 单项目 `@/*` 别名、产物经别名重写为相对路径（dist 产物无 `@/` 残留已验证）；pnpm 9 已是包管理器；jest 单配置 rootDir: `src`。

## Goals / Non-Goals

**Goals:**

- 落地 ADR 0010 的目标形态：`apps/admin` + `apps/mall` + `packages/core`(`@gvray/core`) + `packages/domain`(`@gvray/domain`)，每步迁移后 `pnpm test` 全绿、两端可启动冒烟。
- 路由前缀剥除与命名收敛（b2c→mall）一次到位，行为符合本变更 6 个 delta specs。
- mall 匿名流量不再触发 admin 审计写与 FeatureFlag 查询；限流预算按 app 独立。

**Non-Goals:**

- 不拆数据库/Redis（拆进程不拆数据；数据级拆分待独立写模型需求另立 ADR）。
- 不收敛 `authenticateByRealm`（ADR 0010 决策 12：维持缓做，只补 admin 侧显式 realm 断言）。
- 不动 VisibilityOpts 三分流语义、加权排序、权限码、SessionStore 接口——平移不改行为。
- 不建 `@gvray/customer-domain` 共享包（ADR 0010 决策 8 非目标）。
- 不引入 turbo/nx 编排、不拆 per-package jest（升级触发条件见 ADR 0010 决策 9/15）。
- 不迁移 OpenSpec 能力目录路径（`b2c/browse` 保持既有路径；新代码命名用 mall，规格目录名是既有约定）。

## Decisions

### D1 目录映射（全部 `git mv` 保 blame 链）

| 现路径 | 目标路径 |
|---|---|
| `src/core/**`、`src/shared/**`、`src/prisma/**`、`src/logging/**`、`src/redis/**`、`src/bootstrap/**` | `packages/core/src/**` |
| `src/modules/equipment/**`（五件套 Service/DTO/Module） | `packages/domain/src/equipment/**` |
| `src/modules/inquiry/**`（Service/DTO/Module，controllers 除外） | `packages/domain/src/inquiry/**` |
| `src/modules/{auth,system,dashboard,profile}/**`、`src/modules/customer/{customers,addresses}/**`、`src/config/**` | `apps/admin/src/**` |
| `src/modules/b2c/**`、`src/modules/customer/{customer-auth,customer-activity}/**` | `apps/mall/src/**` |

归属再切分（在各步内完成）：

- `src/core/strategies/customer-jwt.strategy.ts` + `guards/customer-jwt.guard.ts` + `@CurrentCustomer()` decorator → `apps/mall/src/`；`jwt.strategy`/`JwtAuthGuard`/`PermissionsGuard`/`RolesGuard` → `apps/admin/src/`。SessionStore、JwtService、`AuthRealm` 常量留在 `@gvray/core`。
- 领域包内 controllers（`filters.controller.ts` 等 admin 侧）→ `apps/admin/src/modules/equipment/`；领域包只剩 providers + DTO（providers-only，ADR 0010 决策 7）。
- `app.module.ts` 复制为两份分别演化：admin 保留全部 admin 横切挂载；mall 只挂 RequestLog/Response/HttpException/Throttler。`main.ts` 的共享引导收敛为 `@gvray/core` 的 `configureApp` 接缝（见 D9），各端 main 只保留 Swagger 与端口；`app.controller.ts`/`app.service.ts`（含 `/health`，容器冒烟依赖）两 app 各自一份。
- `prisma/schema.prisma`、`prisma/migrations/`、`prisma/seeds/` 留在仓库根 `prisma/`（`@gvray/core` 经相对路径消费；单一所有权）。`scripts/db-bootstrap.ts`、`docker/entrypoint.sh` 归 admin。

### D2 workspace 与包结构

- `pnpm-workspace.yaml`：`apps/*` + `packages/*`；根 `package.json` 转 private 聚合（scripts 移交各包，保留 `pnpm -r` 编排入口）。
- 各包独立 `package.json`：`@gvray/core` 依赖 prisma/redis/pino/nestjs-pino 等；`@gvray/domain` 依赖 `@gvray/core` + class-validator 等；apps 依赖两个包 + 各自特有（admin：`@nestjs/throttler` 之外的 swagger/jwt/passport 按需；mall：passport-jwt）。根保留 devDeps（typescript、jest、eslint、prettier、prisma CLI）。
- tsconfig 三层：根 `tsconfig.base.json`（公共 compilerOptions）+ 每包/每 app `tsconfig.json`。路径映射：`@gvray/core` → `packages/core/src`、`@gvray/domain` → `packages/domain/src`（源码直连，ADR 0010 决策 9）；app 内保留 `@/*` 指向各自 `src/*`。packages 内部引用一律 `@gvray/core`，禁止相对路径跨包。
- **barrel 导出（包的唯一 public interface）**：`packages/core/src/index.ts` 与 `packages/domain/src/index.ts` 为 curated barrel——core 导出 PrismaService/RedisService/SessionStore/JwtService/ResponseUtil/ResponseInterceptor/HttpExceptionFilter/请求日志拦截器/sensitive-keys 常量等；domain 导出领域 Service + DTOs + VisibilityOpts/B2C_VISIBILITIES 常量。消费方只允许 `import ... from '@gvray/core'`（barrel 面），禁止 `@gvray/core/src/**`、`@gvray/domain/src/**` 深路径 import——由 D7 lint 规则结构化禁止。barrel 是共享包的接口（interface）：小接口 + 大实现，内部文件重组不波及消费方（locality）。
- `@/*` 旧别名在迁移中批量改写为新路径（`@/modules/equipment/...` → `@gvray/domain` 或 app 内路径）；改写用精确 import 替换，`grep` 验证零残留。

### D3 构建与启动

- `nest-cli.json` ×2（`apps/admin/`、`apps/mall/`），各自 `sourceRoot: src`；不用 nest-cli monorepo mode（ADR 0010 决策 1）。
- 编译单元含 packages 源码后公共 rootDir 上移仓库根：dist 结构变为 `dist/apps/<app>/src/main.js` + `dist/packages/**`。启动命令：`node dist/apps/admin/src/main.js`、`node dist/apps/mall/src/main.js`；`start:dev` 用 `nest start --path` 指向各 app 目录（或 `nest start --project` 等价参数）。
- jest：根配置 rootDir 上移 `.`，`moduleNameMapper` 增 `@gvray/(.*)` → `<rootDir>/packages/$1/src`，`testRegex` 不变（spec 零搬迁）。
- `.env`：`apps/admin/.env.{NODE_ENV}` 与 `apps/mall/.env.{NODE_ENV}` 各自完整自持；`ConfigModule` envFilePath 相对各 app 目录。共享默认值（DB/Redis 串）在各自 `.env` 中重复（ADR 0010 决策 14）。

### D4 路由与命名收敛（BREAKING）

- mall 侧 `@Controller` 路径全部剥前缀：`b2c/filters`→`filters`、`b2c/equipment`→`equipment`、`b2c/catalogs`→`catalogs`、`b2c/brands`→`brands`、`b2c/filter-types`→`filter-types`、`b2c/inquiries`→`inquiries`、`b2c/addresses`→`addresses`、`customer/auth`→`auth`、`customer/favorites`→`favorites`、`customer/history`→`history`。
- 类名/常量重命名：`B2cModule`→`MallModule`、`B2C_OPTS`→`MALL_OPTS`、`B2C*Controller`→`Mall*Controller`（文件名同步 kebab-case）。e2e 断言路径同步更新。
- mall Swagger 标题 `GVRAY Mall API`，admin Swagger 标题保持现状。
- admin 侧路由零变化（`equipment/*`、`customer/*`、`system/*` 等保持）。

### D5 认证加固（随行安全项）

- admin `jwt.strategy` validate 增加 `payload.realm === 'user'` 显式断言（`AuthRealm` 常量已在 core），失败按 401 处理——替换现状"customer token 恰好缺 roleKeys 被间接拒绝"的巧合防线（ADR 0009 后果段标注的安全项）。
- 补充互斥回归用例：customer token 打 admin 路由 → 401；user token 打 mall 路由 → 401。
- 两 strategy/guard/decorator 分居两 app 后各自独立测试，不再有进程内交叉。

### D6 Docker 与部署

- `Dockerfile` ×2（context 均为仓库根，含 `packages/`）：admin 镜像 COPY `dist/apps/admin` + `dist/packages` + `prisma/migrations` + `prisma/schema.prisma` + `dist/scripts/db-bootstrap.js`；mall 镜像 COPY `dist/apps/mall` + `dist/packages`（不含 migrations/schema——它不跑迁移）。`.dockerignore` 保持排除 `prisma/scripts`、`prisma/backups`。
- compose（dev/test/prod）：双 service（`gvray-admin-app`、`gvray-mall-app`）+ 既有 postgres/redis；mall 入口直接 `exec CMD`（不调 db-bootstrap）；admin 入口保持 `entrypoint.sh` → db-bootstrap → exec。entrypoint 新建/改动必须 LF 行尾（CRLF→exit 127 先例）。
- 镜像 payload 验证沿用既有方法：`docker run --rm --entrypoint sh IMG -c "ls ..."` 确认双镜像内容物。

### D7 依赖方向守护（workspace spec 可测试性的落地）

- 最小实现：eslint `no-restricted-imports`（apps 各自禁止 import 另一 app 的路径模式）+ packages 禁止 import `apps/*`。不上 dependency-cruiser（YAGNI，触发条件：规则需要图分析时）。
- 同规则覆盖 D2 barrel 约束：禁止 `@gvray/core/src/**`、`@gvray/domain/src/**` 深路径 import（一并在 `no-restricted-imports` patterns 中列出）。

### D8 e2e harness 双工厂

`test/harness/create-app.ts` 现直接 import 单一 `src/app.module` 并 override PrismaService/RedisService；步骤 4 删除 `src/` 后该接缝必须随之拆分，否则 e2e 集体断链。拆法：

- 拆为 `createAdminTestApp()` / `createMallTestApp()` 两个工厂，各自 import 对应 `apps/<app>/src/app.module`；mock-prisma/mock-redis 等共享夹具留在公共 harness 目录（两工厂复用，不复制）。
- 全局管道/中间件配置不内联在工厂里，统一经 `configureApp`（D9）——工厂与双 `main.ts` 消费同一接缝，保证"测试环境 = 生产引导路径"（接口即测试面）。
- 三个既有 e2e spec 改指对应工厂：`equipment-anonymous` 中后台 `equipment/*` 401 断言走 admin 工厂、匿名浏览断言走 mall 工厂；favorites/history 等走 mall 工厂。
- 补认证互斥 e2e：customer token 打 admin 路由 401、user token 打 mall 受保护路由 401（与 D5 回归用例呼应，一个在单测层、一个在 e2e 层）。

### D9 main.ts 共享引导接缝（configureApp）

`src/main.ts` 约 70% 与应用无关：pino logger 接管、`EmptyStringTransform` + `ValidationPipe`（whitelist/forbidNonWhitelist/transform）管道组合、CORS、prefix（全局 `api` 前缀若两端口径一致则共享）。收敛方案：

- `@gvray/core` 导出 `configureApp(app: INestApplication)`：一次性完成 logger 接管、全局管道组合、CORS——双 `main.ts` 与 D8 双测试工厂的公共引导路径。
- 各端 `main.ts` 只保留端特定差异：Swagger（admin 现状标签/ mall 标题 `GVRAY Mall API`）与端口监听。
- 收益（locality）：引导逻辑单点维护——未来加全局管道（如序列化 interceptor）只改 core 一处，双端自动继承；两 app 的引导漂移被结构性消除。

## Risks / Trade-offs

- [大范围 `git mv` + import 改写出错导致行为漂移] → 每步迁移后 `pnpm test` + `pnpm build` + 双端启动冒烟（`/health`）；`git mv` 保历史；e2e 断言路径同步更新。
- [dist 结构变化击穿启动命令/entrypoint] → 步骤⑤单列"构建与 dist 重构"，本地先 `node dist/apps/*/src/main.js` 冒烟再动 Dockerfile；容器冒烟沿用"加入 dev compose 网络 + REDIS_HOST=redis 容器名"的既有方法。
- [路由剥前缀是 BREAKING，mall 调用方未同步] → 与迁移同版本发布（ADR 0005 supersede 先例）；mall 前端尚在建设期，破坏面已最小化；发布说明列出全部新旧路径映射（见 D4）。
- [双容器启动竞争 migrate deploy] → mall 镜像根本不含 migrations 目录、入口不调 db-bootstrap（结构性排除，而非运行时判断）。
- [共享包发版触发双镜像重建，CI 变重] → 接受（ADR 0010 决策 5 已权衡）；当前无独立 CI 编排，本地构建脚本 `docker-build.ts` 扩展为双目标。
- [admin realm 断言误伤既有后台 token] → 断言前先核实现有 `JwtService` 签发的 user token 均带 `realm`（或按 ADR 0009 D7 两域共用签发路径确认 payload 结构）；缺 realm 的历史存量 token 若存在，提供一次性兼容（payload 带 roleKeys+status 且无 realm 视为 user）——实施时以 grep + 实测定夺，不默认加兼容。
- [customer-activity 的 `recordView` 现状无调用点（记忆遗留）] → 不在本变更范围内修；平移时保持原样并留 TODO。

## Migration Plan

六步串行（ADR 0010 决策 13），每步独立可提交可回滚：

1. **workspace 骨架**：`pnpm-workspace.yaml` + 根/子包 `package.json` + `tsconfig.base.json`；代码仍在 `src/`（占位 package.json 先行，避免双源）。验证：`pnpm -r install`、`pnpm test`。
2. **packages/core 平移**：D1 映射表第一批 `git mv`；import 改写；`@gvray/core` paths 生效。验证：build + test + 单应用（原 app）启动。
3. **packages/domain 平移**：equipment 五件套 + inquiry 的 Service/DTO/Module（领域 Module 拆 providers-only；admin controllers 留 `src/modules/equipment/` 原位、由新建的 admin 聚合 module 承载，维持单应用可运行，步骤 4 一次 `git mv` 至 apps/admin）。验证同上。
4. **apps 拆壳**：`src/` 剩余代码分流至 `apps/admin/src` 与 `apps/mall/src`；双 `main.ts`/`app.module.ts`；mall 剥横切挂载；D4 命名/路由收敛；D5 realm 断言；D7 lint 规则。
5. **构建与 dist 重构**：nest-cli ×2、启动命令、jest rootDir、`.env` ×2；删除旧 `src/`。验证：双端本地启动 + 全量测试。
6. **Docker/compose**：Dockerfile ×2、compose dev/test/prod 双 service、entrypoint 分流、镜像 payload 验证、容器冒烟（`/health` + 代表性路由 + customer token 打 admin 路由 401）。

回滚策略：每步一个 commit；步骤 1-3 不改变外部行为，可直接 revert；步骤 4-6 涉及路由 BREAKING，回滚 = revert commit + 重新构建旧单镜像（旧镜像在步骤 6 之前仍是可部署产物）。

## Open Questions

（无——15 项决策已在 grilling 会话定案并记录于 ADR 0010；唯一实施期校验点（存量 user token 是否均带 realm）已列入 Risks 的验证流程。）
