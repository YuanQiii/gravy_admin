# GVRAY Admin — Agent 指南

本文件是 agent 自动加载入口，只保留高优先级规则。详细规范按需读取，不在这里导入长文档。

指令优先级：本文件（自动加载入口）> `.agents/project/` 按需文档；两者与源码冲突时以源码为准。仓库根有 `CLAUDE.md`，内容只有一行 `@AGENTS.md` 导入（供 Claude Code）——**不要往其中复制任何内容**，复制必然漂移。

## 项目概况

GVRAY 后端为 Monorepo 双应用 + 共享内核：NestJS 11 + TypeScript，Prisma 6 + PostgreSQL（数据库原生外键约束）、JWT 认证、RBAC 权限模型、Swagger/OpenAPI 与 Docker 部署。Admin 应用（运营端）与 Mall 应用（商城端）共享 `@gvray/core` / `@gvray/domain`。

## 关键目录

- `apps/admin/src/`：Admin 应用（运营端）——业务模块（`modules/`，系统管理在 `apps/admin/src/modules/system/`）、admin 专属基础设施（`core/` 只剩 `guards/feature-flag.guard.ts` 与 `interceptors/session-heartbeat.interceptor.ts`；`JwtAuthGuard` / `RolesGuard` / `PermissionsGuard` / `jwt.strategy` 都在 `packages/core/src/core/`）

- `apps/mall/src/`：Mall 应用（商城端）——匿名浏览 + 客户自助（`modules/mall/`、`modules/customer-auth/`、`modules/customer-activity/`）、客户认证基础设施（`core/`：CustomerJwtGuard / customer-jwt.strategy / @CurrentCustomer）

- `packages/core/src/`：共享内核（`@gvray/core`）——基础设施（decorators/guards/interceptors/filters/pipes/strategies）、`prisma/`（Nest Prisma Module/PrismaService，`@Global()`）、`shared/`（constants/DTO/interfaces/utils/services 含 BaseService）、`logging/`、`redis/`

- `packages/domain/src/`：共享领域包（`@gvray/domain`）——equipment 五件套与 inquiry 的 Service/DTO（providers-only，无 controller）

- `prisma/`：`schema.prisma`、`seed.ts`、`seeds/`（单一所有权，核心包相对路径消费）

## 知识位置

下列位置各自只负责一类内容，都是**单一所有者**；写文档时不要把它们的内容复制到别处。

| 位置 | 内容 | 何时读 |
| --- | --- | --- |
| [CONTEXT.md](CONTEXT.md) | 领域术语表：Customer / User 边界、Equipment / Filter、Inquiry 状态机、文档层术语 | 讨论业务语义、命名或边界时 |
| [.agents/project/](.agents/project/) | 面向 agent 的规范摘要（**唯一语料目录**，路由表见下方「按需阅读与同步更新」） | 按下方路由表取用，不要全量读取 |
| [docs/adr/](docs/adr/) | 架构决策记录，命名 `NNNN-kebab-title.md` | 改架构、数据模型、认证或部署前，先确认不推翻既有决策 |
| [docs/](docs/) | 人类向长文档（响应格式、配置、部署、AI 工程体系等）——`.agents/project/` 只存摘要，详细版在这里 | 需要比摘要更细的说明时 |
| [hermes/](hermes/) | 经验库三库：`pitfalls/` 踩坑、`decisions/` 决策摘要、`patterns/` 工程模式 | 复现异常、新开接口或架构改动前 |
| [wayfinder/](wayfinder/) | 在役专题地图：`map.md` 的目标 / 已定基线 / 禁止重开项 + `tickets/` 待办 | 接手正在推进的专题前，先接上进度 |
| [openspec/](openspec/) | 行为规格与变更流水线：`specs/` 是已定稿规格，`changes/` 是在途变更（`archive/` 为已归档）；由 `openspec` CLI 管理，**不要手工建目录** | 改行为契约前先读 `specs/`；提案 / 落地 / 归档走 `openspec` CLI |

## 开发硬规则

