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

---

## 加权排序扩展与 VisibilityOpts 三分流（ADR 增补，2026-04-26）

### 背景
ADR 0005 上线后，B2C 转化反馈：anonymous 列表中信息残缺（多字段为 NULL）的设备/目录排在前列，客户点击后因缺乏关键规格（引擎参数、系列号、产品说明）跳失率高。运营要求"信息齐全的产品优先展示"。

同时，原设计中的 `VisibilityOpts` 只有 `'anonymous' | 'authenticated'`，但：
- `'authenticated'` 在控制器中从未传值（后台管理路径传 `undefined` 已等效，是死值）；
- B2C 场景下 `Customer` 模型的注册/登录接口还未开放，但已预留 B2C 登录态的浏览权限需求——其可见性、排序、禁用过滤语义应与 `'anonymous'` 完全一致，不应与管理后台登录态混为一谈。

### 决策
1. **三分流 `VisibilityOpts`**：将类型改为 `'anonymous' | 'b2c' | 'admin'`，删除死值 `'authenticated'`。
   - 定义常量 `B2C_VISIBILITIES = ['anonymous', 'b2c'] as const`，统一用 `includes()` 判断 B2C 浏览域；
   - `'admin'`（含未传 opts，即 undefined）为管理域，保持原有 sortBy/sortOrder、可见性无强制过滤；
   - `applyVisibility` / `assertVisible` / 各 service 的加权排序分支，统一按 `B2C_VISIBILITIES.includes()` 分流，避免后续 Customer 登录上线时出现"匿名/登录两种不同 B2C 体验"的漂移。
2. **扩展加权排序范围**：从仅 `filters`（v1 实现）扩展至 `equipment` 与 `catalogs` 三个产品/展示模块。
   - 实现方式复用 filters 模板：`$queryRaw` + 静态 `CASE WHEN` 加权求和 SQL（字段名与权重常量，可安全内联），查询条件（status/keyword/brandId 等）通过 `${...}` 参数化防注入；
   - 排序规则统一：加权分 DESC → sortOrder DESC → createdAt DESC（第三级 createdAt 保证同分下翻页稳定，避免跨页重复/丢失）；
   - sortBy 参数在 B2C 浏览域被**忽略**，保证产品决策排序体验一致性；
   - `count` 查询继续使用 Prisma 模型的 `count({ where })`，与加权排序解耦，同时复用 `applyVisibility` 注入的 `status='enabled'` 过滤。
3. **字段与权重按 schema + 业务价值划分**：
   - **Filters（12 字段，满分 28）**：核心展示 gencode/photoUuid/drawingUuid（w=5 × 3 = 15），关键参数 weight/volume（w=3 × 2 = 6），详细参数 dimension{D1/D2/D3/D7/H1/H2/H3/D8}（w=1 × 8 = 8，其中 dimensionD7/D8 字符串额外判 `!= ''` 防脏数据）；
   - **Equipment（8 业务 nullable 字段，满分 28）**：引擎核心参数 engineBrand/engineType/power/engineEnergy（w=5 × 4 = 20），产品生命周期 productionDateStart/productionDateEnd（w=3 × 2 = 6），关联完整性 brandId/catalogId（w=1 × 2 = 2）；
   - **Catalogs（2 业务 nullable 字段，满分 8）**：核心匹配 code（w=5，产品系列号客户搜索匹配用），关键说明 description（w=3，产品说明）。
4. **测试 Seam**：
   - e2e 主 Seam：`test/equipment-anonymous.e2e-spec.ts` 新增 5.7 Equipment 3 用例、5.8 Catalogs 3 用例（加权排序生效、sortBy 忽略、count 注入 status='enabled'）；5.1 共享 it.each 表中 brands / filter-types 保留，filters / equipment / catalogs 各自移入独立 describe（其 call 交互断言从 `findMany was called` 切换为 `$queryRaw was called`）。
   - unit 辅 Seam：`base.service.spec.ts` 补 4 个 `'b2c'` 对齐用例 + 原 `'authenticated'` 全部换为 `'admin'`，共 11 用例。
5. **DTO 过滤不回退**：加权排序返回的 raw rows 在服务层 `plainToInstance(ResponseDto, { excludeExtraneousValues: true })` 过 DTO 过滤，**不暴露数据库自增 `id`、token、secret**（符合 AGENTS.md 安全约束）。Equipment 的 `power: Decimal?` 经 `@Type(() => Number)` 自动转为 number；filters 中 Decimal 字段同理。

