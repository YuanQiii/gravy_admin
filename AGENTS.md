# GVRAY Admin — Agent 指南

本文件是 agent 自动加载入口，只保留高优先级规则。详细规范按需读取，不在这里导入长文档。

指令优先级：本文件（自动加载入口）> `.agents/project/` 按需文档；两者与源码冲突时以源码为准。若将来新增 `CLAUDE.md`，必须在其中保留一行 `@AGENTS.md` 导入——否则 Claude Code 只认 `CLAUDE.md`，本文件不再被加载。

## 项目概况

GVRAY 后端为 Monorepo 双应用 + 共享内核：NestJS 11 + TypeScript，Prisma 6 + PostgreSQL（数据库原生外键约束）、JWT 认证、RBAC 权限模型、Swagger/OpenAPI 与 Docker 部署。Admin 应用（运营端）与 Mall 应用（商城端）共享 `@gvray/core` / `@gvray/domain`。

## 关键目录

- `apps/admin/src/`：Admin 应用（运营端）——业务模块（`modules/`，系统管理在 `apps/admin/src/modules/system/`）、admin 专属基础设施（`core/`：JwtAuthGuard / RolesGuard / PermissionsGuard / jwt.strategy 等）

- `apps/mall/src/`：Mall 应用（商城端）——匿名浏览 + 客户自助（`modules/mall/`、`modules/customer-auth/`、`modules/customer-activity/`）、客户认证基础设施（`core/`：CustomerJwtGuard / customer-jwt.strategy / @CurrentCustomer）

- `packages/core/src/`：共享内核（`@gvray/core`）——基础设施（decorators/guards/interceptors/filters/pipes/strategies）、`prisma/`（Nest Prisma Module/PrismaService，`@Global()`）、`shared/`（constants/DTO/interfaces/utils/services 含 BaseService）、`logging/`、`redis/`

- `packages/domain/src/`：共享领域包（`@gvray/domain`）——equipment 五件套与 inquiry 的 Service/DTO（providers-only，无 controller）

- `prisma/`：`schema.prisma`、`seed.ts`、`seeds/`（单一所有权，核心包相对路径消费）

## 开发硬规则

- 先读相关模块，不要整仓读取；文档与源码冲突时以源码为准。

- Controller 只处理路由、鉴权、DTO、Swagger；业务逻辑放 Service。

- 返回业务数据由 `ResponseInterceptor` 自动包装；自定义 message/code/分页用 `ResponseUtil`；分页结构为 `{ items, total, page, pageSize }`。

- 禁止返回未过滤的 Prisma 对象；禁止响应中出现 `password`、token、secret；禁止暴露数据库自增 `id`（对外暴露业务 UUID，如 `userId`）。

- 权限码使用 `@gvray/core` 的 `permissions.constant`（`packages/core/src/shared/constants/permissions.constant.ts`）常量（`{module}:{resource}:{action}`），不硬编码。

- 路径使用 tsconfig alias：应用内 `@/*`（各自指向 `apps/<app>/src`），跨 app 共享一律 `import ... from '@gvray/core'` / `@gvray/domain`（只允许 barrel 公开面，禁止 `@gvray/*/src` 深路径与 app 间交叉 import），避免深层相对路径。

- 系统管理模块路由使用 `system/...` 前缀；受保护接口显式使用 `JwtAuthGuard`（apps/admin），配合 `RolesGuard` / `PermissionsGuard`，读取类监控接口可省略 `RolesGuard`。客户自助/浏览接口（mall）用 `CustomerJwtGuard` / `@CurrentCustomer()`。`FeatureFlagGuard` 仅 admin 挂载，是全局守卫，仅对标记 `@FeatureFlag(...)` 的路由生效。

- 获取当前用户统一使用 `@CurrentUser()`（admin）/ `@CurrentCustomer()`（mall）；跳过操作日志用 `@NoOperationLog()`。

