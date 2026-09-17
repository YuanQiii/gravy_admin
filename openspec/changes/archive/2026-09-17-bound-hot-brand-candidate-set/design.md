## Context

`BrandsService.findHot`（`packages/domain/src/equipment/brands/brands.service.ts:211-254`）当前做法是：`findMany` 取出**全部** `status='enabled'` 且未软删的品牌（无 `limit`/分页），同时 `equipment.groupBy` 在 DB 侧聚合各品牌生效设备数，二者在 Node 侧经纯函数 `rankHotBrands`（`hot-ranking.ts:39-71`）合并排序后 `slice(0, limit)`。

约束（已核实）：
- `deviceCount` **不是** `EquipmentBrand` 列，而是对 `equipment` 的 `groupBy` 聚合（`schema.prisma:502-525` 无该列；`equipment.brandId` 索引见 `652`）。Prisma `findMany` 无法对跨表派生计数做 `orderBy`，故"按设备数排序"必须在 SQL 内计算。
- `HotBrandQueryDto.limit` 最大 50（默认 8），但候选集不受其约束（`hot-brand-query.dto.ts:10-14`）。
- 端点 `GET /brands/hot` 匿名可打、限流 60 req/min（`apps/mall/src/modules/mall/browse/mall-brands.controller.ts:27-38`）。
- 同型问题排查：`FiltersService` 无"热门候选集"接口；其 B2C 加权排序已通过 `runWeightedSort` 下推 SQL（`filters.service.ts:160-187`），属既有先例、非本变更范围。详见 Risks。
- 代码库已有"排序策略与 I/O 分离"先例：`hot-ranking.ts` 注释明确 `rankHotBrands` 与 `weighted-sort` 同属此类；这是本设计保留纯函数、只动 I/O 形状的依据。

## Goals / Non-Goals

**Goals:**
- 将候选集规模从 O(全部启用品牌) 收敛到 O(N)，`GET /brands/hot` 的 DB 行传输与 Node 排序量不再随品牌总数线性增长。
- 把"标记段 / 未标记段"两段排序下推到 SQL（各 `LIMIT N`，`deviceCount` 在 SQL 内计算并参与 `ORDER BY`）。
- 保留 `rankHotBrands` 纯函数作为排序不变量的单点，对外排序与结果不变。

**Non-Goals:**
- 不改变 `GET /brands/hot` 的公开字段、权限或限流。
- 不改变 `POST /equipment/brands/hot-status` 配置接口与 `isHot/hotOrder` 语义。
- 不引入分页/游标（热门列表本质为定长 Top-N）。
- 不触达 filters 域（已确认无同型热点接口）。

## Decisions

**D1 — 候选集下推为两条受限 SQL 查询，而非仅给 `findMany` 加 limit。**
理由：`deviceCount` 是跨表聚合，Prisma `findMany` 无法按它排序；仅给 `findMany` 加 `take` 会按无关键（如 `createdAt`）截断，从而以非确定性方式丢弃高设备数未标记品牌，破坏"按设备数补足"不变量。两条受限 raw SQL（标记段 `WHERE isHot=true`、未标记段 `WHERE isHot=false`，各 `LIMIT N`，`deviceCount` 经相关子查询计算并进入 `ORDER BY`）可同时做到"有界"与"保序"。
备选否决：① "仅对 `findMany` 加 `take:N`"——会破坏确定性（见上），否决。② "保留 `groupBy` 全表聚合、只截断品牌 `findMany`"——品牌侧无设备数序，截断同样非确定性，否决。
落实：复用 `$queryRaw` 或 `runWeightedSort` 风格的 SQL 机制（已有先例，提升 locality）。

**D2 — 候选集上限 `N = 200`。**
理由：展示上限最大 50（`@Max(50)`）。取 200 = 4× 展示上限余量，覆盖本域实际语义——`EquipmentBrand` 是运营维护的字典，量级预期停留在低百位；200 将 SQL 行数与 Node 排序量上限锁定在 O(200)，即便品牌总数增长到数千也不恶化。因 `N ≥ 展示上限`，对结果无影响（见 D3），故该值属纯安全边界。`N` 作为命名常量（如 `HOT_BRAND_CANDIDATE_CAP`）与 `rankHotBrands` 同模块承载，便于一处维护排序范围。若未来展示上限被提升到超过 200，需同步上调 `N`——此为独立小变更，不回写本次行为。

**D3 — tie-break 确定性判断：下推 SQL 不改变排序结果（关键判断）。**
纯函数 `rankHotBrands` 的比较器可精确映射到 `ORDER BY` 数组：
- 标记段：`ORDER BY hotOrder ASC NULLS LAST, deviceCount DESC, createdAt DESC`
- 未标记段：`ORDER BY deviceCount DESC, createdAt DESC`
- 合并顺序固定为 `[标记段…, 未标记段…]` 再 `slice(0, limit)`。

