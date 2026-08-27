# ADR 0005: Anonymous Visitor Access to Equipment Catalog

- Status: Accepted
- Date: 2026-08-27
- Related: OpenSpec change `add-anonymous-equipment-access`, CONTEXT.md (*Anonymous Visitor* term), ADR 0002 (Customer vs User boundary)

## Context

The GVRAY Admin backend's 5 equipment sub-modules (`brands`, `catalogs`, `filter-types`, `equipment`, `filters`) all mount `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)` at the controller class level. Every GET endpoint (list, detail, options) returns 401 to any caller without a Bearer JWT. There is no `@Public()` decorator or equivalent mechanism in the codebase — anonymous access is structurally impossible today.

CONTEXT.md defines an *Anonymous Visitor* as a B2C site visitor who has not authenticated (no `userId`, no roles, no audit归属), distinct from the `guest` *role* (a logged-in demo `User` with full RBAC and writes blocked by `GuestWriteGuard`). The `Customer` self-registration / WeChat OAuth login mechanism is marked "future" in CONTEXT.md — there is currently no way for a B2C visitor to authenticate at all. The pre-sales flow (browse equipment → find compatible filters → submit inquiry) therefore has no entry point without this change.

The proposal `add-anonymous-equipment-access` opens only equipment GET endpoints to anonymous visitors; scope is deliberately narrow (no inquiry submission, no customer/* modules, no removal of the temporary `guest` role).

## Decision

1. **Add a `@Public()` method decorator** (`src/core/decorators/public.decorator.ts`) backed by `IS_PUBLIC_KEY = 'isPublic'` metadata. Apply to the 5 equipment controllers' GET list/detail/options methods only.
2. **Introduce a cooperative orchestrating guard `AccessGuard`** (`src/core/guards/access.guard.ts`) that injects the 4 existing guards (`JwtAuthGuard`, `GuestWriteGuard`, `RolesGuard`, `PermissionsGuard`) and calls them in order (Jwt → GuestWrite → Roles → Permissions). On `@Public()` routes the orchestrator **only attempts** `JwtAuthGuard` to populate `request.user`; failure (no token / invalid token) is swallowed and the request continues as anonymous — GuestWrite/Roles/Permissions are not invoked because anonymous calls have no `request.user.roles`/`permissions` to read. This lets the controller switch service `visibility` via `@CurrentUser() user?` (populated = authenticated path, undefined = anonymous path), satisfying the spec requirement that "登录调用路径 SHALL 维持现有行为不变". On protected routes the orchestrator runs all 4 in order; any guard returning false or throwing aborts the chain. The 4 orchestrated guard classes are **untouched**; they become internal seams of the orchestrator (each keeps its existing unit tests). Simultaneously, the 23 controllers that mount the standard 4-guard chain mechanically replace `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)` with `@UseGuards(AccessGuard)` (equipment 5, customer 4, inquiry 2, system 12). The 5 deliberately differentiated variants (dashboard without GuestWrite, profile without RBAC, monitor without Roles, online-users, auth method-level `(Jwt)`) are **not** migrated — their guard sets are intentional interface decisions. Named `AccessGuard` rather than `AdminRouteGuard` because the seam carries authentication + RBAC + anonymous-allowance; equipment catalog routes with `@Public()` are no longer purely admin routes.
3. **Service-layer visibility flag with the filtering logic sunk into `BaseService`.** Extend `findAll(query, opts?)` and `findOne(id, opts?)` on all 5 equipment services with `opts.visibility?: 'anonymous' | 'authenticated'` (default `'authenticated'`). When `'anonymous'`: `findAll` forces `where.status = 'enabled'` (in addition to the existing `where.deletedAt = null`, ignoring any client-supplied `query.status`); `findOne` throws `NotFoundException` on records whose `status !== 'enabled'`. The filtering implementation lives in two new `protected` methods on `BaseService` — `applyVisibility(where, opts)` and `assertVisible(record, opts)` — so the anonymous-visibility rule is written once and every service calls it in one line (locality). The controller passes `{ visibility: 'anonymous' }` iff `@CurrentUser() user` is `undefined`. Exception: `equipment.service`'s `findOne` relation filter on `equipmentFilters` stays local to that service (only module with a relation scenario).
4. **Reuse existing `*ResponseDto`s; no public DTO variants.** Field audit confirmed no sensitive fields leak (no cost/stock/internal-remark/audit columns; `filters.annb`/`bynb`/`gencode` are product technical parameters; `compatibility` JSON is the core B2C lookup payload). The protection axis is "do not return disabled records" (Decision 3), not "do not return certain fields".
5. **URL is reused in place — no `/public/` prefix.** Same URL, behavior branches on the presence of `Authorization: Bearer`. This matches REST semantics for "same resource, different view per identity" (cf. GitHub `/repos` public vs private).
6. **`@nestjs/throttler` + in-memory store as a transitional rate limit.** Global `APP_GUARD` adds `ThrottlerGuard` alongside the existing `FeatureFlagGuard`; `ThrottlerModule.forRoot({ limit: 1000, ttl: 60000 })` is the global default, `@Throttle({ default: { limit: 60, ttl: 60000 } })` on each `@Public()` GET method tightens to 60/min. Redis store deferred (separate change) — known multi-instance inconsistency accepted.
7. **The `guest` role / `GuestWriteGuard` / `AllowGuestWrite` / `feature.guestAccount` config are NOT touched this round.** Despite [roles.ts:67](../../prisma/seeds/roles.ts#L67) TODO suggesting removal post-fork, removal is a destructive cross-cutting change (seed + config + frontend UI + guards + unit tests) and is decomposed into its own future change. Coexistence is fine: anonymous access is the new axis for B2C browsing, `guest` role remains the demo-login axis for backend staff.

## Consequences

Positive:
- Anonymous B2C browsing works without waiting for Customer login infrastructure.
- The decorator mechanism is reusable: future capabilities (e.g. anonymous inquiry submission, public catalog endpoints in other modules) can apply `@Public()` without re-architecting guards.
- Guard-chain shallowness is collapsed as a side effect: the guard-order invariant moves from 23 call sites into one orchestrator (locality); the caller-facing interface shrinks from "4 class names + ordering semantics" to "1 class + metadata decorators" (depth). The 4 orchestrated guards keep their unit tests as internal seams.
- The anonymous-visibility rule (`status='enabled'`, 404-on-disabled) is written once in `BaseService` and inherited by every equipment service (leverage).
- URLs do not change — frontend and Swagger have no migration cost; logged-in user behavior is byte-identical to before.
- Application-layer rate limit closes the most obvious scraping vector.

Negative:
- The same URL returning different result sets based on `Authorization` is initially non-obvious. Mitigated by Swagger descriptions ("公开接口，无需认证") and this ADR.
- The 23-controller migration touches files far beyond equipment/*; a careless sed could touch the 5 differentiated variants. Mitigated by exact-string replacement of the full 4-guard tuple, `grep` verification of zero residual class-level 4-guard chains, and e2e regression of logged-in paths.
- An orchestrator ordering bug (e.g. Roles before Jwt, when `request.user` is not yet populated) would break all 23 controllers at once. Mitigated by `access.guard.spec.ts` explicitly asserting call order and short-circuit-on-false.
- In-memory throttler is per-instance; on N replicas the effective limit is N × 60/min for a single IP. Mitigated by documented acceptance; Redis store on the roadmap.
- `filter-types.service.ts:findAllEnabled` continues to return raw Prisma rows without DTO conversion (an existing AGENTS.md violation surfaced during fact-finding) — out of scope here, left for an independent refactor.

## Alternatives Considered

### A. Patch all 4 guards individually with an `IS_PUBLIC_KEY` short-circuit

Rejected (the original drafting of this ADR). The same short-circuit logic and its unit test would be duplicated in 4 guards, and the guard chain's shallowness (caller interface = 4 class names + ordering semantics, recited by 23 controllers) would remain untouched. The orchestrating `AccessGuard` (Decision 2) concentrates the short-circuit and the ordering invariant in one place at lower cost. Patching only `JwtAuthGuard` is worse still — `RolesGuard`/`PermissionsGuard` assume `request.user` is populated and would throw or deny when it is `undefined`.

### B. Merge the 4 guards' implementations into one class and delete the originals

Rejected. `PermissionsGuard` carries heavy dependencies (Prisma + Redis permission-cache) and all 4 have accumulated unit tests; relocating everything is high-cost. The cooperative form keeps them as internal seams of the orchestrator with their test surfaces unchanged.

### C. Standalone `PublicController` under `src/modules/public/`

Rejected. Routes would split to `/public/equipment/*`, forcing the frontend and Swagger to maintain two URL sets for the same resource; controller code duplicates; and the PublicController would still share service methods, so it does not actually isolate the visibility-branch problem solved in Decision 3. The decorator approach gives the same isolation at lower cost (no new controllers, no URL split).

### D. Global `APP_GUARD` replacing per-controller `@UseGuards`

Rejected. Migrating every controller in the codebase to a global guard model is a separate architectural refactor — it touches all 33 `@UseGuards` sites including the 5 deliberately differentiated variants whose guard sets would be flattened. Out of scope for this change; this change must compose with the existing per-controller `@UseGuards` style. (`FeatureFlagGuard` remains a global APP_GUARD — its seam is "all routes including unguarded ones", orthogonal to the orchestrator.)

### E. Service `findAllPublic` / `findOnePublic` methods (one pair per module)

Rejected. 10 new methods across 5 services, ~90% duplicated from existing `findAll`/`findOne`, with maintenance burden. The `visibility` parameter (Decision 3) gives the same readability at lower duplication cost.

### F. Each of the 5 services inlining the visibility branch inside its own `findAll`/`findOne`

Rejected (the original drafting of this ADR). The same two branch bodies would be written 10 times across 5 services that are already near-copies of each other. Sinking the rule into `BaseService.applyVisibility`/`assertVisible` writes it once (Decision 3).

### G. In-place `if (!user) query.status='enabled'` in controllers

Rejected. Violates AGENTS.md "业务逻辑放 Service" — and `findOne` takes no query parameter so the pattern does not generalize to detail endpoints.

### H. Redis-backed throttler from day one

Rejected. Adds a deployment dependency (Redis must be available) and `project_memory` notes Redis host configuration is a known foot-gun. The transitional in-memory store unblocks this change without coupling it to Redis availability; Redis is a separate follow-up.

## References

- Planning artifacts: `openspec/changes/add-anonymous-equipment-access/` (proposal.md, specs/equipment/spec.md, design.md, tasks.md)
- Term definition: [CONTEXT.md](../../CONTEXT.md) → *Anonymous Visitor*
- Related guards: [src/core/guards/jwt-auth.guard.ts](../../src/core/guards/jwt-auth.guard.ts), [src/core/guards/guest-write.guard.ts](../../src/core/guards/guest-write.guard.ts), [src/core/guards/roles.guard.ts](../../src/core/guards/roles.guard.ts), [src/core/guards/permissions.guard.ts](../../src/core/guards/permissions.guard.ts)
- Rate limit TODO: [src/main.ts:67](../../src/main.ts#L67) (existing TODO for ThrottlerModule + Redis)
- Predecessor ADR: ADR 0004 (equipment/filter data import) — surfaced `findAllEnabled` raw-row AGENTS.md violation referenced in Consequences