- 结构化日志收敛在 `packages/core/src/logging/`：访问日志由最外层 `RequestLogInterceptor` 统一产出（成功 info / 慢附 body / 失败 error 只记一次），`HttpExceptionFilter` 不记日志；关联 ID 读 `req.id`（`LOG_REQ_ID_HEADER`，缺失生成 UUID），敏感字段脱敏名单用 `packages/core/src/shared/constants/sensitive-keys.constant.ts` 单一来源。`OperationLogInterceptor` 仅 admin 挂载，mall 不产生审计写。

- 未经确认不运行数据库重置/迁移/seed、权限导入、部署发布等破坏性命令。

- 不确定文件位置时先 `grep` / `glob`，不假设路径。

- 错误信息与日志 message 统一使用英文，Swagger 描述统一使用中文。

- 提交使用 conventional commits（`feat:` / `fix:` / `refactor:` 等）；commit message 默认使用中文，`type(scope): 描述` 中的描述与正文用中文书写，仅保留英文专有名词/技术术语不变。

## 数据库约定

- 本地开发数据库用 `docker-compose.dev.yml`（Postgres 17）；测试/生产用 `docker-compose.yml`。

- `prisma/schema.prisma` **未声明** `relationMode`（Prisma 默认 `foreignKeys`）——关系约束由数据库**原生外键**实现：`prisma/migrations/0_init/migration.sql` 建出真实 `FOREIGN KEY`，并带 `ON DELETE SET NULL` / `CASCADE` / `RESTRICT`。级联行为是 **DB 级**的，任何绕过 Prisma Client 的删除同样会触发（例如硬删 `customer_addresses` 会把 `inquiries.shippingAddressId` 置空）。

- 查询用户等敏感对象优先用 `select` 排除 `password`、自增 `id`；返回前用 DTO / `plainToInstance(..., { excludeExtraneousValues: true })` 控制结构。

- 多表写入或强一致场景使用 `this.prisma.$transaction(...)`。

- **生产禁跑** **`prisma db push`**；一切 schema 变更走 migration——开发用 `prisma migrate dev`（生成 + 应用），admin 容器启动经脚本 [db-bootstrap](scripts/db-bootstrap.ts)（薄 CLI，调用 `@gvray/core` 的共享 `bootstrapDatabase`，见 ADR 0007）执行 `migrate deploy`，`prisma/migrations/` 缺失即 fail-closed 退出，绝不 fallback 到 `db push`；mall 容器不执行任何 schema 同步。常用命令见下方。

- 容器入口 [docker/entrypoint.sh](docker/entrypoint.sh) 是薄 adapter：dev 不做 schema 同步（本机跑 `migrate dev`），生产调用 `node dist/scripts/db-bootstrap.js` 后 `exec CMD`。

## 按需阅读与同步更新

> 左列是**触发条件**（什么时候读它），第三列是**写方向**（改完要不要回头更新）。读与写是同一份映射，**只在这一处维护**——新增一篇场景文档时改这一张表即可，不要另起第二张表。

| 任务 / 改动 | 先读 | 完成后同步更新 |
| --- | --- | --- |
| 新增或重构业务模块 | [architecture.md](.agents/project/architecture.md) + [dto-swagger.md](.agents/project/dto-swagger.md) + [permissions.md](.agents/project/permissions.md) | 同左三篇 |
| 改 DTO / Swagger | [dto-swagger.md](.agents/project/dto-swagger.md) | 同左 |
| 改权限码 / 权限扫描 | [permissions.md](.agents/project/permissions.md) | 同左 |
| 改统一响应格式 | [response-format.md](.agents/project/response-format.md) | 同左 |
| 改配置项 / seed 配置 | [configs.md](.agents/project/configs.md) | 同左 |
| 改部署 / Docker / 环境变量 | [deployment.md](.agents/project/deployment.md) | 同左 |
| 改密码 / 日志 / 审计 / 安全策略 | [coding.md](.agents/project/coding.md) | 同左 |
| 沉淀工程经验 / 回顾踩坑 | [pitfalls.md](.agents/project/pitfalls.md) | 同左 |
| 工作流与上下文策略 | [workflow.md](.agents/project/workflow.md) | 同左 |
| 改数据库 schema / 迁移 / 级联行为 | 本文件「数据库约定」 | 本文件「数据库约定」 |
| 新增依赖 / 换包管理器 / 改 `package.json` scripts | 本文件「验证与收尾」的 Gate 表 | 重测该表 |
| 只改实现细节、不动对外契约 | — | 否 |

