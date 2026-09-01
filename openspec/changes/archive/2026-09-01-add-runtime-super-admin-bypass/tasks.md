## 1. 共享超管判定谓词

- [x] 1.1 Add pure `isSuperAdminOf(roleKeys: readonly string[] | null | undefined): boolean` to `src/shared/utils/permission.util.ts` (import `SUPER_ROLE_KEY` from role.constant; returns `(roleKeys ?? []).includes(SUPER_ROLE_KEY)`); verify `pnpm build` compiles and a new unit test in `permission.util.spec.ts` covers true/false/empty/null inputs

## 2. 统一内联判定

- [x] 2.1 In `src/modules/auth/auth.service.ts` `getCurrentUser`, replace the inline `rolesArr.some(ur => ur.role?.roleKey === SUPER_ROLE_KEY)` with `isSuperAdminOf(extractRoleKeys(rolesArr))` and drop the now-unused `SUPER_ROLE_KEY` import if applicable; verify existing `auth.service.spec.ts` still passes
- [x] 2.2 In `src/modules/profile/profile.service.ts` `getUserPermissions`, replace the inline `user.userRoles.some(ur => ur.role.roleKey === SUPER_ROLE_KEY)` with `isSuperAdminOf(extractRoleKeys(user.userRoles))`; verify build passes

## 3. 守卫运行时旁路

- [x] 3.1 In `src/core/guards/permissions.guard.ts`, after the `!requiredPermissions` and `!userId` guards, return `true` when `isSuperAdminOf((request.user.roles ?? []).map(r => r.roleKey))` (before any cache/DB access); verify existing `permissions.guard.spec.ts` cases still pass and a new case "super-admin bypasses missing permission code" passes

## 4. 验收

- [x] 4.1 Run `pnpm build` and confirm clean compile
- [x] 4.2 Run `pnpm test` (full unit suite) and confirm green