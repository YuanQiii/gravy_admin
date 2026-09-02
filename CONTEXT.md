# Project Context — GVRAY Admin

> Domain glossary for the GVRAY Admin backend. Defines business terms and technical vocabulary to keep cross-team communication precise.

## Business Domain

### Customer vs User (CRITICAL boundary)

| Term       | Meaning                                                                                                         | Login                                      | Audit Fields                                                  | Permissions              |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- | ------------------------ |
| `Customer` | B2C end consumer (purchaser of equipment filters). Identified by username/email/phone or WeChat openid/unionid. | Self-registration or WeChat OAuth (future) | NONE (no createdById/updatedById — B2C has no admin operator) | N/A (B2C, no RBAC)       |
| `User`     | Backend staff (admin/operator). Identified by username/email.                                                   | Username+password (JWT)                    | YES (createdById/updatedById on all admin tables)             | RBAC via Role+Permission |

`Customer` and `User` are deliberately separate models (see ADR 0002). Do NOT merge — different identity providers, audit semantics, and lifecycle.

### Anonymous access

**Anonymous Visitor**:
A B2C site visitor who has not authenticated. Has no identity in the system (no userId, no roles, no audit归属). Can browse designated public catalog endpoints (equipment/\* GET only). Converts to `Customer` upon future self-registration or WeChat OAuth.
_Avoid_: guest,游客 (those refer to the logged-in demo User account `guest/123456` — see `guest` role in seed), unauthenticated user, anonymous user.

> ⚠️ Distinguish from `guest` role: `guest` is a *logged-in* `User` (backend staff demo account, full RBAC, writes blocked by `GuestWriteGuard`). `Anonymous Visitor` is *not logged in at all* — no JWT, no RBAC, no `request.user`. The two are different axes and must not share terminology.

### Equipment / Filter domain

| Term               | Meaning                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EquipmentBrand`   | Brand dictionary (e.g. Bosch, Caterpillar). Snapshotted into Equipment.brandName on creation.                                                                   |
| `EquipmentCatalog` | Catalog dictionary (product line grouping). Snapshotted into Equipment.catalogName.                                                                             |
| `FilterType`       | Filter classification dictionary (e.g. air/oil/fuel filter). Referenced by Filter.typeName (loose FK via code).                                                 |
| `Filter`           | The sellable filter product. Identified by `model` (unique). Has dimension/weight/volume specs, photo/drawing UUIDs, compatibility JSON.                        |
| `Equipment`        | Equipment档案 — a piece of machinery that uses specific filters. Snapshots brandName+catalogName at creation so historical records survive brand/catalog renames. |
| `EquipmentFilter`  | Many-to-many association between Equipment and Filter (event-type table, no updatedAt).                                                                         |

### Inquiry domain

| Term          | Meaning                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Inquiry`     | RFQ (询价单). Status flow: `draft → submitted → quoted → expired` (one-way). Generated inquiry number format: `INQ{YYYYMM}-{4-digit seq}`. |
| `InquiryLine` | Inquiry line item. Snapshots productName/model/typeName from Filter at creation. Survives Filter hard-delete (filterId set null).       |

### Customer activity domain

| Term               | Meaning                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `CustomerAddress`  | Shipping address. `isDefault` unique per customer (enforced in Service transaction).               |
| `CustomerFavorite` | Filter favorite (event-type, idempotent create, hard-delete on unfavorite).                        |
| `CustomerHistory`  | Filter view history (event-type, upsert semantics — repeat view updates visitedAt, no new record). |

## Technical Vocabulary

