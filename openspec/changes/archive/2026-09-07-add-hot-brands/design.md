## Context

- 现有品牌模块 [brands.controller.ts](src/modules/equipment/brands/brands.controller.ts) 提供 `GET /equipment/brands`（公开）+ CRUD；`@Get(':id')` 已存在，新增 `hot` 子路由**必须声明在其之前**，否则被 `:id` 吞掉。
- `EquipmentBrand` 无聚合字段也无反向关系；热度需经 `equipment.brandId`（[schema.prisma](prisma/schema.prisma#L621-L622)，唯一底表 equipment，`@@index([brandId])`）反查设备数。设备表同时冗余 `brandName`，但计数**必须以 `brandId` 关联为准**（brandName 可能被修改）。
- B2C visibility 口径（[base.service.ts](src/shared/services/base.service.ts#L66-L73)）强制 `status='enabled'`，故"生效设备数"= `deletedAt IS NULL AND status='enabled'`。
- 既有 `runWeightedSort` 是按字段完整度加权排序，与"按设备数聚合"语义不同，本次不复用其机制（设备数是别表聚合，不是本表字段）。
- 权限码用 `definePermission()` 注册（[permissions.constant.ts](src/shared/constants/permissions.constant.ts#L292-L310)），seed 自动纳入；菜单需在 [menus.ts](prisma/seeds/menus.ts#L173-L190) 手动绑定。

## Goals / Non-Goals

**Goals:**
- 公开热门品牌列表：运营标记优先（`hotOrder` 升序、未设靠后）、未标记按生效设备数补足、截取 Top-N（默认 8，`limit` 可调）。
- 后台配置：更新接口扩展 `isHot`/`hotOrder` + 批量标记端点，支持权限控管。
- 复用品牌模块既有约定（BaseService、applyVisibility、DTO 过滤、@Public、@Throttle、@RequirePermissions、operation-log、ResponseUtil）。

**Non-Goals:**
- 不做缓存（Redis）——设备数统计为轻量聚合，公开接口先不加缓存层。
- 不为"热门"单建新表/多对多表——字段级标记即够。
- 不改变既有品牌列表/详情行为（不加 `hot` 过滤进 `GET /equipment/brands`）。

## Decisions

### D1: Schema —— `EquipmentBrand` 新增两字段
新增 `isHot Boolean @default(false)`、`hotOrder Int?`。一个 migration 承载两列新增。

- Alternative：热门口径单用 `sortOrder` 复用作排序。否决——`sortOrder` 是通用展示排序，混用会在列表与热门序两组语义间互相干扰。
- Alternative：建 `BrandHot` 关联表存品牌+顺序。否决——单布尔+可空序字段即可表达，避免多表/级联。

### D2: 生效设备数聚合 —— equipment `groupBy`
`prisma.equipment.groupBy({ by: ['brandId'], where: { deletedAt: null, status: 'enabled', brandId: { not: null } }, _count: true })` 得 `Map<brandId, count>`。`brandId` 已有索引，复杂度一次 O(设备数) 分组。
「生效设备」口径（`status='enabled'`）**复用 `BaseService.applyVisibility(where, { visibility: 'anonymous' })` 注入**，不硬编码字面量——与 ADR 0005「可见性规则写在 BaseService 一次」的 leverage 对齐，未来设备可见性演进时热门榜零改动跟随（候选 3 收口）。

### D3: 合并排序 —— `rankHotBrands` 纯函数深模块
排序策略与 I/O 分离（仿 weighted-sort 先例）：
```ts
// src/modules/equipment/brands/hot-ranking.ts —— 排序不变量单点
function rankHotBrands(
  brands: ReadonlyArray<{ brandId; name; isHot; hotOrder: number | null; createdAt }>,
  deviceCounts: ReadonlyMap<string, number>,   // brandId -> count
  limit: number,
): (typeof brands[number] & { deviceCount: number })[]
```
Service 只做选题：候选（`applyVisibility` 注入 `status='enabled'`）→ equipment `groupBy` 生效设备数 → 调纯函数 → DTO 包络。
排序不变量**只存在于 `hot-ranking.ts`**（`findHot` 不复述）：
```
marker  = hotOrder!=null ? hotOrder asc : (deviceCount desc, createdAt desc)   // NULLS LAST
hot     = isHot 按 marker
fallback= !isHot 按 (deviceCount desc, createdAt desc)
result  = (hot + fallback).slice(0, limit)   // 行内嵌 deviceCount
```
返回已并入 `deviceCount` 的有序行，`slice` 与附加一气完成；`plainToInstance(HotBrandResponseDto)` 直接取 deviceCount。单测直接构造 (brands, map, limit) 断言顺序，零 prisma mock。
- 稳定排序：`hotOrder` 缺失项 `NULLS LAST`；同 `hotOrder`/设备数同分用 `createdAt` 兜底，保证翻页/多次请求一致。

### D4: 路由与 DTO
- 公开端点 `GET /equipment/brands/hot`：声明在 `@Get(':id')` **之前**；`@Public()` + `@Throttle`（对齐 `findAll` 的 60/min）；query DTO `HotBrandQueryDto{ limit?: number }`（默认 8，上限 50）。
- 公开响应：`HotBrandResponseDto`（`brandId/name/slug/deviceCount`，**不含运营字段**），`plainToInstance({ excludeExtraneousValues })` 过滤，不暴露自增 `id`/审计字段。
- 后台写：热门配置收敛单入口 `POST /equipment/brands/hot-status`，`HotStatusBrandsDto{ ids, isHot, hotOrder? }`，带 `operation-log`，由 `hotBrand:update` 守卫（同时服务单条 `ids=[id]` 与批量）。`UpdateBrandDto` **不**接收 `isHot/hotOrder`——普通更新接口不承载热门字段。
- 后台读：`BrandResponseDto` 增 `isHot`/`hotOrder`（后台列表/详情天然携带热门状态，作 `hotBrand:view` 载体）。

### D5: 权限与菜单
权限码常量文件新增 `EQUIPMENT_HOT_BRAND_PERMISSIONS`：
- `equipment:hotBrand:view`（后台查看热门状态 → `BrandResponseDto` 携带 `isHot/hotOrder`）
- `equipment:hotBrand:update`（`POST /equipment/brands/hot-status` 守卫）

每个权限域一个 interface：`hot-brand` 配置 ↔ `hotBrand:update`，普通品牌更新 ↔ `brand:update`，二者不互相承载。后台热门口仅经 `@RequirePermissions(EQUIPMENT_HOT_BRAND_PERMISSIONS.UPDATE)` 守卫；公开 `hot` 接口走 `@Public` 无需权限。菜单 seed 新增「热门品牌」节点（父：设备管理）绑定 `equipment:hotBrand:view`。

## Risks / Trade-offs

- **`@Get('hot')` 被 `:id` 吞掉** → 路由声明顺序前置 + 单测/冒烟验证；短参数不可状如 UUID，语义冲突天然规避。
- **设备数大表 groupBy 开销** → `brandId` 已有 btree 索引；若未来数据量激增再引入 Redis 缓存或物化热度列（当前非目标）。
- **`brandName` 冗余字段误导** → 计数值以 `brandId` 关联为准，不读 `brandName`，避免改名后错配。
- **无权混入热门配置** → `hot-status` 端点显式 `@RequirePermissions(EQUIPMENT_HOT_BRAND_PERMISSIONS.UPDATE)`，遵循 RBAC。

## Migration Plan

1. `prisma/schema.prisma` 加 `isHot`/`hotOrder`。
2. 开发库 `pnpm prisma:migrate:dev`（生成 `ALTER ... ADD COLUMN` 迁移）。
3. 生产经容器 `dist/scripts/db-bootstrap.js` 执行 `migrate deploy`；**禁用 `db push`**。
4. 回滚：降级迁移即可；新增列可空/有默认值，旧代码不受影响。

## Open Questions

无——剩余细节（如 limit 上限取值、菜单摆放）实现期可安全决定，不改 spec/方案/任务拆分。