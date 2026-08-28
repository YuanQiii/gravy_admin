# Tasks — Sink completeness-weighted sort mechanism

## 1. Shared mechanism module

- [x] 1.1 Create `src/modules/equipment/weighted-sort.ts` exporting `WeightedSortSpec` type and `runWeightedSort(prisma, spec)` pure function; verify signature accepts `{ table, fields, conditions, pagination, dto, count }` and returns `Promise<PaginationData<DTO>>`
- [x] 1.2 Implement SUM-SQL compilation from `fields` (isString=true adds `!= ''`, weight inlined) so column names/weights pass via `Prisma.raw` and user values stay parameterized; verify no `Prisma.sql` template interpolates a user-controlled value directly
- [x] 1.3 Implement query execution with `ORDER BY (weighted) DESC, "sortOrder" DESC, "createdAt" DESC` + `LIMIT/OFFSET`, plus `count` thunk and `plainToInstance(dto, rows, { excludeExtraneousValues: true })` envelope
- [x] 1.4 Export `isB2cVisibility(opts)` predicate from `base.service.ts` (co-located with `B2C_VISIBILITIES`), reusing it inside `applyVisibility`/`assertVisible`; replace the cast at all four call sites (3× `findAll` branches + equipment `findOne` isB2c relation filter); verify no `B2C_VISIBILITIES.includes(opts?.visibility as ...)` cast remains

## 2. Unit tests for the mechanism

- [x] 2.1 Add `weighted-sort.spec.ts` capturing the `$queryRaw`-received template and asserting user values appear in parameterized `values` and column names/weights appear in `strings` (injection-safety assertion); verify all new unit tests pass
- [x] 2.2 Add unit assertions for ORDER BY three-level structure, LIMIT/OFFSET, isString empty-string handling, count invocation, and `PaginationData` envelope assembly; verify all new unit tests pass

## 3. Service migration

- [x] 3.1 Refactor `filters.service.ts` to drop private `findAllWithWeightedSort`, keep `WEIGHTED_SORT_FIELDS` table and conditions construction, and delegate to `runWeightedSort` under the `isB2cVisibility` branch; verify filters unit + e2e 5.6 weighted-sort describe pass unchanged
- [x] 3.2 Refactor `equipment.service.ts` likewise (drop `EQUIPMENT_WEIGHTED_SUM_SQL`/private method, delegate, count thunk over equipment); verify equipment unit + e2e 5.7 describe pass unchanged
- [x] 3.3 Refactor `catalogs.service.ts` likewise AND build the `name` condition directly from `query.name` (removing the `buildWhere` round-trip + unpack); verify catalogs unit + e2e 5.8 describe pass unchanged

## 4. Verification & docs

- [x] 4.1 Run full unit suite green and the equipment anonymous e2e suite green (24 e2e incl. 19 anonymous + 5 weighted-sort); pre-existing unrelated failure in `test/app.e2e-spec.ts` (removed GET / route) stays unchanged and out of scope; verify `test/equipment-anonymous.e2e-spec.ts` assertions received zero edits
- [x] 4.2 Append third section to `docs/adr/0005-anonymous-visitor-access.md` documenting the mechanism sink, zero semantic change, and maintenance ritual reduced 3→1, marking the old "three-step ritual" note as superseded; verify CONTEXT.md `Completeness-weighted sort` entry exists and ADR appends (no rewrite of history)