- 先定位任务涉及的模块再读，**不要整仓读取**；文档与源码冲突时以源码为准。上下文策略与阅读顺序见 [workflow.md](.agents/project/workflow.md)。

- **包管理器只用 pnpm**（`package.json` 的 `packageManager` 已声明 `pnpm@9.15.9`）：不要用 npm / yarn / bun 安装或改动依赖，也不要手改 `pnpm-lock.yaml`。

- Controller 只处理路由、鉴权、DTO、Swagger；业务逻辑放 Service。

- 返回业务数据由 `ResponseInterceptor` 自动包装；自定义 message/code/分页用 `ResponseUtil`；分页结构为 `{ items, total, page, pageSize }`。

- 禁止返回未过滤的 Prisma 对象；禁止响应中出现 `password`、token、secret；禁止暴露数据库自增 `id`（对外暴露业务 UUID，如 `userId`）。⚠️ **未机器强制**——靠 `select` + DTO（`@Exclude()`）约定落实，没有 lint 规则拦截；投影机制见 [dto-swagger.md](.agents/project/dto-swagger.md)。

- 权限码使用 `@gvray/core` 的 `permissions.constant`（`packages/core/src/shared/constants/permissions.constant.ts`）常量（`{module}:{resource}:{action}`），不硬编码。⚠️ **未机器强制**——无 lint 规则，只有 `POST /system/permissions/scan` 事后从 Controller 元数据推导出差异。

- 路径使用 tsconfig alias：应用内 `@/*`（各自指向 `apps/<app>/src`），跨 app 共享一律 `import ... from '@gvray/core'` / `@gvray/domain`（只允许 barrel 公开面，禁止 `@gvray/*/src` 深路径与 app 间交叉 import），避免深层相对路径。**依赖方向 DAG（ADR 0010 决策 6）**：`apps → {core, domain}`、`domain → core`——即 **`core` 不得 import `domain`**。其中「packages 不得 import apps」与「禁止 `@gvray/*/src` 深路径」有 eslint 守卫（`eslint.config.mjs` 的 `packages/**` 块，见「已知缺陷」）；**`core → domain` 这个方向没有守卫**，只靠本规则约束。

- **不要"顺手清理" `any`**：`tsconfig.base.json` 的 `noImplicitAny: false` 与 `eslint.config.mjs` 的 `@typescript-eslint/no-explicit-any: off` 都是有意的设置，`any` 在本仓是被接受的写法。在无行为变更的重构里删 `any` 属于扩大范围。

- 系统管理模块路由使用 `system/...` 前缀。受保护接口默认 `@UseGuards(AccessGuard)`（`packages/core/src/core/guards/access.guard.ts`）——它内部按 Jwt → GuestWrite → Roles → Permissions 顺序编排，公开路由由 `@Public()` 短路。**5 个刻意差异化的变体不迁移到 AccessGuard**：auth / profile / dashboard / monitor / online-users 各自显式拼接守卫，强行统一等于改变行为。客户自助/浏览接口（mall）用 `CustomerJwtGuard`（可选认证的用 `OptionalCustomerGuard`）/ `@CurrentCustomer()`。`FeatureFlagGuard` 仅 admin 挂载，是全局守卫，仅对标记 `@FeatureFlag(...)` 的路由生效，且不在编排链中。

- 获取当前用户统一使用 `@CurrentUser()`（admin）/ `@CurrentCustomer()`（mall）；跳过操作日志用 `@NoOperationLog()`。

- 日志与审计的三条不变量：访问日志**只**由最外层 `RequestLogInterceptor` 产出（`HttpExceptionFilter` 不记日志）；敏感字段名单以 `packages/core/src/shared/constants/sensitive-keys.constant.ts` 为**单一来源**；`OperationLogInterceptor` 仅 admin 挂载，mall 不产生审计写。实现细节与字段明细见 [coding.md](.agents/project/coding.md)。

