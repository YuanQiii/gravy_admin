## Context

授权路径现状：`PermissionsGuard` 只按权限码放行（先 Redis 缓存，未命中回填 DB），无 super-admin 旁路。超管身份判定四处散落：`BaseService.isSuperAdmin(userId)`（DB，业务守卫）、`auth.service.getCurrentUser` 内联 `some()`、`profile.service.getUserPermissions` 内联 `some()`。JwtStrategy 已在 JWT `sub`/`roleKeys` 中携带角色码，`request.user.roles` 即角色键数组。见 proposal.md - Why 与 specs/rbac/spec.md - 需求。

## Goals / Non-Goals

**Goals:**

- 提供单一共享纯谓词 `isSuperAdminOf(roleKeys)`，成为"是否含 super_admin 角色"的唯一判定。
- 统一 `auth.service` / `profile.service` 的内联判定为 `isSuperAdminOf(extractRoleKeys(...))`。
- 使 `PermissionsGuard` 在超管时恒放行（旁路在权限码/缓存/DB 访问之前）。
- 为旁路与判定语义补单测。

**Non-Goals:**

- 不并入 `BaseService.isSuperAdmin(userId)`（输入是 userId 而非 roleKeys，属业务守卫独立形态，本次保持）。
- 不改变权限缓存结构、不新增旁路缓存字段。
- 不引入 DB 每请求校验超管（避免守卫增加额外查询）。超管被降级的 JWT 失效窗口沿用既有 TTL 语义，不作为本次修复目标（候选 D 范畴）。

## Decisions

- **旁路信号源用 JWT 的 `request.user.roles`（角色键）**：JwtStrategy 已把 `roleKeys` 还原为 `request.user.roles`，守卫可零额外查询判定超管。备选"从 DB 加载的 `user.userRoles` 判定"需在缓存命中路径也要查 DB 或改缓存结构，overhead 更高且破坏缓存命中快路径，否决。
- **新增 `isSuperAdminOf(roleKeys)` 而不再扩 `extractRoleKeys`**：`extractRoleKeys` 契约是"提取角色码数组"；`isSuperAdminOf` 是"判定含某角色"，语义不同、可测试性更好。实现一行 `(roleKeys ?? []).includes(SUPER_ROLE_KEY)`，`SUPER_ROLE_KEY` 从 role.constant 导入，保证单一来源。
- **旁路置于守卫 userId 校验之后、权限读取之前**：`if (!requiredPermissions) return true` 与 `if (!userId) return false` 保持在最前；随后 `if (isSuperAdminOf(roleKeys)) return true`。既保证超管跳过缓存/DB，又不动既有守卫分支顺序，现有 spec 用例（`request.user` 仅 `{ userId }`、无 roles）不受影响。

## Risks / Trade-offs

- [旁路取自 JWT，超管被降级后旧 token 在其 TTL 内仍可旁路] → 与既有权限码的 JWT 失效窗口一致，属已知边界，在 proposal 与 CONTEXT 文档登记；候选 D 统一解决失效窗口。
- [`request.user.roles` 缺失（如非标准调用）导致旁路不生效] → 谓词对 null/undefined 返回 false（fail-closed），退化为现状仅按码放行，安全方向正确。
- [导入 SUPEROLE_KEY 到 shared util 形成 shared→constant 依赖] → 均为 shared 层、无循环，accepted。