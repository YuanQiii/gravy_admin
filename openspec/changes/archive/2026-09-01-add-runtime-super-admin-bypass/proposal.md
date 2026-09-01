## Why

运行时没有 super-admin 旁路：`PermissionsGuard` 只按权限码放行，不识别超级管理员角色。若 `super_admin` 角色的权限码集合因增删而缺项，超管也会被 `@Permissions` 挡住——超级管理员的"全量放行"语义没有在授权路径上以运行时旁路兜底，而是散落在各业务服务的 `isSuperAdmin` 判断（`BaseService` 的 DB 查询 + `auth.service`/`profile.service` 的内联 `some(...)`）里，语义与实现各写一处，极易漂移。

## What Changes

- 在 `src/shared/utils/permission.util.ts` 新增共享纯函数 `isSuperAdminOf(roleKeys)`（复用既有 `extractRoleKeys` 的嵌套结构，然后 `.includes(SUPER_ROLE_KEY)`），作为超管判定的单一来源。
- 将 `auth.service.ts`（`getCurrentUser`）与 `profile.service.ts`（`getUserPermissions`）的内联 `roles.some(ur => ur.role.roleKey === SUPER_ROLE_KEY)` 统一改为调用 `isSuperAdminOf(extractRoleKeys(...))`，消除漂移。
- `PermissionsGuard` 增加运行时旁路：命中 `super_admin` 角色的请求，在读取权限缓存/DB 之前直接放行（不要求 `super_admin` 角色权限码完整）。
- 保持 `BaseService.isSuperAdmin(userId)` 的 DB 语义与业务侧调用点不变（面向单个 userId 的守卫，是另一输入形态），本次不并入。

> 本变更引入可观察的行为变化（超管不再受权限码缺失影响），写入新能力 `rbac` 的 spec delta；非 `skip_specs`。

## Capabilities

### New Capabilities
- `rbac`: 访问控制在运行时执行的 super-admin 旁路语义——拥有 `super_admin` 角色的用户对所有标注 `@Permissions` 的路由自动放行，不受角色所挂权限码集合影响。

### Modified Capabilities

无（本仓尚无 rbac/auth 主 spec；新增 `rbac`）。

## Impact

- 代码：
  - `src/shared/utils/permission.util.ts` 增加 `isSuperAdminOf`。
  - `src/modules/auth/auth.service.ts`、`src/modules/profile/profile.service.ts` 改为共享谓词。
  - `src/core/guards/permissions.guard.ts` 增加 super-admin 旁路分支。
  - 测试：`permission.util.spec.ts`、`permissions.guard.spec.ts` 补用例；`auth.service.spec.ts`/`profile.service.spec.ts` 若断言 `isSuperAdmin` 则同步。
- 行为：`super_admin` 角色在授权层恒为真（旁路），不依赖权限码完整。
- 安全权衡：旁路信号取自 JWT 的 `roleKeys`；超管被降级后旧 token 在其 TTL 内仍可旁路——与既有权限码的 JWT 失效窗口一致，记录为已知边界。