## 常用命令

> 命令的真实来源是 `package.json` 的 `scripts`；下表只是常用入口，新增或改名以 `scripts` 为准。
> 破坏性命令的确认要求见「开发硬规则」，不在此处重复。

```bash
pnpm start:admin:dev    # admin · 本地开发（watch 热重载）
pnpm start:mall:dev     # mall · 本地开发（watch 热重载）
pnpm start:admin        # admin · 跑已构建产物（生产）
pnpm start:mall         # mall · 跑已构建产物（生产）
pnpm build              # 构建
pnpm test               # 单元测试
pnpm prisma:generate    # 生成 Prisma Client
pnpm prisma:seed        # 写入/更新种子数据（含权限、菜单）
pnpm prisma:migrate:dev # 改 schema.prisma 后生成并应用迁移（开发唯一 schema 路径）
pnpm prisma:migrate:deploy # 仅应用已提交迁移（生产路径，勿混淆于 dev）
pnpm prisma:migrate:baseline # 一次性：为既有库建立迁移基线（线上 diff 需为空）
pnpm db:reset           # 重置数据库
pnpm docker:dev:up      # 启动 dev compose（含 Postgres）
pnpm docker:up          # 启动生产 compose
```

## 验证与收尾

> 这一节是「做完一个功能后的第一个动作」。Gate 状态**只写在这一处**；改了 Gate 命令或工具后必须**重测**再更新，不要只改名字。

### Gate（五维度实测状态）

上次实测：2026-09-21（只读形式，未跑 build）

| 维度 | 命令 | 实测状态 |
| --- | --- | --- |
| fmt | `prettier "apps/**/*.ts" "packages/**/*.ts" "test/**/*.ts" --check` | **FAIL** — 212 个文件待格式化（既有基线） |
| lint | `eslint "{src,apps,libs,test}/**/*.ts"` | **FAIL** — 1068 条（942 error / 126 warning，既有基线） |
| typecheck | **未声明**；推断的根目录 `tsc --noEmit` 不可用 | **NOT AVAILABLE** — 裸跑 `tsc` 读不到各 app tsconfig 里的 `@/*` 别名，成批报 TS2307（模块找不到）属于**测量方式错误**，不代表类型检查失败；需按 `-p apps/<app>/tsconfig.json` 重测并由人确认 |
| test | `cross-env NODE_ENV=test jest --ci` | **PASS** |
| build | `pnpm build` | **NOT RUN**（会写 `dist/`，需要时手动跑并确认改动范围） |

复测方法：重跑上表命令（fmt / lint 用只读形式，即上表写法）。FAIL 必须先看一条错误样本再归因（代码 / 环境 / 配置）；同一根因带出的连锁报错只算一条。

> 上表是**基线复测表**，不是每次任务的检查清单——它列的是全仓命令，实测单次输出约 1700 行（fmt 214 / lint 1440 / typecheck 53）。日常按下方 DoD 的**改动范围**跑即可，只有改了工具或 `scripts`、或需要重新确认基线时才跑全仓。

### 完成定义（DoD）

一个任务算完成，必须同时满足：

1. **不引入新增失败**（按改动范围验证，不要每次都全仓跑）：以上表为基线——`fmt` / `lint` 当前本来就是红的，要求是**本次改动的文件不新增问题**，而不是把全仓刷绿。
   - 只改应用内业务代码：`npx prettier --check <改动文件>` + `npx eslint <改动文件>`，再跑受影响的 spec
   - 改了 `packages/*` 共享包或公共契约（DTO / 权限码 / 响应格式 / Prisma schema）：补跑全量 `pnpm test`
   - 任何情况下不允许把原本通过的 `test` 变成失败
2. 按顶部「按需阅读与同步更新」表判断本次改动要不要动文档，要动就改完。
3. 文档改动与代码放在同一个提交里。

