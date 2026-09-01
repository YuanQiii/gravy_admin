# 修复合法的权限缓存失效窗口

## Why

权限缓存（`PermissionCacheService`，key `perm:user:{userId}`，TTL 1h）目前**只被守卫读取**（`PermissionsGuard` 校验所需权限码）。当权限集合变化时，若缓存不失效，已登录用户会在最长 1 小时的窗口内继续持有旧权限码：

- 已被扫描器软删除的权限码仍在缓存中 → 守卫仍放行 → 用户可访问已下线接口。
- 失效调用是**手动、逐点**写在各变更方法里（roles/users/online-users），缺少统一的"按权限反查受影响用户"入口，扫描器等权限集变更点**漏掉了失效**。

现状失效点（手动收口，遗漏扫描器）：

| 变更点 | 失效动作 |
| --- | --- |
| `roles.service.updateRole`/`assignPermissions`/`removePermissions` | `invalidateRole(roleId)` |
| `users.service.assignRoles`/`removeRoles`/改状态 | `invalidateUser(userId)` |
| `online-users.service` 踢人 | `invalidateUser(userId)` |
| `permissions-scanner.syncPermissions`（软删除/更新权限） | **无** |

## What Changes

- 在 `PermissionCacheService` 新增统一失效入口 `invalidateUsersByPermissionIds(permissionIds: string[])`：由权限 → 角色 → 用户反向检索并批量失效，将"按权限失效"的 DB 反查逻辑收口到缓存服务（单一来源）。
- 在 `permissions-scanner.service.syncPermissions` 接入该入口：扫描发生权限**删除/更新**后，失效所有关联用户缓存（消除"已下线接口仍可访问"的窗口）。
- 明确"仅权限 `name`/`description` 变化（`permissions.service.update`）**不**触发失效"：缓存只存权限码，不存 name/description，故不产生守卫失效窗口（design 中记录语义，避免误判为遗漏）。
- 既有 `invalidateUser`/`invalidateRole` 保留；角色/用户变更点已精确失效，无需改。

## Impact

- 触及 `PermissionCacheService`、`PermissionsService`(scanner) 与相应单测。
- 不影响守卫校验逻辑、JWT/认证流程、权限扫描的 DB 语义。
- 无 schema/接口/权限码变更。