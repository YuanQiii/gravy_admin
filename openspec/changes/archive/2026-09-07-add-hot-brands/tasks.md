## 1. Schema 与 Migration

- [x] 1.1 在 `prisma/schema.prisma` 的 `EquipmentBrand` 增加 `isHot Boolean @default(false)`、`hotOrder Int?`，执行 `pnpm prisma:migrate:dev` 生成迁移并成功应用到本地库（`pnpm prisma:generate` 后编译通过）

- [x] 1.2 顺带更新 `HotBrandResponseDto` 所需 Prisma 类型已可导入（`@prisma/client` 含 `isHot/hotOrder` 字段即可）

## 2. 权限码与菜单 Seed

- [x] 2.1 在 `src/shared/constants/permissions.constant.ts` 新增 `EQUIPMENT_HOT_BRAND_PERMISSIONS`（`view`=equipment:hotBrand:view、`update`=equipment:hotBrand:update），验证 `pnpm build` 通过且权限注册无重复

- [x] 2.2 在 `prisma/seeds/menus.ts`「设备管理」下新增「热门品牌」菜单并绑定 `equipment:hotBrand:view`，验证 seed 后菜单可查询到（运行 `pnpm prisma:seed` 前确认）

## 3. 后台配置（hot-status 写 + BrandResponseDto 读载体）

- [x] 3.1 新增 `HotStatusBrandsDto`（`ids: string[]`、`isHot: boolean`、`hotOrder?: number`），验证 Swagger 描述为中文且可被 class-validator 识别

- [x] 3.2 在 `BrandsService` 新增热门配置方法：经 `POST /equipment/brands/hot-status` 对 `brandId in ids` 写 `isHot`/`hotOrder`（`$transaction`），验证单测覆盖批量与单条 `ids=[id]`

- [x] 3.3 在 `BrandResponseDto` 增加可选 `isHot`/`hotOrder`（后台列表/详情即 `hotBrand:view` 载体），验证 `plainToInstance` 过滤后字段正确且不暴露自增 `id`

## 4. 热门列表服务（纯函数排序 + 薄 I/O）

- [x] 4.1 在 `BrandsService` 新增 `findHot`：候选品牌 + equipment `groupBy` 生效设备数，两者 where 均经 `this.applyVisibility(where, { visibility: 'anonymous' })` 注入 `status='enabled'`（deletedAt 显式置空），\*\*不硬编码可见性字面量

- [x] 4.2 该合并排序抽为纯函数 `rankHotBrands(brands, deviceCounts, limit)`（`src/modules/equipment/brands/hot-ranking.ts`，仿 weighted-sort 先例）：排序不变量（hotOrder 升序 NULLS LAST、设备数降序、createdAt 兜底、slice limit、行内嵌 deviceCount）**只存在于该文件**，`findHot` 不复述排序逻辑

- [x] 4.3 新增 `HotBrandQueryDto`（`limit` 默认 8、上限 50）与 `HotBrandResponseDto`（`brandId/name/slug/deviceCount`，**不含运营字段**，`plainToInstance` 过滤）

- [x] 4.4 为 `rankHotBrands` 编写单元测试（标记优先、hotOrder 序、设备数兜底、仅计生效设备），零 prisma mock，直接断言 (brands, counts, limit) 输出顺序

## 5. Controller 与路由

- [x] 5.1 在 `BrandsController` 新增 `GET /equipment/brands/hot`，**声明在** **`@Get(':id')`** **之前**，加 `@Public()` + `@Throttle`（对齐 60/min），返回 `ResponseUtil` 包装

- [x] 5.2 新增 `POST /equipment/brands/hot-status`，`@RequirePermissions(EQUIPMENT_HOT_BRAND_PERMISSIONS.UPDATE)` + `@OperationLog`，返回 `ResponseUtil`

- [x] 5.3 验证路由不被 `:id` 吞掉：冒烟请求 `GET /equipment/brands/hot` 返回 200 而非 404

- [x] 5.4 验证 hot-status 端点存在单条/批量一致性：`ids=[id]` 与 PATCH 普通更新互不承载热门字段（前台不能经 PATCH 改 isHot）

## 6. 全量验证

- [x] 6.1 `pnpm build` 与 `pnpm test`（含 brands/quard/permission 相关单测）全绿，确认无 `password`/自增 `id` 泄漏进响应

- [x] 6.2 对照本 change 的 spec 场景核对行为（标记优先/顺序/补足/上限/设备数口径/权限拦截）