- **生产禁跑 `prisma db push`**；一切 schema 变更走 migration——admin 容器启动执行 `migrate deploy`，`prisma/migrations/` 缺失即 fail-closed 退出，绝不 fallback 到 `db push`；mall 容器不做任何 schema 同步。变更路径选择、级联语义（DB 原生外键）、事务判据见 [database.md](.agents/project/database.md)。

- 下列操作必须先说明影响范围、取得确认，再执行：
  - 数据库：`pnpm db:reset`、`prisma migrate dev` / `prisma:migrate:deploy`、`pnpm prisma:seed`
  - 权限数据：`POST /system/permissions/scan`（按 Controller 元数据新增 / 更新 / **删除**权限记录）
  - 生成物：`pnpm prisma:generate`（重写生成的 Prisma Client）、`pnpm build`（重写 `dist/`）、`pnpm openapi:export`（写 `openapi/`，且必须先启动两个应用）
  - 部署与基础设施：`pnpm docker:build` 与 `docker:build:push`（构建并推送镜像）、`pnpm docker:deploy` 及其 `rollback` / `status` / `logs` 子命令、`docker compose down -v`
  - 任何删除文件或重置数据的命令

- 做出任何路径 / 文件 / 符号的断言之前，先用 `grep` / `glob` 验证它存在——不假设路径，也不凭印象填路径。

- 错误信息与日志 message 统一使用英文，Swagger 描述统一使用中文。

- 提交使用 conventional commits（`feat:` / `fix:` / `refactor:` 等）；commit message 默认使用中文，`type(scope): 描述` 中的描述与正文用中文书写，仅保留英文专有名词/技术术语不变。

## 按需阅读与同步更新

> 左列是**触发条件**（什么时候读它），第三列是**写方向**（改完要不要回头更新）。读与写是同一份映射，**只在这一处维护**——新增一篇场景文档时改这一张表即可，不要另起第二张表。

| 任务 / 改动 | 先读 | 完成后同步更新 |
| --- | --- | --- |
| 新增或重构业务模块 | [architecture.md](.agents/project/architecture.md) + [dto-swagger.md](.agents/project/dto-swagger.md) + [permissions.md](.agents/project/permissions.md) | 同左三篇 |
| 改 DTO / Swagger | [dto-swagger.md](.agents/project/dto-swagger.md) | 同左 |
| 改权限码 / 权限扫描 | [permissions.md](.agents/project/permissions.md) | 同左 |
| 改统一响应格式 | [response-format.md](.agents/project/response-format.md) | 同左 |
| 改配置项 / seed 配置 | [configs.md](.agents/project/configs.md) | 同左 |
| 改数据库 schema / 迁移 / 级联行为 / 事务 / seed 数据 | [database.md](.agents/project/database.md) | 同左 |
| 改部署 / Docker / 环境变量 | [deployment.md](.agents/project/deployment.md) | 同左 |
| 改密码 / 日志 / 审计 / 安全策略 | [coding.md](.agents/project/coding.md) | 同左 |
| 沉淀工程经验 / 回顾踩坑 | [pitfalls.md](.agents/project/pitfalls.md) | 同左 |
| 工作流与上下文策略 | [workflow.md](.agents/project/workflow.md) | 同左 |
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

上次实测：2026-09-22（fmt / lint / test 沿用 2026-09-21 记录；typecheck 于 2026-09-22 补测；未跑 build）

| 维度 | 命令 | 实测状态 |
| --- | --- | --- |
| fmt | `prettier "apps/**/*.ts" "packages/**/*.ts" "test/**/*.ts" --check` | **FAIL** — 212 个文件待格式化（既有基线） |
| lint | `eslint "{apps,packages,test}/**/*.ts"` | **FAIL** — 1718 条（1515 error / 203 warning，既有基线；2026-09-21 修正 glob 后重测，修正前为 1068 条） |
| typecheck | `tsc -p apps/admin/tsconfig.json --noEmit`（另三个 workspace 同理：`apps/mall`、`packages/core`、`packages/domain`） | **PASS** — 2026-09-22 实测四个 workspace 全部 exit=0 / 0 error。**测量方式有讲究**：必须逐个 workspace 用 `-p`；裸跑根目录 `tsc --noEmit` 会因根 tsconfig 的 `@/*` 残留成批报 TS2307，那是**测量错误**不是类型错误 |
| test | `cross-env NODE_ENV=test jest --ci` | **PASS** |
| build | `pnpm build` | **NOT RUN**（会写 `dist/`，需要时手动跑并确认改动范围） |

