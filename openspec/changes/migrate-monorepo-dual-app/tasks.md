# Tasks: 迁移到 Monorepo 双应用 + 共享内核

> 对应 design.md 的六步 Migration Plan；每步一个 commit，步内任务按依赖排序。

## 1. Workspace 骨架（纯构建层，代码不动）

- [x] 1.1 创建 `pnpm-workspace.yaml`（`apps/*` + `packages/*`）、根 `package.json` 转 private 聚合并保留编排 scripts；验证 `pnpm install` 成功且现有 `src/` 构建不受影响（`pnpm build` + `pnpm test` 全绿）

- [x] 1.2 创建 `tsconfig.base.json`（抽公共 compilerOptions）；建立 `packages/core`、`packages/domain`、`apps/admin`、`apps/mall` 的占位 `package.json`（name：`@gvray/core`、`@gvray/domain`，依赖 `workspace:*`）与占位 `tsconfig.json`；验证 `pnpm -r exec -- node -v` 能枚举全部包

- [x] 1.3 迁移 commit 落库（步骤 1），验证 `git log --follow` 可追溯（`git mv` 尚未发生，此步只动构建文件）

## 2. packages/core 平移（`@gvray/core`）

- [x] 2.1 `git mv` `src/{core,shared,prisma,logging,redis,bootstrap}` → `packages/core/src/`；剥离 B2C 专属文件暂回原位（`customer-jwt.strategy.ts`、`customer-jwt.guard.ts`、`@CurrentCustomer()` 留待步骤 4 迁 mall）；创建 `packages/core/src/index.ts` curated barrel（对外唯一 import 面，design D2）；验证目录结构符合 design D1 映射表、barrel 导出清单可编译

- [x] 2.2 配置路径映射：根/各包 tsconfig 增 `@gvray/core` → `packages/core/src`；全仓 import 批量改写 `@/core|@/shared|@/prisma|...` → `@gvray/core`（仅 barrel 面，禁止 `@gvray/core/src/**` 深路径；core 内部引用相对化）；验证 `grep -r "@/core\|@/shared\|@/prisma\|@/logging\|@/redis" src/ apps/ packages/` 零残留（占位期暂查 src）且 `grep -r "@gvray/core/src"` 零命中

- [x] 2.3 jest `moduleNameMapper` 增 `@gvray/(.*)` 映射；验证 `pnpm test` 全绿（spec 文件零搬迁、零修改）

- [x] 2.4 `pnpm build` + 本地启动原单应用（`/health` 200 + 登录冒烟）；commit 步骤 2

## 3. packages/domain 平移（`@gvray/domain`）

- [x] 3.1 `git mv` `src/modules/equipment/**`（五件套）与 `src/modules/inquiry/**` 的 Service/DTO/Module → `packages/domain/src/`（领域 Module 拆 providers-only，controllers 不随行）；admin 侧 controllers 留 `src/modules/equipment/` 原位，新建 admin 聚合 module（controllers + import 领域 EquipmentModule/InquiryModule）维持单应用可运行——由步骤 4.1 一次 `git mv` 至 `apps/admin/src/modules/equipment/`；验证 import 路径改写后 `pnpm build` 通过

- [x] 3.2 领域包 providers-only 清理：包内不残留任何 controller；DTO/常量（VisibilityOpts、B2C\_VISIBILITIES、加权排序 spec）随行；创建 `packages/domain/src/index.ts` barrel（services + DTOs 精选面，design D2）；验证 mall 侧 browse 仍编译通过（此步仍走原 `src/modules/b2c` 位置 import 新包，仅 barrel 面）

- [x] 3.3 `pnpm test` 全绿（equipment/inquiry 相关单测全部随迁）+ 双路径冒烟：admin `GET /equipment/filters`（带 JWT）与 `GET /b2c/filters`（匿名）行为不变；commit 步骤 3

## 4. Apps 拆壳与命名/路由收敛（BREAKING）

- [x] 4.1 `git mv` 剩余代码分流：`src/modules/{auth,system,dashboard,profile}`、`customer/{customers,addresses}`、`config` → `apps/admin/src/`（含步骤 3 遗留的 equipment/inquiry admin 聚合 module 与 controllers，一次迁移至 `apps/admin/src/modules/equipment/`）；`src/modules/b2c/**`、`customer/{customer-auth,customer-activity}` → `apps/mall/src/`；`customer-jwt.strategy/guard/@CurrentCustomer` → `apps/mall/src/`；`app.controller.ts`/`app.service.ts`（含 `/health`，tasks 6.2/6.3 冒烟依赖）复制为两 app 各自一份；删除旧 `src/`；验证两 app 各自 `nest build` 通过

- [x] 4.2 双 `main.ts`/`app.module.ts`：共享引导走 `@gvray/core` 的 `configureApp`（pino logger 接管 + 全局管道组合 + CORS，design D9），各端 main 只保留 Swagger（admin 现状、mall 标题 `GVRAY Mall API`）与端口；app.module——admin 保留全部横切（RequestLog/Response/OperationLog/FeatureFlag/Throttler + RBAC guards），mall 只挂 RequestLog/Response/HttpException/Throttler（独立 ThrottlerModule 预算，公开浏览 60/min 不变）——对照 specs/workspace 的横切挂载要求；验证 mall app 模块图不含 OperationLogInterceptor/FeatureFlagGuard/PermissionsGuard