因为 `hotOrder` 的 NULL 兜底（纯函数用 `Number.MAX_SAFE_INTEGER`，SQL 用 `NULLS LAST`）、`deviceCount` 降序、以及 `createdAt` 终极兜底均可被 `orderBy` 数组逐项表达，两段 SQL 各自的有序集合与纯函数在相同输入上产生的有序集合**逐元素一致**。当两段查询各 `LIMIT N` 且 `N ≥ limit` 时，拼接后 `slice(0, limit)` 的结果与"取全部候选再合并切片"**恒等**（标记段恒在前：若标记数 ≥ limit 则纯取标记段前 limit；未标记段最多补充 `limit − 标记输出数 ≤ limit ≤ N`，候选集已全覆盖）。
结论：**排序结果不会变化，无需"接受 tie-break 变化"的取舍**。本变更采用"下推 SQL + 保留纯函数"的路线，而非"保守只加候选集上限却不保序"的路线，因为后者在品牌数超过上限时会破坏确定性，而前者既保界又保序。

**D4 — 匿名可见性在 raw SQL 内联，复用既有谓词语义。**
理由：控制器已强制匿名可见性（`status='enabled' AND deletedAt IS NULL`）。raw SQL 无法调用 `applyVisibility`，须内联等价常量谓词：品牌侧 `equipment_brands."deletedAt" IS NULL AND "status"='enabled'`；设备数子查询侧对 `equipment` 同样施加 `deletedAt IS NULL AND status='enabled'`。SQL 不含任何用户可控输入（品牌列表由服务端派生），与 `runWeightedSort` 的注入防护思路一致，无新增注入面。

## Risks / Trade-offs

- **[风险] 新增 raw SQL 与可见性谓词重复** → 缓解：将候选查询聚合成单一 `HotBrandCandidateSource`（见架构审查采纳项），谓词与 `applyVisibility` 语义同源维护；并在单测中校验"软删/disabled 设备不计入"与此前 `deviceCount` 行为一致。
- **[风险] `N=200` 不足（未来展示上限被调到 >200）** → 缓解：常量集中、单测断言 `N ≥ limit` 不变量；超限属独立小改，不影响本次对外行为。
- **[风险] `isHot` 无索引，标记段查询在品牌极大时为顺序扫描** → 缓解：候选集已收敛到 200 行量级、成本可控；可选为 `EquipmentBrand.isHot` 加索引（见 tasks 可选任务）。
- **[风险] filters 域存在同型热点候选集问题** → 已排查：`FiltersService` 无"热门"概念，其 B2C 加权排序已下推 SQL，非同型问题。记录为独立观察，建议后续单独评估，不纳入本变更范围。
- **[权衡] 引入 raw SQL 而非纯 Prisma** → 换取跨表聚合保序；代码库已有 `runWeightedSort` 先例，可接受。

## Migration Plan

- 仅改 `findHot` 内部 I/O 形状与新增候选集常量；对外契约不变，无需数据迁移、无需前端改动。
- 回滚：`findHot` 还原为原 `findMany` + `groupBy` + `rankHotBrands` 即可，无持久化结构变更。

## Open Questions

（无——候选集上限取值、路线与 tie-break 判定均已在此明确，无需用户补充决策。）

---

## Architectural review — adopted deepenings

> 以下结论来自对本次 4 份规划件的架构审查（`architecture-review-P2-6-hot-brands.html`），用户已预授权「同意推荐」，一律采纳推荐项。

**A1（Strong，已采纳）— 提取 `HotBrandCandidateSource` 接口，隔离两条受限 SQL。**
将 D1 的新 I/O 形状从 `BrandsService.findHot` 抽出为可替换的 `HotBrandCandidateSource` 接口：生产实现发两条受限 raw SQL（相关子查询算 `deviceCount`），测试实现用内存适配器。遵循代码库既有的"排序策略 / I/O 分离"先例（`hot-ranking.ts`、`weighted-sort`）。两个适配器（prod=raw SQL，test=内存）使该 seam 成为真实 seam；`rankHotBrands` 纯函数与候选集查询各守一侧，**locality** 提升（SQL + 可见性谓词收于一处），**leverage** 提升（单接口、多调用点）。写入 tasks 2.x。

**A2（Worth exploring，已采纳为轻量项）— 候选集上限 `N` 与纯函数同模块。**
将 `HOT_BRAND_CANDIDATE_CAP` 常量与 `rankHotBrands` 同置于 `hot-ranking.ts`，使"排序范围"与"排序不变量"共址，**locality** 提升，避免魔法数散落于 service 与 SQL 两处。写入 tasks 1.x。

**A3（Speculative，已否决）— 把"标记/未标记两段受限查询合并"提升为通用 `ranked-candidate` 机制复用。**
当前仅品牌使用此模式，第二个调用点不存在；单适配器 = 假设性 seam，违反 YAGNI。否决，记录为未来观察，不写入实现任务。