复测方法：重跑上表命令（fmt / lint 用只读形式，即上表写法）。FAIL 必须先看一条错误样本再归因（代码 / 环境 / 配置）；同一根因带出的连锁报错只算一条。

> 上表是**基线复测表**，不是每次任务的检查清单——它列的是全仓命令，2026-09-21 实测单次输出约 2479 行（fmt 214 / lint 2265）。日常按下方 DoD 的**改动范围**跑即可，只有改了工具或 `scripts`、或需要重新确认基线时才跑全仓。

### 完成定义（DoD）

一个任务算完成，必须同时满足：

1. **不引入新增失败**（按改动范围验证，不要每次都全仓跑）：以上表为基线——`fmt` / `lint` 当前本来就是红的，要求是**本次改动的文件不新增问题**，而不是把全仓刷绿。
   - 只改应用内业务代码：`npx prettier --check <改动文件>` + `npx eslint <改动文件>`，再跑受影响的 spec
   - 改了 `packages/*` 共享包或公共契约（DTO / 权限码 / 响应格式 / Prisma schema）：补跑全量 `pnpm test`
   - 任何情况下不允许把原本通过的 `test` 变成失败
2. 按顶部「按需阅读与同步更新」表判断本次改动要不要动文档，要动就改完。
3. 文档改动与代码放在同一个提交里。

### 文档规模红线（2026-09-22 实测）

AI 会话的上下文是有限资源——"文档写得越多越好"在这类体系里是错的。以下四条是**配额**，超线即触发下沉或去重，不靠"感觉挺多了"来判断：

| 红线 | 上限 | 2026-09-22 实测 |
| --- | --- | --- |
| 常读核心总量（`AGENTS.md` + `CONTEXT.md` + `.agents/project/` + 经验库 + `README.md`） | **≤ 1200 行** | 1078 行 |
| 单篇语料（`.agents/project/*.md`） | **≤ 100 行** | 最大 90（`dto-swagger.md`） |
| 根文件 `AGENTS.md` | **≤ 200 行** | 179 行（本节加入前） |
| 包级 `AGENTS.md`（`apps/*`、`packages/*`） | **30–80 行** | 尚未创建 |

**不在阅读路径**（提供追溯，不作阅读材料）：`openspec/changes/archive/`（119 文件 / 6223 行）· `reports/` · `dist/` · `openapi/` · `logs/`。路由表不指向这些位置。

超线时的处置顺序：① 先问"这段是不是只有某类任务才用"——是则下沉到语料或目录级 `AGENTS.md`；② 再问"这段能不能从源码 / 配置直接读出来"——能则删掉留指针；③ 最后才考虑压缩措辞（收益最小、损耗最大）。

## 已知缺陷与待确认

> 这一节是「状态描述」的**唯一家**：什么已修、什么还没定性、已知的失败与规范脱节都在这里。改动任何一项时，连同**复核方式**一起更新——只写结论的句子会腐烂，写明怎么验证的句子不会。

### 已修：依赖方向守护曾有一个执行盲区（2026-09-21）

`package.json` 的 `lint` glob 原为 `{src,apps,libs,test}/**/*.ts`：其中 `src`、`libs` 是**单应用时代的残留目录**（现已不存在），而 **`packages/` 缺失**。后果是 `eslint.config.mjs` 里 `files: ['packages/**/*.ts']` 的 `no-restricted-imports`（**ADR 0010 的依赖方向守护**）**全仓没有任何命令会执行它**——规则定义了，却从来没有跑过。

已改为 `{apps,packages,test}/**/*.ts`；重测后 lint 基线从 **1068 条升至 1718 条**（+650，全部来自 `packages/`）—— 这 650 条此前从未被任何命令看到。