### 后果
- B2C 首页 / 搜索列表的"信息齐全产品优先"排序可稳定提升关键规格曝光度，减少客户因点击空资料跳失。
- 管理后台路由**完全不感知**此变更（传 `undefined` 仍走 `paginateWithSort` + sortBy/sortOrder）。
- 未来 B2C Customer 登录上线时，控制器只需将 `visibility` 传 `'b2c'` 即可复用现有加权排序 + status 过滤逻辑，无需改 service 内部分流判断。
- 新增 3 处模块内私有常量（EQUIPMENT_WEIGHTED_FIELDS / CATALOG_WEIGHTED_FIELDS / WEIGHTED_SORT_FIELDS）与对应 SUM SQL，新增/修改加权字段时需同时：
  1. 更新模块内字段常量；
  2. 更新 `docs/specs/anonymous-filter-weighted-sort.md` 权重表；
  3. 调整对应 e2e 测试的 A/B/C 分值构造数据。
- raw SQL 使用 `Prisma.sql` + `Prisma.raw` 双轨：所有用户输入（keyword、status、id）都经 `${...}` 参数化；列名与权重（常量）经 `Prisma.raw` 内联，不暴露 SQL 注入面。
- 测试中 `prisma.$queryRaw` mock 为三个模块共享同一个根 jest.fn()，在每个加权排序 describe 的 `beforeEach` 中显式 `mockClear()` + `mockResolvedValue(...)`，保证 5.6/5.7/5.8 之间不交叉污染 mock 调用记录。

---

## 加权排序机制下沉为共享深模块（ADR 增补，2026-08-28）

### 背景
上一条增补（决策 2-3）把加权排序从 `filters` 扩展至 `equipment`、`catalogs`，但实现方式是"复用 filters 模板"：SUM-SQL 编译、参数化 raw 查询、三级稳定翻页、count 分页、DTO 包络等机制代码在三个 service 中各复制一份（约 150 行中 ~80% 逐字相同），真正逐模块变化的只有数据（表名、字段权重表、where→SQL 条件、ResponseDto）。维护仪式需"改一处同步三处"（见上一条增补后果段所列 3 步），机制级 bug（翻页不稳定、注入缺口）要打三遍补丁，漏一处即静默回归。

### 决策
1. **机制下沉为 equipment 模块内一个共享深模块**：`src/modules/equipment/weighted-sort.ts` 导出纯函数 `runWeightedSort(prisma, spec)` 与 `WeightedSortSpec` 类型；接口全部为数据（table、fields、conditions、pagination、dto、count），返回 `PaginationData<DTO>`。count 以 thunk 传入（各模块 Prisma where 类型不同，真实类型差异，不用泛型强统）。
   - `runWeightedSort` 先经 `Prisma.sql` 组装单一 `Prisma.Sql` 再以普通参数传给 `$queryRaw(sql)`：表名/加权求和（编译期常量）经 `Prisma.raw` 内联进 strings；用户条件/分页（运行期输入）经模板插值进 values（参数化）。
   - 三个 service 保留并仅保留**数据**：字段权重表（`WeightedField` 类型对齐）、`conditions` 构建、count thunk、用于分页的 query DTO。
2. **谓词收敛**：`BaseService` 导出 `isB2cVisibility(opts)`（与 `B2C_VISIBILITIES` / `VisibilityOpts` 同居），替换四处带 cast 的 `B2C_VISIBILITIES.includes(opts?.visibility as ...)`（3 个 `findAll` 分支 + equipment `findOne` 的 B2C 关系过滤），`applyVisibility`/`assertVisible` 内部亦改用它实现。分支判断保留在各 `findAll`（接口语义），不下沉 BaseService。
3. **catalogs 条件改直**：`name` 条件自 query DTO 直接构建为 `"name" ILIKE ${pattern}`，删除经 `buildWhere` 的 contains 中转再拆包的反向路径（行为等价）。
4. **测试 Seam**：
   - unit 主 Seam：新增 `weighted-sort.spec.ts`，以 Prisma.Sql 的 `strings`/`values` 数组断言注入安全（用户值在 values、列名/权重在 strings）、isString 空串判定、ORDER BY 三级结构、LIMIT/OFFSET、count 调用、DTO 包络排除冗余字段。
   - e2e 回归网：既有 `test/equipment-anonymous.e2e-spec.ts` 三个 weighted-sort describe（5.6/5.7/5.8）**断言零修改**——接口 `findAll(query, opts)` 与响应结构未变、行为零变更，冒烟由既有 e2e 全绿证明。

