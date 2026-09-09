# Monorepo 双应用迁移总结报告

> 迁移代号：`migrate-monorepo-dual-app`（OpenSpec 变更）
> 日期：2026-09-09
> 决策依据：ADR 0010（`docs/adr/0010-monorepo-dual-app-shared-kernel.md`）

---

## 一、背景与目标

原单 NestJS 进程（`src/app.module.ts`）同时承载 **Admin**（运营端：RBAC、Equipment/Inquiry/Customer 代管、系统管理）与 **B2C 商城端**（匿名浏览 + 客户自助）两种消费域，路由前缀（`b2c/`、`customer/`）粘连、横切（OperationLog / FeatureFlag / 限流）两端共享，边界不清。

**目标**：解耦为 Monorepo，两个独立可部署的应用（Admin + Mall）共享两个内核包（`@gvray/core` / `@gvray/domain`），单向依赖、命名收敛、认证域互斥加固。

---

## 二、目标架构

```
apps/admin          ← 运营端：全量横切、RBAC、管理端点
apps/mall           ← 商城端：匿名浏览 + 客户自助，有限横切（RequestLog/Response/Throttler）
packages/core       ← @gvray/core：基础设施、Prisma/Redis/日志、bootstrapDatabase、configureApp
packages/domain     ← @gvray/domain：equipment 五件套 + inquiry（providers-only）
```

- 两 app 互不 import，仅依赖共享内核（eslint `no-restricted-imports` 结构化守护）。
- 依赖方向：`domain → core`；`apps → core/domain`；禁止 `@gvray/*/src` 深路径。
- 独立部署：独立进程/端口/容器/镜像/Swagger；独立限流预算。

---

## 三、六步迁移与验证

| 步骤 | 内容 | 关键点 | 验证 |
|---|---|---|---|
| 1 | Workspace 骨架 | `pnpm-workspace.yaml`、`tsconfig.base.json`、包占位 `package.json` | `pnpm install`、构建不回退 |
| 2 | `@gvray/core` 平移 | 基础设施迁入，`import` 改写为 barrel 面 | build + test 全绿 |
| 3 | `@gvray/domain` 平移 | equipment/inquiry providers-only、barrel | equipment/inquiry 单测随迁 |
| 4 | Apps 拆壳 | 双 `main.ts`/`app.module.ts`、路由剥前缀、命名收敛（b2c→mall）、realm 断言、D7 依赖 lint | 命名 grep 清零、互斥 e2e 通过 |
| 5 | 构建与 dist | nest build×2 自包含 dist、`.env` 拆分、jest 多项目 | `pnpm test` 145、双端生产启动冒烟 |
| 6 | Docker 双镜像 | Dockerfile×2、compose 双 service、双镜像构建与容器冒烟 | payload 校验、realm 401、operation_logs 零写入 |
| 7 | 收尾 | 6 个 delta specs 自检、`openspec validate`、文档同步 | validate valid、README/架构/部署文档更新 |

**全局质量门**：
- 单元测试：**145** 通过（29 suites）
- e2e：**43** 通过（3 suites）
- `openspec validate "migrate-monorepo-dual-app"`：**valid**
- 双生产镜像实构建：admin（1.68GB）、mall（337MB），容器内完成 `pnpm build`

---

## 四、关键设计决策

1. **双应用独立部署**（D1/D3/D6）：admin + mall 各自 nest-cli、端口、Dockerfile、compose service。mall 走有限横切，不挂 OperationLog/FeatureFlag。
2. **共享内核 barrel**（D2）：`@gvray/core` / `@gvray/domain` 的唯一公共接口，禁止深路径 import（D7 lint 落地）。
3. **命名收敛**（D4）：`b2c/`、`customer/` 前缀剥除；`B2cModule→MallModule`、`B2C_OPTS→MALL_OPTS`、`B2C*Controller→Mall*Controller`。
4. **认证域互斥加固**（D5）：后台 `JwtStrategy` 补显式 `realm==='user'` 断言（签发侧加 `realm` + 一次性兼容），关闭"customer token 恰好缺 roleKeys"的巧合防线。
5. **共享引导接缝**（D9）：`configureApp`（pino 接管 + 全局管道 + CORS）经 `@gvray/core` 复用，双 main 与 e2e 工厂同一路径。
6. **schema 同步仅 admin**：mall 镜像结构排除 migrations/schema、不调 db-bootstrap；admin 经 fail-closed `bootstrapDatabase` 跑 `migrate deploy`。

