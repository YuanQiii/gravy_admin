## Context

See [proposal.md](proposal.md) — motivation: permission/role-code extraction logic is hand-copied in 6 places with subtle filter drift (only `getCurrentUser` excludes `type === 'API'`).

Client-code reality this design must adapt to (this is the key constraint): the 6 consumers each load their data with **their own** Prisma `findUnique`, often with different projections, and none of them share a "reader service" today. Forcing a new service onto them would be a large rearchitecture of 6 call sites; instead we adapt to them with a shared **pure helper** they can each call at the extraction step.

## Goals / Non-Goals

**Goals:**
- One pure, shared definition of "how to derive deduped permission/role codes from nested role data", so the filter semantic (`type !== 'API'` only for the front-end projection) lives in exactly one place.
- Minimal, low-risk change: no new service, no module registration, no cache-flow change, no DTO/API change.

**Non-Goals:**
- Not changing how any call site *queries* its data (each keeps its own `findUnique`).
- Not touching cache invalidation gaps (candidate D) or super-admin/wildcard semantics (candidate C) — tracked elsewhere.
- Not unifying the six queries themselves — out of scope for this change.

## Decisions

### D1 — Extract pure helpers, not a service

New file `src/shared/utils/permission.util.ts`, with two pure (no-side-effect, no-DI) functions:

```
extractPermissionCodes<T>(userRoles, opts?: { excludeTypes?: string[] }): string[]
extractRoleKeys<T>(userRoles): string[]
```

Both take the already-loaded nested `userRoles` array (`{ role: { rolePermissions: { permission: { code, type } } | null } | null } | null`), flatten, dedup with `Set`, filter empty/non-string, and for `extractPermissionCodes`, drop any permission whose `type` is in `excludeTypes` when provided.

- **Why pure function over the earlier `UserPermissionReader` service:** the 6 call sites already have their own queries and projections; a service would either re-query or require rewiring all six — a large rearchitecture this change deliberately avoids. A pure helper adapts to the existing client code: each call site keeps querying as it does today and merely delegates the extraction.
- **Alternatives:**
  - `UserPermissionReader` service (prior design) — rejected: massive rewire, over-engineered for a semantic-containment goal.
  - A shared query builder returning `where`/results — rejected: call sites have heterogeneous projections; no common query shape to unify.

### D2 — Each call site delegates extraction to the helper

- `AuthService.login` / `refreshAccessToken`: replace their duplicated role-rolePermission flatten for `permissionCodes` with `extractPermissionCodes(...)`, and their duplicated `roleKeys` with `extractRoleKeys(...)`. Query stays the same.
- `AuthService.getCurrentUser`: replace its `flatMap + filter(type !== 'API')` with `extractPermissionCodes(userRoles, { excludeTypes: ['API'] })` — this is the one place the API filter must remain, now expressed as a single named option in the shared helper.
- `AuthService.getMenus`: replace its code extraction with `extractPermissionCodes(...)`.
- `PermissionsGuard.loadPermissionsFromDb`: replace its extraction with `extractPermissionCodes(...)`.

- **Why adapt (not unify) the queries:** the pivot from the first review. Behavior is preserved exactly; the win is that the *semantics* (dedup + which type filter applies where) are defined once.

## Risks / Trade-offs

- [R1] The six DB queries remain duplicated (only extraction is centralized) → Mitigated: this is the accepted scope; query-unification is a separate, larger change. Extraction is where the filter-semantics risk lived, so this removes the drift that mattered.
- [R2] Accidental drift between `extractPermissionCodes` types shape and a call site's actual nested shape → Mitigated: `extractRoleKeys`/`extractPermissionCodes` operate on a minimal structural superset (`.role.rolePermissions[].permission.{code,type}`), tolerant of nullish; the type parameter is generic over the call site's union shape.
- [R3] Unchanged observable behavior → Mitigated: identical extraction outcome per call site; covered by existing auth/permission e2e plus new unit tests for the pure helpers.

## Migration Plan

- Additions/edits only: new util file + rewire six extraction sites. No data/schema/DTO/route change.
- Rollback: revert these commits; the inline extractions are restored as-is.
- Deploy with normal pipeline; verify login/refresh, menu tree, current-user, and a guarded endpoint.

## Open Questions

- None that affect the design or task breakdown.