### 后果
- 机制级维护从"三处复制 + 反向拆包"收敛为单点：新增/修改加权字段只需改一处字段表（`runWeightedSort` 自动编译 SUM-SQL），再同步 spec 权重表与 e2e 分值构造数据——**上一条增补后果段所列"改一处同步三处的三步维护仪式"至此被本条取代**。
- 深模块接口小、实现大，删除测试过（删三个私有方法复杂度集中不扩散）；test surface 即 interface（纯函数单测 + e2e 零改动双 seam）。
- 管理后台路径（传 `undefined`）仍走 `paginateWithSort`，完全不感知；B2C 三分流语义逐字保留（'anonymous' | 'b2c' | 'admin'）。
- 跨模块消费者暂不存在（brands / filter-types 经 schema 核实几乎无业务 nullable 字段），模块置于 equipment 内而非 shared；未来出现跨模块 B2C 消费者时 `git mv` 提升。
- 语义零变更：排序规则、权重数值、参数化策略、B2C 忽略 sortBy、count 复用 status='enabled' 全部沿用上一条增补，未做任何改动。

---

## B2C 路由独立前缀 supersede Decision 5（ADR 增补，2026-09-09）

### 背景
随 B2C 能力扩张，公开浏览接口与后台权限接口若继续同 URL 分流，后台 `equipment/*` 路径将长期携带匿名入口，隔离不彻底，也不符合 CONTEXT.md"Customer 与 User 明确分离"的既有边界。同时 B2C 公开浏览的实际消费方已是独立商城进程（不是 same-origin 前端），Decision 5 当初"同 URL 避免前端/Swagger 维护两套 URL"的论据，在消费方进程分隔的语境下已不再适用。

本次变更（OpenSpec change `separate-filter-b2c-and-close-loop`）将公开浏览路由迁移到独立 `b2c/` 前缀，后台 `equipment/*` 只保留鉴权接口。

### 决策
1. **supersede Decision 5**（"URL is reused in place — no `/public/` prefix"）与被拒 Alternative C（独立前缀路由）：公开只读路由迁移到 `b2c/` 前缀。理由——消费方已进程分隔，公开路由归属 `b2c/` 前缀是更清晰的接缝；后台 `equipment/*` 路径与契约零改动。
2. **公开浏览统一 `B2C_OPTS`**：`b2c/browse` 五个控制器统一传 `Object.freeze({ visibility: 'anonymous' })`，enabled-only + 加权排序触发器单点定义，不靠调用方记忆。`VisibilityOpts` 三分流（anonymous/b2c/admin）与 `isB2cVisibility` 保留，后台路径传 undefined 走 admin，无死代码。
3. **热门品牌路由同步迁移**：`GET /equipment/brands/hot` → `GET /b2c/brands/hot`（复用 BrandsService.findHot），避免后台路径残留公开入口。
4. **后台只读路由加权限码**：后台 `equipment/*` 的 GET list/detail/options 原为 `@Public()`，现改为 `@RequirePermissions(...VIEW)`，与既有 `AccessGuard`/RBAC 一致。

### 后果
- 公开浏览只存在于 `b2c/*`，后台 `equipment/*` 仅鉴权，B2C/后台接缝清晰。
- **BREAKING**：匿名访问路径从 `equipment/*` 变 `b2c/*`，商城进程需同步改调用点（与本次 change 部署同版本发布）。
- 既有 `test/equipment-anonymous.e2e-spec.ts` 匿名路径断言更新为 `b2c/*`，认证路径保持 `equipment/*`（回归网全绿）。
- Customer 与 User 分离边界进一步落实：B2C 浏览 `b2c/*`，B2C 客户写端点 `b2c/inquiries`、`b2c/addresses`（皆 `CustomerJwtGuard`），后台 `equipment/inquiry/customer` 保持 RBAC。

> **2026-09-09 supersede 注记**：本增补的 `b2c/` 路由前缀已被 ADR 0010 决策 10 supersede——B2C 拆独立 mall app（独立端口）后前缀语义冗余，全部剥除（`b2c/filters` → mall 的 `/filters`，`customer/auth` → `/auth`，依此类推）。本 ADR 其余决策（VisibilityOpts 三分流、加权排序、`B2C_OPTS`（→ `MALL_OPTS` 改名）、AccessGuard、权限码）不受影响。
