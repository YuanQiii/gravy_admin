## 1. Shared pure helpers

- [x] 1.1 Create `src/shared/utils/permission.util.ts` exporting pure `extractPermissionCodes(userRoles, opts?: { excludeTypes?: string[] }): string[]` and `extractRoleKeys(userRoles): string[]`, and verify it compiles (`pnpm build`)

- [x] 1.2 Add unit tests for the helpers: dedup of duplicate codes/keys; empty/absent/nested-null-tolerant input returns `[]`; `extractPermissionCodes` with `{ excludeTypes: ['API'] }` omits API-type permissions while the no-arg form keeps them; non-string `code` values are dropped — and verify tests pass (`pnpm test`)

## 2. Rewire AuthService

- [x] 2.1 In `login`, replace the inline `permissionCodes` and `roleKeys` flatten/Set blocks with `extractPermissionCodes(...)` / `extractRoleKeys(...)` (query unchanged), and verify existing login e2e still returns tokens and warms cache

- [x] 2.2 In `refreshAccessToken`, replace the same inline blocks with the helpers (query unchanged), and verify the refresh flow e2e passes

- [x] 2.3 In `getCurrentUser`, replace the inline `flatMap + filter(type !== 'API')` with `extractPermissionCodes(userRoles, { excludeTypes: ['API'] })`, keeping its single rich query, and verify `getCurrentUser` e2e returns an identical response shape

- [x] 2.4 In `getMenus`, replace its permission-code extraction with `extractPermissionCodes(...)` (keep menu-tree construction), and verify `getMenus` e2e returns the same tree

## 3. Rewire PermissionsGuard

- [x] 3.1 In `PermissionsGuard.loadPermissionsFromDb`, replace the inline code extraction with `extractPermissionCodes(...)`, and verify the guard unit specs (`access.guard.spec.ts` / related) still pass

- [x] 3.2 Verify a guarded endpoint allows a user with the required code and denies one without it (existing permission-enforcement e2e), confirming behavior parity

## 4. Cleanup and verification

- [x] 4.1 Run `pnpm lint` and `pnpm build` to confirm no unused-import/type errors after removing inline blocks

- [x] 4.2 Run full test suite (`pnpm test`) and relevant auth/permission e2e specs and confirm green