- [x] 4.3 e2e harness 双工厂（design D8）：`test/harness/create-app.ts` 拆为 `createAdminTestApp()` / `createMallTestApp()`，共享既有 mock-prisma/mock-redis，全局管道配置经 `configureApp` 与双 main 复用同一接缝；三个 e2e spec 改指对应工厂（`equipment-anonymous` 的后台 `equipment/*` 401 断言走 admin 工厂）；补认证互斥 e2e：customer token 打 admin 路由 401、user token 打 mall 受保护路由 401；验证 `pnpm test:e2e` 全绿

- [x] 4.4 路由剥前缀（design D4 清单逐条）：mall 全部 `@Controller` 去前缀；e2e 断言同步（`test/equipment-anonymous.e2e-spec.ts` 匿名路径改无前缀）；验证 `grep -r "@Controller('b2c/\|@Controller('customer/" apps/mall` 零残留

- [x] 4.5 命名收敛：`B2cModule`→`MallModule`、`B2C_OPTS`→`MALL_OPTS`、`B2C*Controller`→`Mall*Controller`（文件名同步）；验证全仓 `grep -ri "b2c" apps/mall/src` 仅剩注释/文档性引用

- [x] 4.6 admin `jwt.strategy` 补显式 `realm === 'user'` 断言（先核存量 user token payload 均带 realm——见 design Risks；缺 realm 历史存量按 design 处理）；补互斥回归用例：customer token 打 admin 路由 401、user token 打 mall 路由 401；验证新用例通过

- [x] 4.7 D7 依赖方向 lint：apps 各自 `no-restricted-imports` 禁止 import 对方路径、packages 禁止 import `apps/*`，同时禁止 `@gvray/core/src`、`@gvray/domain/src` 深路径 import（design D2 barrel 约束）；验证故意注入违规 import 时 lint 报错（负向测试）

- [x] 4.8 `pnpm test` 全绿 + 双端本地启动冒烟；commit 步骤 4

## 5. 构建与 dist 重构

- [x] 5.1 `nest-cli.json` ×2（`apps/admin`、`apps/mall`，各自 sourceRoot）；`start:dev`/`start:prod`/`build` scripts 按包拆分（启动路径 `dist/apps/<app>/src/main.js`）；验证 `pnpm build` 产出 `dist/apps/**` + `dist/packages/**` 结构

- [x] 5.2 双端本地生产模式冒烟：`node dist/apps/admin/src/main.js` 与 `node dist/apps/mall/src/main.js` 各自 `/health` 200、Swagger 可达、代表路由行为符合 specs（enabled-only、加权排序、404 禁用记录）

- [x] 5.3 `.env` ×2：`apps/admin/.env.*`、`apps/mall/.env.*` 完整自持（含 DB/Redis 串重复）；jest rootDir 上移仓库根；验证 `pnpm test`（全仓单测）+ `pnpm test:e2e` 通过；commit 步骤 5

## 6. Docker / Compose 双镜像

- [ ] 6.1 Dockerfile ×2（构建上下文=仓库根）：admin 含 `dist/apps/admin` + `dist/packages` + `prisma/migrations` + `schema.prisma` + `dist/scripts/db-bootstrap.js`；mall 仅 `dist/apps/mall` + `dist/packages`；`.dockerignore` 保持排除 `prisma/scripts`、`prisma/backups`；验证镜像 payload：`docker run --rm --entrypoint sh IMG -c "ls ..."`（admin 含 migrations、mall 不含）

- [ ] 6.2 compose 三份（dev/test/prod）改双 service：`gvray-admin-app`（entrypoint.sh → db-bootstrap → exec）与 `gvray-mall-app`（直接 exec CMD，不调 db-bootstrap）；entrypoint 行尾 LF（`git config core.autocrlf` 注意 + 容器实测 exit 0）；验证 dev compose 双容器 `docker:dev:up` 全部 healthy

- [ ] 6.3 容器级冒烟：双容器加入 dev compose 网络、`REDIS_HOST=redis`；admin `/health` + migrate deploy 日志正常、mall `/health` 且日志无 schema 同步痕迹；customer token 打 admin 路由 401（ADR 0009 互斥 + 步骤 4.6 断言的 en vivo 验证）；匿名打 mall `/filters` 200 且 OperationLog 表无新增行（specs/workspace 的横切挂载场景）

- [ ] 6.4 `docker-build.ts` 脚本扩展双镜像目标（build/push/scan）；验证构建产物清单与回滚说明（design Migration Plan 回滚段）；commit 步骤 6

## 7. 收尾验证

- [ ] 7.1 对照 6 个 delta specs 逐条场景自检（workspace/b2c-browse/customer-auth/customer/inquiry/schema-migrations），记录逐条勾选结果；`openspec validate "migrate-monorepo-dual-app"` 通过

- [ ] 7.2 文档同步：AGENTS.md 关键目录段落、`.agents/project/architecture.md`、`deployment.md` 更新为双应用结构（工作区规则要求接口/部署变更同步文档）；更新 mall 调用方路径映射表入发布说明

