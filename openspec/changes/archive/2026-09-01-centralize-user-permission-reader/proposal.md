## Why

"用户当前权限"的权限码/角色码**抽取逻辑**（`flatMap(userRoles → rolePermissions → permission.code)` + `Set` 去重 + `type` 过滤）被逐字复制到 6 处认证/授权代码中，且各处过滤语义微有漂移（例如仅 `getCurrentUser` 会对 `type === 'API'` 的权限做过滤，其余路径不过滤）。这是好的局部性丢失：同一份"从嵌套角色结果里抽权限码"的语义分散在 6 份几乎相同的手写块里，改语义需改 6 处、测试结论不一致。

与"新造一个 service 把 6 处整体重接"的大重构相反，本次收敛采取**抽纯函数而非新服务**的渐进方式：6 处调用点各自保留自己的 DB 查询（适配现有客户端代码结构），只把"抽取/去重/类型过滤"这一纯逻辑抽成单一共享纯函数，消除语义漂移。

## What Changes

- 新增纯工具 `src/shared/utils/permission.util.ts`，导出两个无副作用纯函数：

  - `extractPermissionCodes(userRoles, opts?: { excludeTypes?: string[] })`: 从已加载的嵌套 `userRoles → role → rolePermissions → permission` 结构中去重提取权限码数组；`excludeTypes` 用于统一表达 `type !== 'API'` 这类过滤。

  - `extractRoleKeys(userRoles)`: 去重提取角色码数组。

- 6 处调用点（`AuthService.login` / `refreshAccessToken` / `getCurrentUser` / `getMenus`、`PermissionsGuard.loadPermissionsFromDb`）将其内联的 flatMap/Set/过滤替换为调用上述纯函数。

- 调用点**不改书写查询结构**（各自 `findUnique` 保持原样），只把提取逻辑委托给纯函数。

- 不引入新 service、不改模块注册、不改缓存流程、不改任何对外 API/响应结构。

## Capabilities

### New Capabilities

(无 — 本次为纯重构，行为不变，不引入任何新能力。)

### Modified Capabilities

(无 — 所有现有认证/授权 API 行为完全一致，无 spec 级需求变化。)

## Impact

- New: `src/shared/utils/permission.util.ts`

- Modified: `src/modules/auth/auth.service.ts`、`src/core/guards/permissions.guard.ts`（仅替换提取逻辑，查询不变）

- No module/dependency/DB/schema/route/DTO change

- No breaking changes — observable behavior identical

