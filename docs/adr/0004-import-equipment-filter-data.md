# ADR 0004: Import Equipment/Filter Data from Legacy pg_dump

- Status: Accepted
- Date: 2026-08-27
- Related: OpenSpec change `import-equipment-filter-data`, ADR 0001, ADR 0002

## Context

A legacy project's pg_dump (`prisma/soybean-admin-nest-backend_af_eqm_equipment_catalogs_2026-08-26_161358.sql`, 17 MB, owner `soybean`) contains real business data for the equipment/filter domain: 6 tables with data — brands (3,224), catalogs (49), filter_types (8), filters (10,479), equipment (33,681), equipment_filters (121,128). The remaining tables in the dump are either empty (`af_inq_*`, `af_usr_addresses/favorites/history`) or test-only accounts (`af_usr_users`: 6 test users).

The gvray_admin database had all 12 business tables empty except one hand-made test brand. Real data was needed as a working baseline.

The source schema is incompatible with gvray's Prisma schema in several ways: bigint auto-increment PKs vs UUID strings, PG enum types vs VarChar, `is_active boolean` vs `status varchar(16)` ('enabled'/'disabled'), `search_vector tsvector` + GIN/trigram indexes (absent in target), no `createdById`/`updatedById` audit columns, and `date` vs `timestamp(3)` production dates.

## Decision

1. **Migrate only the 6 data-bearing tables.** Skip empty tables (nothing to migrate) and test users (would pollute `customers`; real B2C data will come from actual registrations).
2. **Staging + pure-SQL ETL in one transaction** (`prisma/scripts/migrate_af_eqm_to_gvray.sql`, generated from the dump): TEMP staging tables preserve bigint ids → TEMP mapping tables (`source_id bigint, target_id uuid` via `gen_random_uuid()`) → `INSERT ... SELECT` per table in FK-dependency order. ~165k rows load in seconds; atomic (single `BEGIN`/`COMMIT`).
3. **Audit columns set to NULL.** The real creators are not gvray admin users; fake attribution would corrupt audit semantics (ADR 0002). A dedicated `OperationLog` "bulk import" entry is the traceability story.
4. **Skip full-text search columns and special indexes** (`search_vector`, GIN trigram, jsonb_path_ops). gvray does not use PG full-text search; introducing it is an independent architectural decision, not a data-migration concern.
5. **Type/semantic mappings**: `is_active` → `status` ('enabled'/'disabled'); missing `is_active` → 'enabled'; `date` → `::timestamp`; enum → text; `photoUuid`/`drawingUuid` kept verbatim (file-asset references); soft-deleted rows migrated as-is (`deletedAt` preserved); `sortOrder` default 0 where absent.
6. **Dangling-FK policy** (probed, all zero in practice): `equipment.brandId`/`catalogId` dangling → set NULL (row still inserted); `equipment_filters` dangling → drop the row (junction rows are meaningless without both ends).
7. **Two-phase execution via a psql variable switch**: the script ends with `\if :commit COMMIT; \else ROLLBACK; \endif`. Dry-run: `psql -f script.sql` (rolls back); commit: `psql -v commit=true -f script.sql`. The exact same file runs both phases — no editing between verification and commit.
8. **Script location: `prisma/scripts/`, NOT `prisma/migrations/`** — the latter is Prisma Migrate's reserved directory; a non-migration SQL file there can confuse `prisma migrate status`.

## Consequences

Positive:
- 165k rows imported atomically with full verification (row counts, unique-conflict probes, dangling probes, FK integrity checks, sampled records) — all green before commit.
- Dry-run and commit ran the byte-identical script; zero surprise between verification and execution.
- `pg_dump` backup + single-transaction rollback provide two independent safety nets.

Negative:
- Data creators are untraceable (`createdById`/`updatedById` NULL) — accepted trade-off (see Decision 3).
- Full-text search capability present in the source system is not migrated; a future need requires an independent schema change + ADR.
- The 17 MB source dump and the ~16 MB generated script both live in the repo (one-off cost). `prisma/backups/` is gitignored.

## Follow-up Fix: Prisma Decimal serialization

Loading real data exposed a **pre-existing latent defect** (not caused by the data): `plainToInstance` with `excludeExtraneousValues` crashes on Prisma `Decimal` values — class-transformer, lacking `@Type()` metadata, guesses `targetType = value.constructor` (Decimal) and runs `new Decimal(undefined)` → `[DecimalError] Invalid argument`. NULL values bypass the crash, which is why empty tables never surfaced it. Affected: 2,842 filter rows (volume/weight/dimensions) and 6,217 equipment rows (power).

Fix (user-approved scope extension, tasks 5.3): `@Type(() => Number)` on the 9 Decimal fields of `FilterResponseDto` and on `power` in `EquipmentResponseDto` — routes through class-transformer's primitive path (`Number(value)`, null preserved). Note: `@Transform` alone does NOT work — it runs *after* the inner `transform()` call that crashes. `EquipmentService.findOne` additionally maps its nested `equipmentFilters[].filter` through `FilterResponseDto` before the outer transform.

Known remaining gap (out of scope): `EquipmentService.listFilters` returns raw Prisma `Filter[]` (no DTO) — Decimal serializes via `toJSON` as string and exposes the auto-increment `id`; should be normalized in a future change.

## Alternatives Considered

### A. Prisma + TypeScript ETL script
Rejected. ~165k rows through the ORM is 5-10x slower, needs batching, and offers no advantage over `INSERT ... SELECT` when the transformation is expressible in SQL.

### B. Rewrite the dump file in place (rename tables/columns, inline UUIDs)
Rejected. Remapping bigint→UUID inside COPY blocks at the text level is error-prone; staging tables keep the transformation declarative and inspectable.

### C. UUID v5 deterministic generation instead of `gen_random_uuid()`
Rejected. Reproducibility across runs was handled by the transaction-switch pattern instead; UUID v5 adds a namespace convention and collision reasoning for no benefit here.

## References

- Script: `prisma/scripts/migrate_af_eqm_to_gvray.sql` (generator: one-off `node_modules/.cache/build-migrate-script.mjs`)
- Backup: `prisma/backups/gvray_admin_pre_migration_20260827_*.sql`
- Planning artifacts: `openspec/changes/import-equipment-filter-data/` (proposal.md, design.md, tasks.md)
- Decimal fix: `src/modules/equipment/filters/dto/filter-response.dto.ts`, `src/modules/equipment/equipment/dto/equipment-response.dto.ts`, `src/modules/equipment/equipment/equipment.service.ts`
