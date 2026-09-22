# apps/admin — Admin 应用（运营端）

> 本文件是本包的**增量**约定：只写本包特有、根 [AGENTS.md](../../AGENTS.md) 没有的内容。全局硬规则、Gate、文档路由表都在根文件——本文件不复述，也不另立路由表。

## 本包是什么

运营端 NestJS 应用，独立进程 / 端口 / 镜像 / Swagger。入口 `src/main.ts`（共享引导逻辑走 `@gvray/core` 的 `configureApp`）。

- `src/modules/` —— 业务模块；系统管理在 `src/modules/system/`：configs、departments、dictionaries、login-logs、menu、monitor、notices、online-users、operation-logs、permissions、positions、roles、users（13 个 controller，均带 `system/...` 路由前缀）。
- `src/core/` —— 本端专属基础设施，只剩两个文件：`guards/feature-flag.guard.ts`、`interceptors/session-heartbeat.interceptor.ts`。`JwtAuthGuard` / `RolesGuard` / `PermissionsGuard` / `jwt.strategy` 都在共享内核里（见 [packages/core/AGENTS.md](../../packages/core/AGENTS.md)）。

## 本包的额外约定

- **路由前缀**：系统管理端点一律 `system/...`。
- **权限码**：用 `@gvray/core` 的 `permissions.constant`；新增端点后按需执行 `POST /system/permissions/scan` 对齐权限记录 —— 该端点会**删除**多余记录，执行前先确认影响面。
- **审计写入只在本端产生**：`OperationLogInterceptor` 仅在本端 `src/app.module.ts` 挂载。需要跳过某条路由时用 `@NoOperationLog()`；不要在 Mall 侧期待等价能力。
- **守卫变体是刻意的**：以下 5 处显式拼接守卫，**不要迁移到 `AccessGuard`** —— 强行统一等于改变行为：

  | controller | 拼接的守卫 |
  | --- | --- |
  | auth | 仅 Jwt |
  | profile | Jwt + GuestWrite |
  | dashboard | Jwt + Roles + Permissions |
  | monitor | Jwt + GuestWrite + Permissions |
  | online-users | Jwt + Permissions |

  其余 controller 一律 `@UseGuards(AccessGuard)`。
- **`FeatureFlagGuard` 是本端独有的全局守卫**：仅对标记 `@FeatureFlag(...)` 的路由生效，不在 `AccessGuard` 的编排链中。
- **会话心跳是本端专属**：`interceptors/session-heartbeat.interceptor.ts` 依赖本端的 `TokenService`，不随内核迁移。

## 本包对全局规则的显式例外

（暂无）