---

## 五、破坏性变更：Mall 路由映射

商城端剥除历史前缀（`b2c/`、`customer/`），**发布时间需同步下发调用方**：

| 旧路径 | 新路径 |
|---|---|
| `GET /b2c/filters`、`/b2c/filters/:id` | `GET /filters`、`/filters/:id` |
| `GET /b2c/equipment`、`/b2c/equipment/:id` | `GET /equipment`、`/equipment/:id` |
| `GET /b2c/catalogs`、`/b2c/catalogs/:id` | `GET /catalogs`、`/catalogs/:id` |
| `GET /b2c/brands[/:id]/hot` | `GET /brands[/:id]/hot` |
| `GET /b2c/filter-types[/:id]/options` | `GET /filter-types[/:id]/options` |
| `POST /customer/inquiries`、`GET /customer/inquiries[/:id]` | `POST /inquiries`、`GET /inquiries[/:id]` |
| `/customer/addresses*`（POST/GET/PATCH/DELETE） | `/addresses*` |
| `/customer/auth/login\|refresh\|logout` | `/auth/login\|refresh\|logout` |
| `/customer/favorites`、`/customer/history` | `/favorites`、`/history` |

> 后台（Admin）路由**零变化**：`equipment/*`、`customer/addresses`、`inquiry/*`、`system/*` 保持。
> 完整表见 `docs/project-structure.md`。

---

## 六、构建 / 运行 / 部署

```bash
pnpm build                  # packages → scripts → admin → mall（dist/apps/* 自包含）
pnpm start:admin            # node dist/apps/admin/apps/admin/src/main.js
pnpm start:mall             # node dist/apps/mall/apps/mall/src/main.js
pnpm test                   # 全仓单测（jest 多项目）
pnpm test:e2e               # e2e（双工厂）
pnpm docker:dev:up          # dev compose 双 service（admin:3000，mall:MALL_PORT:3001）
pnpm docker:up              # 生产 compose 双 service
./docker/scripts/build.sh   # 构建双镜像（gvray-admin / gvray-mall）
```

- 镜像：`Dockerfile`(admin)、`Dockerfile.mall`(mall)；compose `admin`/`mall` 双 service。
- admin 容器入口跑 db-bootstrap（migrate deploy + fail-closed），mall 直接 exec。
- `.env`：`apps/admin/.env.*`、`apps/mall/.env.*` 各自自持。

---

## 七、验证证据（6 个 delta specs 全部通过）

逐条记录见 `openspec/changes/migrate-monorepo-dual-app/verification.md`。要点：

- **双应用独立**：admin/mall 独立端口与容器，`/api` 各自 200，swagger 标题独立；admin 镜像无 mall 树。
- **依赖方向**：lint 负向测试 + `grep` 无跨 app import。
- **限流**：mall 公开浏览 60/min → 429 + `Retry-After`；admin 独立预算。
- **横切隔离**：mall 匿名 `/filters`、`/equipment` 200，且 `operation_logs` 表前后行数不变（零审计写）。
- **认证互斥**：customer token（伪造 roleKeys）打 admin `/equipment/filters` → 401（realm 断言 en vivo）。
- **schema 迁移**：admin 容器 `migrationApplied=true`；mall 镜像无 migrations/schema，不跑同步。

---

## 八、回滚与后续

**回滚**：每步独立 commit；步骤 1–3 不改变外部行为可直接 `git revert`；步骤 4–6 涉及路由 BREAKING，回滚 = revert commit + 重建旧单镜像（步骤 6 前的旧单镜像仍可部署）。

**已知遗留 / 后续**：
- `docker:dev:up` 的 dev-target 热重载 CMD 尚未落地（prod 生产镜像已实证；dev 镜像需 build-then-run 或 `nest start --watch --config`）。
- `packages/domain` 独立 `tsc` 产物含 core 副本（source-path 映射副作用，不影响运行期——app 构建自包含，镜像内容物已核验）。
- `SessionHeartbeatInterceptor` 迁至 admin（依赖 TokenService），后续可评估真正挂载或废弃。
- mall 前端仍在建设期，路径映射已随发布说明下发。