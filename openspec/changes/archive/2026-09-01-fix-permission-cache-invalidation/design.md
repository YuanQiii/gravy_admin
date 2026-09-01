# Design: 权限缓存失效收口与扫描器失效

## 背景

`PermissionCacheService` 缓存用户权限码，仅被 `PermissionsGuard` 读取。权限集合变化时若缓存不失效，会在 TTL(1h) 窗口内保留旧码。现失效为手动逐点：roles/users/online-users 各自调用 `invalidateRole`/`invalidateUser`，而 `permissions-scanner` 软删除/更新权限时**未失效任何缓存**，导致已下线权限仍可访问。

## 目标

1. 提供"按权限反查受影响用户并失效"的统一入口，把反查逻辑收口到缓存服务（单一来源）。
2. 扫描器权限变更（删除/更新）后自动失效，消除失效窗口。
3. 明确"仅 name/description 变更不失效"的边界，避免后续误当作遗漏。

## 决策

### D1. `PermissionCacheService.invalidateUsersByPermissionIds(permissionIds: string[])`

两段反查（Prisma `relationMode = "prisma"`，无 FK，无法单条 join 依赖，用两步查询）：

```ts
async invalidateUsersByPermissionIds(
  permissionIds: string[],
): Promise<number> {
  if (!permissionIds?.length || !this.redisService.isAvailable()) return 0;
  const rolePerms = await this.prisma.rolePermission.findMany({
    where: { permissionId: { in: permissionIds } },
    select: { roleId: true },
  });
  const roleIds = [...new Set(rolePerms.map((rp) => rp.roleId))];
  if (roleIds.length === 0) return 0;
  const userRoles = await this.prisma.userRole.findMany({
    where: { roleId: { in: roleIds } },
    select: { userId: true },
  });
  const userIds = [...new Set(userRoles.map((ur) => ur.userId))];
  for (const userId of userIds) await this.del(userId);
  return userIds.length;
}
```

- 语义 fail-closed：空输入、Redis 不可用、无关联角色/用户时均 no-op 返回 `0`，不抛异常。
- 返回受影响用户数，供日志/观测。
- 与 `invalidateUser`/`invalidateRole` 共享私有 `del`。

### D2. 扫描器接入失效

`PermissionsScannerService.syncPermissions` 在软删除循环后，收集本次**被删除**与**name/httpMethod 被更新**的权限 `permissionId`，去重后调用 `invalidateUsersByPermissionIds`。注入 `PermissionCacheService`。

- 被删除：缓存残留已下线码 → 必须失效。
- 被更新（httpMethod/name）：不改变守卫校验的"权限码集合"，但作为同一权限集变更统一失效更稳妥且成本低。

### D3. `permissions.service.update`（仅 name/description）不失效

缓存的只是权限码，不包含 name/httpMethod/description；该接口不改 `code`，故不产生守卫失效窗口。在代码注释与 spec 中显式声明，防止后续误判为新的失效遗漏。

## 非目标

- 不改守卫校验、JWT/认证、扫描 DB 语义。
- 不引入版本号/事件总线（候选未选，另一方向）。
- 不改 `invalidateUser`/`invalidateRole` 既有语义。