**复核方式**：`eslint "{apps,packages,test}/**/*.ts" | tail -1` 报出的问题数应包含来自 `packages/` 的条目；并核对四个 workspace 包（`apps/admin`、`apps/mall`、`packages/core`、`packages/domain`）**均无自己的 `scripts`** —— 即 `pnpm lint` 是全仓唯一的 lint 入口。

### 已修：`.agents/project/architecture.md` 长期保留一条已被取代的守卫写法（2026-09-21）

该文件原写「受保护接口显式使用 `JwtAuthGuard`」，并要求「系统管理 Controller 统一使用 `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)`」——那是被 `AccessGuard` 取代的旧模式，实测全仓这样写的 controller **0 个**。同一条错误也曾在 `AGENTS.md` 出现（同日早些时候已订正为「默认 `AccessGuard` + 5 个刻意变体」），但语料里那份没跟着改。

根因不是"漏改一次"，而是**语料文档复述了根文件的规则**：复述的那份不会随原始规则一起更新。该文件已改为只保留架构层内容（模块结构 / 关键目录 / 双应用边界 / 分页），其余一律改为指针。

**复核方式**：`grep -rn "JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard" apps/ --include="*.controller.ts"` 应返回 0；引用 `JwtAuthGuard` 的 controller 应恰好是 auth / profile / dashboard / monitor / online-users 这 5 个。

### 待人工确认（尚未定性，不要照此行动）

1. **9 个 `.env.*` 文件已入库**：根 `.env.development` / `.env.production` / `.env.test`，加 `apps/admin/` 与 `apps/mall/` 下各 3 个（根 `.env.example` 属有意入库；`.env`、`.env.e2e` 未入库）。`.gitignore` 只忽略 `.env` 与 `.env.*.local`。若这些文件含真实凭据，属**历史泄露**——git 历史会被索引，仅删当前文件不够，需轮换凭据。
   复核：`git ls-files | grep "\.env"` 列出已入库清单，逐个确认是否只有示例值 / 占位值。
2. **`packages/domain/package.json` 的 `main` / `types`** 指向 `../../dist/packages/domain/domain/src/index.js`（多一段 `/domain/`），而 `packages/core` 的 `main` 少了一段 tsc 实际产出的 `src` 路径。应用目前经 tsconfig `paths` 直接消费源码，故可能是不生效的死配置。
   复核：先确认 `dist/` 里的实际产物路径，再决定改哪一边。
3. **根 `tsconfig.json` 的 `@/*` → `src/*`** 与 `apps/*/src` 布局不匹配（单应用残留）。影响面**限于裸跑** `tsc --noEmit` 的场景（会成批报 TS2307）；按 workspace 逐个跑（`-p apps/<app>/tsconfig.json`）不受影响 —— 这也是上表 typecheck 的实测方式。
   复核：`tsc --noEmit` 报 TS2307，而 `tsc -p apps/admin/tsconfig.json --noEmit` 为 0 错误 —— 两者并存即证明该残留仍在。
4. **`UsersService.remove()` 不失效被删用户的权限缓存**（已定性为**有意非目标**，原因见 `.agents/project/pitfalls.md`）：被删 / 被禁用的用户在 access token TTL 内仍持旧权限码，另立变更跟踪 JWT 撤销联动。**不要顺手补失效逻辑。**
   复核：`remove()` 方法体内 `invalidate` 命中 0 次。
5. **`$transaction` 规范与实际脱节**（判据见 [database.md](.agents/project/database.md)）：全仓 `$transaction(` 调用点仅 **18 处 / 10 个文件**，其中 admin 业务代码仅 4 处（`modules/auth/auth.service.ts` 1 处、`modules/addresses/addresses.service.ts` 3 处）。
   复核：用 Grep 统计 `\$transaction\(`（glob `*.ts`，排除 `test/`）与各 Service 内 `prisma.<model>.create|update|delete|upsert` 的调用点数，两者量级差异即为缺口。
