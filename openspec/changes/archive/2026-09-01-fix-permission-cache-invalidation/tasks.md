# Tasks

## 1. 统一失效入口

- [x] 1.1 In `src/redis/permission-cache.service.ts`, add `invalidateUsersByPermissionIds(permissionIds: string[]): Promise<number>`: no-op returns `0` when input empty or Redis unavailable; reverse-map permissionId → roleId (`rolePermission.findMany`) → userId (`userRole.findMany`), dedupe, call private `del(userId)` for each, return affected count. Add `rolePermission` to the test `prisma` mock.
- [x] 1.2 In `src/redis/permission-cache.service.spec.ts`, add unit cases: (a) invalidates all distinct users across multiple permissions/roles, (b) dedupes a user reachable via multiple roles, (c) empty input → no DB/del, (d) no role maps to any permission → no del, (e) Redis unavailable → no DB query and no del (fail-closed).

## 2. 扫描器失效接入

- [x] 2.1 In `src/modules/system/permissions/permissions-scanner.service.ts`, inject `PermissionCacheService`; in `syncPermissions` collect the `permissionId`s of **deleted** and **name/httpMethod-updated** permissions into a deduped `changedIds`; after the deletion loop call `invalidateUsersByPermissionIds(changedIds)`; ensure unchanged scans pass `[]` (no-op).

## 3. 边界声明（仅 name/description 变更不失效）

- [x] 3.1 Add a clarifying comment on `PermissionsService.update` stating cache stores only codes, so `name`/`description` updates intentionally skip invalidation (no guard-visible window).

## 4. 验收

- [x] 4.1 Run `pnpm build` and confirm clean compile.
- [x] 4.2 Run `pnpm test` (full unit suite) and confirm green.