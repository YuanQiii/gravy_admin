## Why

`GET /brands/hot` 每次请求都通过 `findMany` 取出**全部** `status='enabled'` 且未软删的品牌（无 `limit`、无分页），再在 Node 侧经 `rankHotBrands` 合并排序后 `slice(0, limit)`。品牌量级增长后，每次匿名可打（60 req/min，见 `mall-brands.controller.ts:29`）的请求都要传输并排序整表，内存与延迟随品牌数线性恶化。`HotBrandQueryDto.limit` 最大 50（`hot-brand-query.dto.ts:13`），但**候选集不受该 limit 约束**。

## What Changes

- 将热门品牌的**候选集**（参与排序与截取前被取出的启用品牌集合）约束在一个固定上限 `N` 之内（`N` 远大于展示 `limit`，默认 **200**），该上限独立于请求条数参数。
- 把"标记段 / 未标记段"两段排序下推为两条受限 SQL 查询（各 `LIMIT N`，`deviceCount` 经相关子查询在 SQL 内计算并参与 `ORDER BY`），随后仍由纯函数 `rankHotBrands` 合并并 `slice(0, limit)`。
- 排序不变量（标记段优先 → `hotOrder` 升序、`NULLS LAST` → `deviceCount` 降序 → `createdAt` 兜底）保持不变，仍单点收敛于 `hot-ranking.ts`。
- 非破坏性：对外响应字段、条数、排序结果在 `N ≥ 展示上限` 时与现状**逐字节一致**（已证明，见 design.md D3）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `equipment/brands/hot`: 修订「公开热门品牌列表」Requirement，新增候选集上限约束（纯资源边界），排序与对外结果行为不变。

## Impact

- 代码：`packages/domain/src/equipment/brands/brands.service.ts:211-254`（`findHot` 候选查询改造，下推两段受限 SQL）。
- 新增/调整 SQL 候选查询实现（复用 `$queryRaw` 或既有 `runWeightedSort` 风格机制；`deviceCount` 须在 SQL 内计算，因其非 `EquipmentBrand` 列，而是对 `equipment` 的聚合）。候选集上限 `N` 作为常量承载于 `hot-ranking.ts` 或 `findHot` 邻近处。
- 排序纯函数 `rankHotBrands`（`hot-ranking.ts:39-71`）与既有单测 `hot-ranking.spec.ts` 保持不变；新增"候选集上限"单测。
- 控制器与限流不变：`apps/mall/src/modules/mall/browse/mall-brands.controller.ts:27-38`（`@Throttle` 60/min 仍适用，因候选集已收敛）。
- `prisma/schema.prisma`：`EquipmentBrand`（`502-525`）仅有 `isHot`/`hotOrder`，无 `deviceCount` 列；`equipment.brandId` 已建索引（`652`）。可选：为 `EquipmentBrand.isHot` 加索引以加速标记段查询（见 tasks）。
