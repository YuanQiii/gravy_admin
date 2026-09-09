## Why

GVRAY Admin 目前 `GET /equipment/brands` 仅按 `sortOrder` 返回全量品牌分页列表，缺少面向 B2C 前端首页运营位/品牌墙的"热门品牌"聚合展示能力。需要一种由运营配置热门、并自动按设备量补足的高质量品牌集合，提升首页内容质量与运营可控性。

## What Changes

- 新增公开子端点 `GET /equipment/brands/hot`（无需认证，走 `@Public`），返回固定条数（默认 Top-8，`limit` 可调）的"热门品牌"列表。

- 热门判定为**运营标记优先 + 设备数兜底**混合模式：

  - 运营标记 `isHot=true` 的品牌按 `hotOrder` 升序置顶；

  - 未达上限时，按设备表中引用该 `brandId` 且有效的设备数降序补足未标记品牌；

  - 最终截取 Top-N。

- `EquipmentBrand` 新增两个字段：`isHot: Boolean?`（默认 false）、`hotOrder: Int?`（可空，运营设顺序，未设按设备数/入库时间兜底）——需 schema 变更 + migration。

- 后台配置能力：`PATCH /equipment/brands/:id` 复用 `UpdateBrandDto` 增加 `isHot`/`hotOrder`；另新增批量标记端点 `POST /equipment/brands/batch-hot`（`{ ids, isHot, hotOrder? }`）。

- 新增双权限码 `equipment:hotBrand:view`、`equipment:hotBrand:update`，并同步 seed 权限与菜单。

## Capabilities

### New Capabilities

- `equipment/brands/hot`: 「热门品牌」能力——公开热门品牌列表的排序语义（运营标记优先、设备数兜底）、字段、后台配置接口与权限点。

### Modified Capabilities

无（仅新增子资源，不改变 `equipment` 既有 REQUIREMENTS 语义；品牌列表/详情行为不变）。

## Impact

- **Schema / DB**：`EquipmentBrand` 新增 `isHot`、`hotOrder`，migration（开发 `prisma migrate dev`，生产 `migrate deploy`）。

- **API**：新增 `GET /equipment/brands/hot`、`POST /equipment/brands/batch-hot`；`PATCH /equipment/brands/:id` DTO 扩展。

- **排序统计**：按 `equipment` 表 `brandId` 关联计数（排除软删 + 仅生效状态）。品牌表无 FK，需以 equipment→brandId 反查热度。

- **权限/菜单**：新增 `equipment:hotBrand:view`、`equipment:hotBrand:update`，更新 `permissions.constant.ts`、seed、菜单 seed。

- **DTO**：新增 `HotBrandResponseDto`（聚合设备数）或扩展 `BrandResponseDto`；路由/响应遵循 `ResponseUtil` 与 B2C visibility 三分流约定。

