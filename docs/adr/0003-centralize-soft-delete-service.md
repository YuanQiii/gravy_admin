# ADR 0003: Centralize Soft-Delete Logic in SoftDeleteService

- Status: Accepted
- Date: 2026-08-26
- Related: OpenSpec change `add-equipment-inquiry-customer-domains`, ADR 0002, architecture review candidate 1

## Context

The `add-equipment-inquiry-customer-domains` change introduces 9 business tables with soft-delete semantics (`deletedAt` field). The source schema used partial unique indexes (`WHERE deleted_at IS NULL`) which Prisma does not support. The naive approach — copy-pasting the soft-delete + uniqueness-check logic into each of the 9 services — would lose **locality**: a bug fix or semantic change would need to be applied in 9 places, and missing one would silently regress.

An architecture review (codebase-design vocabulary) surfaced this as a **deepening opportunity**: a small interface (`assertUniqueActive`, `softDelete`, `handleUniqueError`) hides substantial complexity (active-vs-soft-deleted diagnosis, P2002 fallback translation, error-code suffix convention). The deletion test confirms it — deleting the proposed `SoftDeleteService` would re-explode the soft-delete logic across 9 services.

## Decision

Create `SoftDeleteService` as a `@Global()` NestJS module at `src/shared/services/soft-delete.service.ts`. Three-method interface:

1. `assertUniqueActive(model, field, value, opts?: { excludeIdField?, excludeIdValue?, errorPrefix })` — checks no active record holds the value (throws `{prefix}_DUPLICATED`) AND no soft-deleted record holds it (throws `{prefix}_DUPLICATED_SOFT_DELETED`). The excludeIdField/Value supports update flows.
2. `softDelete(model, idField, id)` — sets `deletedAt = now()` via `model.update`.
3. `handleUniqueError(error, errorPrefix)` — translates Prisma P2002 (unique violation) into `ConflictException({prefix}_DUPLICATED)`; passes through non-P2002 errors. Used as a TOCTOU fallback in `create` flows.

**Concurrency**: DB unique constraints are the final safeguard. `assertUniqueActive` is a diagnosis (gives a better error code), not a lock. `create` catches P2002 and calls `handleUniqueError` for the rare race window. No advisory lock is used (admin scale makes TOCTOU negligible).

**Scope**: Only serves models with `deletedAt`. Event-type tables (`EquipmentFilter`, `CustomerFavorite`, `CustomerHistory`) do not call it. `PermissionsService` (existing) is NOT migrated — its soft-delete pattern differs (query-filter only, no create-time uniqueness check).

## Consequences

Positive:
- **Locality**: Soft-delete logic lives in one place. Bug fixes propagate automatically to all 9 services.
- **Leverage**: 9 services gain 3 capabilities each via 3 method calls — no per-service copy-paste.
- **Testability**: The 6 core scenarios (no-conflict / active-conflict / soft-deleted-conflict / excludeId / softDelete / P2002-fallback) are tested once at the seam, not 9 times.
- **Error-code convention**: The `_DUPLICATED` / `_DUPLICATED_SOFT_DELETED` suffix convention is encoded as private constants — callers pass only the prefix.

Negative:
- 9 services depend on `SoftDeleteService` (DI coupling). Acceptable — the alternative (9 copies) is worse.
- The `model` parameter is structurally typed (duck-typed `findFirst`/`update`), not bound to a Prisma delegate base class. Acceptable — Prisma doesn't expose a delegate base class, and structural typing is the idiomatic TS approach.
- Composite-unique cases (e.g. `Equipment` on `(brandName, model)`) don't fit the single-field `assertUniqueActive` signature and must be checked manually in `EquipmentService`. Acceptable — only one such case exists.

## Alternatives Considered

### A. Copy-paste soft-delete logic into each of the 9 services
Rejected. Loses locality — a bug fix needs 9 edits, missing one silently regresses. The deletion test confirms: deleting `SoftDeleteService` re-explodes the logic across 9 files.

### B. Composite unique constraint `@unique([field, deletedAt])`
Rejected. Prisma's expression of partial unique indexes is limited, and the semantics get muddy (a soft-deleted record with `deletedAt = timestamp` and another with `deletedAt = null` would both need to coexist). Also doesn't help with the active-vs-soft-deleted diagnosis (`_DUPLICATED` vs `_DUPLICATED_SOFT_DELETED`).

### C. Global Prisma P2002 exception filter
Rejected. A global filter translating P2002 → 409 loses the module-level error-code semantics (which field? active or soft-deleted?). The diagnosis in `assertUniqueActive` gives callers actionable error codes.

### D. Add the methods to `BaseService`
Rejected. `BaseService` is already a god-class (paginate, buildWhere, findOneOrFail, etc.). Adding soft-delete methods would further bloat it and force every service (including those without `deletedAt` tables) to inherit them. A separate `@Global` service is a cleaner seam.

## References

- Implementation: `src/shared/services/soft-delete.service.ts`
- Test: `src/shared/services/soft-delete.service.spec.ts` (6 core scenarios)
- Design: `openspec/changes/add-equipment-inquiry-customer-domains/design.md` D4
- Codebase-design vocabulary: deep module, locality, leverage, seam, deletion test