| Term                            | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SoftDeleteService`             | Cross-cutting @Global NestJS service. Centralizes soft-delete logic + uniqueness validation for models with `deletedAt`. 3-method deep module: `assertUniqueActive`, `softDelete`, `handleUniqueError`. See ADR 0003.                                                                                                                                                                                                                                                                                                                 |
| `Completeness-weighted sort`    | 信息齐全加权排序 — the B2C browsing-domain sort rule (anonymous / b2c visibilities only): products with fewer NULL business fields rank first. Order: weighted completeness score DESC → `sortOrder` DESC → `createdAt` DESC (third level guarantees stable pagination). `sortBy` query param is ignored in this domain. Field/weight tables are per-module data; the mechanism is shared. See ADR 0005 增补.                                                                                                                                   |
| `User response projection`      | The single private seam in `UsersService` (`findUserForResponse` + `USER_RESPONSE_SELECT`) that owns how a `User` is re-queried and mapped to `UserResponseDto`. Centralizes the relation select (roles/department/positions) so scalar fields can't silently drift per endpoint. The paginated list uses `USER_LIST_SELECT` (description intentionally excluded).                                                                                                                                                                    |
| `Role-mutation guard`           | The private `assertRoleMutationAllowed` seam in `UsersService` owning the common precondition for role changes: target exists → can't edit self → super-admin hierarchy ladder → roleIds valid. Kept separate from each mutation's role-specific super-admin rules.                                                                                                                                                                                                                                                                   |
| `Permission-cache invalidation` | `PermissionCacheService.invalidateUser(userId)` / `invalidateRole(roleId)` — intent-named invalidators. Any mutation changing a User's effective permissions must call one of these; the raw `del` is private (per-Redis key). RolesService previously re-implemented brand/role-scoped invalidation, now sunk into the cache module. ⚠️ TODO: `UsersService.remove()` deletes a user without invalidating their permission cache — stale JWT can hit old codes until TTL; separate change tracks JWT-revocation linkage.             |
| `Data-scope (metadata-only)`    | `Role.dataScope` + `RoleDepartment` + `DataScopeService.assignDataScopeToRole`/`getRoleDataScope` are real management APIs, but data-scope is **recorded, never enforced**: no business query filters by data scope, and business tables have no `departmentId` column to filter on. The former enforcement methods (`buildDataScopeQuery`/`getUserDataScope`) were deleted as grep-verified dead code. Do not assume data-scope gates any data until a future change wires dedicated owner/department columns into business queries. |
| `Single-source filter seam`     | The B2C weighted-sort path derives raw SQL `conditions` from the already-normalized Prisma `where` via a single builder (e.g. `EquipmentService.buildWeightedConditions`), so the `$queryRaw` list and the `count()` share one filter source and can't diverge. Keyword is read back from `where.OR` (model/brandName) as an `ILIKE`. ⚠️ `FiltersService`/`CatalogsService` still build their conditions in parallel — same pattern, tracked for a follow-up consolidation.                                                           |
| `pg_advisory_xact_lock`         | PostgreSQL transaction-scoped advisory lock. Used in `InquiriesService.generateInquiryNo()` to serialize same-month inquiry number generation.
| `Request-logging module`        | Deep `src/logging/` module owning **how a request gets logged**: pino transport+redact, `request#id` correlation (exposed as `@RequestId()`), and the outermost global interceptor whose single branch emits success / slow(> LOG_SLOW_MS, +body) / failure(error+stack, once) access logs. `HttpExceptionFilter` does NOT log — it only shapes the response. pino is the sole real adapter (one-adapter seam, no abstract Logger interface). Intentionally kept distinct from `OperationLogInterceptor` (DB audit → `OperationLog.requestId`), which reads the correlation id via `@RequestId()`, not pino internals.                                                                                                                                                                                                                                                                                                                                                                                        |
| `ILIKE`                         | PostgreSQL case-insensitive LIKE. Used for keyword search across equipment/inquiry/customer modules (instead of full-text search — see proposal Q7).                                                                                                                                                                                                                                                                                                                                                                                  |
| `Snapshot field`                | A denormalized field (e.g. `Equipment.brandName`) copied from a related record at creation time. Insulates historical records from later renames.                                                                                                                                                                                                                                                                                                                                                                                     |
| `Event-type table`              | A table with no `updatedAt` and (typically) no soft-delete service calls. Examples: `EquipmentFilter`, `CustomerFavorite`, `CustomerHistory`. Semantics: "create-and-forget, delete-and-remove".                                                                                                                                                                                                                                                                                                                                      |

## Conventions

- **IDs**: All business entities use `Int` autoincrement PK + `{entity}Id String @unique @default(uuid())` UUID business ID. The `id` is never exposed in API responses (use `@Exclude()`).

- **Soft delete**: Business tables (9) have `deletedAt DateTime?` + `@@index([deletedAt])`. Soft-deleted records are excluded from list queries (`where.deletedAt = null`) but still occupy DB unique constraints.

- **Audit fields**: Admin-facing tables have `createdById`/`updatedById` (FK to User.userId). B2C tables (Customer, CustomerAddress, CustomerFavorite, CustomerHistory) do NOT.

- **Enums as constants**: No Prisma enums. Enum-like values are `String` columns + const arrays in `src/shared/constants/*.constant.ts` (e.g. `EQUIPMENT_ENGINE_ENERGY`, `INQUIRY_STATUS`).

- **Permission codes**: Format `{module}:{resource}:{action}` (e.g. `equipment:brand:list`). Defined in `src/shared/constants/permissions.constant.ts`. Never hardcoded.

