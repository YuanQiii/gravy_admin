# packages/core — 共享内核（@gvray/core）

> 本文件是本包的**增量**约定：只写本包特有、根 [AGENTS.md](../../AGENTS.md) 没有的内容。全局硬规则、依赖方向 DAG、barrel 与深路径禁令都在根文件——本文件不复述，也不另立路由表。

## 本包是什么

两个应用共享的**基础设施层**，不含任何业务域逻辑。

- `core/{decorators,guards,interceptors,filters,pipes,strategies}` —— 横切能力。守卫：`access.guard.ts`（编排器）、`jwt-auth` / `guest-write` / `roles` / `permissions`。
- `prisma/` —— Nest Prisma Module 与 `PrismaService`（`@Global()`），以相对路径消费根 `prisma/` 的 schema 与 seeds（单一所有权）。
- `redis/`、`logging/`、`bootstrap/` —— 各自是深模块（ADR 0006、0007）。
- `shared/{constants,dto,interfaces,utils,services}` —— 含 `BaseService`（可见性注入与断言）、`permissions.constant`、`sensitive-keys.constant`。

## 本包的额外约定

- **深模块优先，判别标准是消费者数量**：机制放本包、业务侧只做薄适配器。**被两个以上消费者复用才下沉**；只有一个消费者时那是"假设接缝"，缓做而不是先建（先例：`authenticateByRealm` 只有 customer 一个消费者，故至今未收敛——ADR 0009）。
- **改横切能力前先看它的 spec**：守卫顺序这条不变量活在测试名里——`access.guard.spec.ts` 的 "calls all 4 guards in order: Jwt → GuestWrite → Roles → Permissions when not public"。改顺序必须同时改这条断言，否则等于静默改了契约。
- **不引入应用专属内容**：mall 的客户守卫、admin 的 feature-flag 守卫都留在各自应用内；内核只放两端共用且语义一致的东西。
- **本包不新增 scripts**：`pnpm lint` / `pnpm test` 是全仓唯一入口，四个 workspace 包都没有自己的 `scripts`（有的话会让"全仓只有一个 lint 入口"这个前提失效）。

## 本包对全局规则的显式例外

（暂无）
