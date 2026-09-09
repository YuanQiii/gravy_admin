# 匿名访客 B2C 浏览 — 加权排序与 VisibilityOpts 三分流

> v2 — 原"滤清器加权排序"扩展：VisibilityOpts 三分流、Equipment + Catalogs 加权排序、匿名访客登录角色澄清。
> 变更来源：2026-08-28 grilling 3 轮（Q1-Q15）。

## Problem Statement

### （原）滤清器列表信息不全产品排前问题

作为 B2C 客户（匿名访客）浏览滤清器列表时，当前接口 `GET /b2c/filters` 按运营 `sortOrder` 字段降序返回，导致信息不全的产品（无产品编码、无图片、无图纸、无尺寸参数）可能因为 `sortOrder` 较高而排在前面。客户在浏览前几页时看不到完整产品信息，影响转化决策。

运营手动维护 `sortOrder` 的成本高且不稳定，无法保证每次录入时都设置合理权重。需要一个自动化的排序机制，让"信息齐全的产品"在 B2C 浏览场景下自然优先展示，无需运营额外干预。

### （扩展一）匿名访客登录后角色与排序分流问题

项目存在**两套用户模型**：
- **后台 `User`**：有 self-register + 登录接口，注册默认角色 `'user'`（普通用户），由配置 `feature.registerDefaultRole='user'` 控制。后台 `User` 是内部运营角色。
- **B2C `Customer`**：schema 中已定义（`Customer` 模型含 username/password/email/phone/openid/unionid 等字段），但**暂无登录接口**。未来实现时，该模型承载前台 B2C 买家身份。

原 VisibilityOpts 类型为 `'anonymous' | 'authenticated'`，存在三个问题：
1. **语义不清**：`'authenticated'` 从未在控制器实际传值（只传 `'anonymous'` 或 `undefined`），属于"名义上存在但实际未使用"的死值。
2. **身份不分流**：`'authenticated'` 无法区分"内部 User"与"B2C Customer"——两者排序诉求完全不同（User 要运营 `sortOrder`，Customer 要 B2C 加权排序）。
3. **未来扩展点缺失**：Customer 登录一旦上线，现有判断 `visibility === 'anonymous'` 的代码无法自动覆盖已登录 B2C 客户，会导致"登录后退步（加权没了）"的体验断裂。

### （扩展二）设备/目录模块缺少信息齐全度排序

仅 filters 模块有加权排序，同一浏览链路的 `GET /b2c/equipment`（设备档案）和 `GET /b2c/catalogs`（设备目录）仍按纯 `sortOrder` 排序：
- **Equipment 模块**：8 个 nullable 字段（引擎品牌/型号/功率/能源/生产年/品牌 FK/目录 FK），信息齐全度直接影响客户对设备"资料可信度"的判断，但目前运营 `sortOrder` 无法保证这一点。
- **Catalogs 模块**：2 个 nullable 字段（code、description），目录字典行数虽少，但"编码+说明齐全的规范目录"应排在前列，有利于 SEO URL 生成和客户理解分类用途。

brands / filter-types 因 nullable 字段各仅 1 个（信息分歧度太低，加权排序效果与 `sortOrder` 无异），跳过。

## Solution

### 总体架构

引入 **VisibilityOpts 三分流** 作为 B2C 浏览域 vs 管理域的统一区分信号，在三分流之上对 filters + equipment + catalogs 三个高价值模块应用"非空加权排序"：

```
                      ┌─────────────────────────────────────────────┐
  Controller 传入      │  visibility opts                            │
 ┌────────────────────►│  ┌─────────────┐   ┌───────────────────┐  │
  user? undefined      │  │ 'anonymous' │   │ future 'b2c'      │  │───► B2C 浏览域
  (≡ 'admin')          │  │             │   │ (Customer 登录后) │  │      加权排序
  OR {visibility:'b2c'}│  │  合并为同一  ├──►│  强制 status=     │  │      status=enabled
  OR {visibility:'admin'}│ │  B2C 判断组 │   │    enabled        │  │
                       │  └─────────────┘   └───────────────────┘  │
                       │  ┌─────────────┐                          │
                       │  │   'admin'   │───► 管理域               │───► 管理视角
                       │  │ (undefined) │      paginateWithSort   │      不过滤 status
                       │  └─────────────┘      sortBy 生效         │
                      └─────────────────────────────────────────────┘
```

### Solution 组件详解

#### 1. VisibilityOpts 三分流（扩展一）

`VisibilityOpts.visibility` 类型从 `'anonymous' | 'authenticated'` 改为 `'anonymous' | 'b2c' | 'admin'`：
- 删除死值 `'authenticated'`（从未被传递）。
- 新增 `'b2c'`：预留给未来 B2C Customer 登录。**行为与 `'anonymous'` 完全一致**（status 强制过滤 + 加权排序触发）。
- 新增 `'admin'`：显式管理域；`undefined` 保持向后兼容并等价于 `'admin'`。

所有判断条件从 `visibility === 'anonymous'` 统一改为：
```typescript
['anonymous', 'b2c'].includes(opts?.visibility)  // B2C 浏览域
```
涉及三处底层逻辑：
- `BaseService.applyVisibility`（强制 where.status='enabled'）
- `BaseService.assertVisible`（拒绝 status≠'enabled' 的单条记录）
- 三个设备 service 的加权排序触发条件

控制器**无需改动**：现有 `user ? undefined : { visibility: 'anonymous' }` 逻辑完美映射到新语义。

#### 2. 匿名访客登录后角色澄清（扩展一配套）

| 登录路径 | 登录后身份 | visibility 值 | 排序行为 |
|---|---|---|---|
| 无登录（纯匿名） | 无 JWT，无角色 | `'anonymous'` | B2C 加权排序 ✓ |
| 后台 `/auth/register` + `/auth/login`（User 模型） | 角色 `'user'`（普通用户）或管理员配置角色，内部运营 | `undefined` ≡ admin | 管理 sortOrder 排序 ✓ |
| **未来** B2C Customer 登录（Customer 模型，未实现） | B2C 买家身份 | `{ visibility: 'b2c' }`（控制器按 Customer 守卫传值） | B2C 加权排序 ✓ |

核心原则：**内部管理角色（User 全角色）永远看 sortOrder；B2C 身份（匿名或已登录 Customer）永远看加权排序**。

#### 3. Filters 加权排序（原，已实现；仅同步判断条件写法）

保持现有三档权重：
- **核心展示型 +5**：`gencode`、`photoUuid`、`drawingUuid`（String?）
- **关键参数型 +3**：`weight`、`volume`（Decimal?）
- **详细参数型 +1**：`dimensionD1/D2/D3/D7/H1/H2/H3/D8`（Decimal? 或 String?）

排序链路：加权分 DESC → `sortOrder` DESC → `createdAt` DESC。

同步升级触发条件写法为 `['anonymous', 'b2c'].includes(...)`，与其他模块保持一致。

#### 4. Equipment 加权排序（扩展二新增）

Equipment 共 8 个 nullable 计数字段，满分 24 分：

| 档位 | 权重 | 字段 | 类型 | B2C 动机 |
|---|---|---|---|---|
| 核心展示 | 5 | `engineBrand` | String? | 引擎品牌，客户筛选第一关键词 |
| 核心展示 | 5 | `engineType` | String? | 引擎型号，与品牌配套的核心信息 |
| 关键参数 | 3 | `power` | Decimal? | 设备功率，直接决定产能 |
| 关键参数 | 3 | `engineEnergy` | String? | 能源形式，合规/成本敏感（柴油/电/混动） |
| 关键参数 | 3 | `productionDateStart` | DateTime? | 生产起始年，判断设备世代新度 |
| 关键参数 | 3 | `productionDateEnd` | DateTime? | 生产截止年，同上 |
| 详细参数 | 1 | `brandId` | String? | FK 关联完整（denormalized brandName 必填，但 FK 完整表示数据质量高且品牌页可跳转） |
| 详细参数 | 1 | `catalogId` | String? | FK 关联完整（同上） |

"空"判定：String 类字段（engineBrand/engineType/engineEnergy/brandId/catalogId）→ `IS NOT NULL AND != ''`；Decimal/DateTime → 仅 `IS NOT NULL`。

排序链路与 filters 完全一致：加权分 DESC → `sortOrder` DESC → `createdAt` DESC。

#### 5. Catalogs 加权排序（扩展二新增）

Catalogs 共 2 个 nullable 计数字段，满分 8 分：

| 档位 | 权重 | 字段 | 类型 | B2C 动机 |
|---|---|---|---|---|
| 核心展示 | 5 | `code` | String? | 目录编码，SEO 友好 URL slug + 前端筛选 key（nullable but unique，运营常漏填） |
| 关键参数 | 3 | `description` | String? | 目录说明文案，帮助客户理解分类用途 |

均为 String? → `IS NOT NULL AND != ''`。排序链路同上。

#### 6. Raw SQL 实现一致性

所有三个模块使用**相同的实现模式**（各自私有方法，不抽 BaseService 通用方法）：
- `WEIGHTED_SORT_FIELDS` 常量表 → 编译 `WEIGHTED_SORT_SUM_SQL` 静态片段
- `findAllWithWeightedSort` 私有方法：`Prisma.sql` 参数化 where + `$queryRaw` ORDER BY 加权
- `count` 查询走 Prisma `<model>.count({ where })`（与排序无关）
- 返回结果 `plainToInstance(ResponseDto, ..., { excludeExtraneousValues: true })` 过滤字段

Where 条件与字段映射（按 Query DTO 核实）：

| 模块 | Where 条件 | Raw SQL 映射 |
|---|---|---|
| Filters | `keyword` (model/gencode ILIKE)、`typeName`、`status` | (`"model"` ILIKE OR `"gencode"` ILIKE) / `"typeName"` = / `"status"` = |
| Equipment | `keyword` (model/brandName ILIKE)、`brandId`、`catalogId`、`engineEnergy`、`status` | (`"model"` ILIKE OR `"brandName"` ILIKE) / `"brandId"` = / `"catalogId"` = / `"engineEnergy"` = / `"status"` = |
| Catalogs | `name` (contains)、`code`、`status` | `"name"` ILIKE / `"code"` = / `"status"` = |

字符串 ILIKE pattern 通过 `%${keyword}%` 构造并以 `${pattern}` 参数化传入。表名与列名：表 `filters` / `equipment` / `equipment_catalogs`，列 camelCase + 双引号（如 `"equipmentId"`、`"productionDateStart"`、`"catalogId"`）。

## User Stories

### 原滤清器模块（1-15 保留）

1. 作为 B2C 客户（匿名访客），我希望浏览滤清器列表时先看到信息齐全的产品（有 gencode/图片/图纸），这样我能快速判断产品价值并做出采购决策。
2. 作为 B2C 客户（匿名访客），我希望信息齐全度相似时按运营 `sortOrder` 排序，这样运营置顶的产品在同等信息密度下能优先展示。
3. 作为 B2C 客户（匿名访客），我希望信息齐全度和 `sortOrder` 都相同时按创建时间倒序，这样最近上架的产品能优先展示，避免翻页时遇到"老产品卡在前面"的视觉不一致。
4. 作为登录运营用户，我希望滤清器列表保持原有 `sortOrder` 排序，这样我能按运营权重管理产品顺序，不被加权排序干扰。
5. 作为登录运营用户，我希望仍能通过 `?sortBy=xxx` 自定义排序（如 `?sortBy=createdAt&sortOrder=desc` 查最近更新），这样我能按不同管理场景切换排序。
6. 作为 B2C 客户（匿名访客），我希望即使我尝试传 `?sortBy=xxx` 参数也不会改变加权排序，这样产品决策的排序体验在所有匿名访客间保持一致，不会被前端参数覆盖。
7. 作为前端开发者，我希望匿名访客和登录用户的列表接口保持同一个 URL，这样调用方代码简单，不需要根据用户身份切换接口。
8. 作为开发者，我希望排序逻辑通过 e2e 测试覆盖（含匿名加权场景与登录原排序场景），这样未来重构时不会无意识地破坏 B2C 浏览体验。
9. 作为开发者，我希望 `test/harness/mock-prisma.ts` 支持 mock `$queryRaw`，这样 e2e 测试能验证走 raw SQL 路径的代码分支。
10. 作为开发者，我希望 Raw SQL 实现使用 `Prisma.sql` 模板标签进行参数化，这样能防止 SQL 注入。
11. 作为 B2C 客户（匿名访客），我希望空字符串 `''` 也视为"未填写"，这样数据库脏数据（运营误填空字符串）不会错误地排到前面。
12. 作为开发者，我希望排序逻辑仅在各 Service 的 `findAll` 内部实现，不污染 `BaseService.paginateWithSort` 抽象。
13. 作为维护者，我希望加权权重表（5/3/1 三档）在代码中通过具名常量定义而非散落 SQL 字符串，这样未来调整权重时单点修改即可。
14. 作为维护者，我希望本次改动不修改 Prisma schema、不新增物化列、不做迁移，这样部署无需停机或回滚数据。
15. 作为 B2C 客户（匿名访客），我希望仅启用的记录（`status='enabled'`）参与加权排序，禁用记录不进入列表（沿用现有 `applyVisibility` 强制过滤）。

### 扩展一（VisibilityOpts 三分流 + 角色）

16. 作为开发者，我希望 `visibility` 类型清晰地区分"匿名/B2C/管理"三种上下文，不再出现"名义上存在但从未使用"的死值。
17. 作为未来 B2C 已登录客户，我希望我的列表排序仍沿用匿名时的加权排序（信息齐全优先），而不是突然切换到运营 sortOrder，这样浏览体验一致。
18. 作为后台 User 的普通用户角色（`'user'`，内部运营人员），我希望我登录后看到的列表按 `sortOrder` 排序并能自定义 `sortBy`，因为我正在做产品数据维护而非 B2C 采购浏览。
19. 作为维护者，我希望 `BaseService.applyVisibility` / `assertVisible` / 加权排序触发条件**共用同一段 B2C 判断逻辑**（`['anonymous', 'b2c'].includes(...)`），而不是各自独立判断，避免产生不一致。
20. 作为开发者，我希望 `undefined` 仍可作为 `visibility` 的合法值（等价 admin），这样现有 20+ 处控制器的 `user ? undefined : { visibility: 'anonymous' }` 无需返工。

### 扩展二（Equipment + Catalogs 加权排序）

21. 作为 B2C 客户（匿名访客），我希望浏览设备档案列表时优先看到引擎信息完整（有品牌、型号、功率、能源）和生产年份明确的设备，这样我能快速判断设备是否符合我的采购工况。
22. 作为 B2C 客户（匿名访客），我希望浏览目录列表时优先看到"有编码 + 有说明"的规范目录，而不是缺编码的半成品目录卡在前列影响 SEO 和理解。
23. 作为 B2C 客户（匿名访客），我希望 equipment/catalogs 的加权分相同时同样按 `sortOrder DESC` → `createdAt DESC` 兜底排序，与 filters 的行为保持一致，使得整个浏览链路排序直觉统一。
24. 作为登录运营用户，我希望 equipment/catalogs 列表在我登录后仍使用原 `paginateWithSort` 排序（`sortOrder` 默认 + `sortBy` 生效），这样我能正常维护产品数据，不被加权排序干扰。
25. 作为 B2C 客户（匿名访客），我希望在 equipment/catalogs 上即使传 `?sortBy=xxx` 参数也会被忽略、仍走加权排序，这样产品决策的排序体验不会因前端参数而被意外覆盖（与 filters 行为一致）。
26. 作为前端开发者，我希望 equipment/catalogs 接口的分页结构（`{ items, total, page, pageSize }`）、DTO 字段、响应包装、`status='enabled'` 过滤在引入加权排序后**完全保持不变**，仅 items 顺序改变，这样前端无需改动代码。
27. 作为开发者，我希望 Raw SQL 的 where 条件（equipment 的 keyword/brandId/catalogId/engineEnergy/status；catalogs 的 name/code/status）全部严格对应 DTO 中 service 原有的 Prisma where 构建，不遗漏也不错误翻译，保证匿名与登录态看到的**筛选结果集合一致**、仅顺序不同。

## Implementation Decisions

### 模块改动范围

| 模块 | 文件 | 改动性质 | 说明 |
|---|---|---|---|
| **核心** | `src/shared/services/base.service.ts` | 修改 | VisibilityOpts 类型 + `applyVisibility`/`assertVisible` 判断从 `=== 'anonymous'` 改为 `includes` |
| **核心** | `src/shared/services/base.service.spec.ts` | 修改 | 新增 `'b2c'` 与 `'anonymous'` 行为对齐的 2 个 unit case |
| **Filters** | `src/modules/equipment/filters/filters.service.ts` | 修改 | 同步触发条件改为 `includes`（逻辑行为不变，仅改条件写法） |
| **Equipment** | `src/modules/equipment/equipment/equipment.service.ts` | 修改 | 新增 `WEIGHTED_SORT_FIELDS`、`findAllWithWeightedSort`；`findAll` 加 B2C 分支 |
| **Catalogs** | `src/modules/equipment/catalogs/catalogs.service.ts` | 修改 | 同上（catalogs 版字段表 + where 条件） |
| **Controllers** | 所有设备 5 个 `.controller.ts` | 不变 | 传值 `user ? undefined : { visibility: 'anonymous' }` 无需修改；新语义自动兼容 |
| **Query DTOs** | QueryFilterDto / QueryEquipmentDto / QueryCatalogDto | 不变 | `sortBy` 在 B2C 被 service 忽略即可 |
| **Response DTOs** | 所有 response dto | 不变 | 字段、装饰器完全沿用；`plainToInstance` 仍按原 DTO 过滤 |
| **Prisma** | `prisma/schema.prisma` | 不变 | 不加物化列、不做迁移 |
| **测试** | `test/equipment-anonymous.e2e-spec.ts` | 修改 | 5.1 中把 equipment/catalogs 从 `findMany` 断言中移除；新增 5.7、5.8 子 describe |
| **测试** | `test/harness/mock-prisma.ts` | 不变 | `$queryRaw` mock 已存在，直接复用 |
| **文档** | `docs/specs/anonymous-filter-weighted-sort.md` | 修改 | 本文件（从 v1 升级到 v2） |
| **文档** | `docs/adr/0005-anonymous-visitor-access.md` | 修改 | 末尾追加一节"扩展：加权排序扩展与 VisibilityOpts 三分流" |
| **OpenSpec** | `openspec/changes/` | 不变 | 不创建 OpenSpec 工件 |

### VisibilityOpts 类型与判断统一

**Type 修改：**
```typescript
// 改前（死值 'authenticated' 从未传递）
type VisibilityOpts = { visibility?: 'anonymous' | 'authenticated' };

// 改后
type VisibilityOpts = { visibility?: 'anonymous' | 'b2c' | 'admin' };
```

**判断统一**（base.service + 3 service 共 5 处调用）：
```typescript
// 辅助变量（在 BaseService 内声明，避免魔法数组散落 5 处）
const B2C_VISIBILITIES = ['anonymous', 'b2c'] as const;

// applyVisibility
if (B2C_VISIBILITIES.includes(opts?.visibility)) {
  (where as any).status = 'enabled';
}

// assertVisible
if (B2C_VISIBILITIES.includes(opts?.visibility) && record?.status !== 'enabled') {
  throw new NotFoundException(...);
}

// 各 service 加权排序触发
if (B2C_VISIBILITIES.includes(opts?.visibility)) {
  return this.findAllWithWeightedSort(query, where);
}
```

`filters.service.ts` 的条件同步从 `=== 'anonymous'` 升级，保持全项目一致。

### Equipment Service — 字段表与 SQL Where

```typescript
const WEIGHTED_SORT_FIELDS: ReadonlyArray<{ field: string; weight: number; isString: boolean }> = [
  { field: 'engineBrand',         weight: 5, isString: true },
  { field: 'engineType',          weight: 5, isString: true },
  { field: 'power',               weight: 3, isString: false },   // Decimal?
  { field: 'engineEnergy',        weight: 3, isString: true },
  { field: 'productionDateStart', weight: 3, isString: false },   // DateTime?
  { field: 'productionDateEnd',   weight: 3, isString: false },   // DateTime?
  { field: 'brandId',             weight: 1, isString: true },
  { field: 'catalogId',           weight: 1, isString: true },
];
```

SQL Where（按 `QueryEquipmentDto` 核实）：
```typescript
const conditions: Prisma.Sql[] = [Prisma.sql`"deletedAt" IS NULL`];
if (where.status) conditions.push(Prisma.sql`"status" = ${where.status}`);
if (where.brandId) conditions.push(Prisma.sql`"brandId" = ${where.brandId}`);
if (where.catalogId) conditions.push(Prisma.sql`"catalogId" = ${where.catalogId}`);
if (where.engineEnergy) conditions.push(Prisma.sql`"engineEnergy" = ${where.engineEnergy}`);
if (query.keyword) {
  const pattern = `%${query.keyword}%`;
  conditions.push(Prisma.sql`("model" ILIKE ${pattern} OR "brandName" ILIKE ${pattern})`);
}
```
表名 `equipment`（schema 中 `@@map("equipment")`）。

### Catalogs Service — 字段表与 SQL Where

```typescript
const WEIGHTED_SORT_FIELDS: ReadonlyArray<{ field: string; weight: number; isString: boolean }> = [
  { field: 'code',        weight: 5, isString: true },
  { field: 'description', weight: 3, isString: true },
];
```

SQL Where（按 `QueryCatalogDto` + `buildWhere({ contains: {name}, equals: {code,status} })` 核实）：
```typescript
const conditions: Prisma.Sql[] = [Prisma.sql`"deletedAt" IS NULL`];
if (where.status) conditions.push(Prisma.sql`"status" = ${where.status}`);
if (query.code) conditions.push(Prisma.sql`"code" = ${query.code}`);
if (query.name) {
  const pattern = `%${query.name}%`;
  conditions.push(Prisma.sql`"name" ILIKE ${pattern}`);
}
```
表名 `equipment_catalogs`（schema 中 `@@map("equipment_catalogs")`）。

### SQL ORDER BY 模板（三个模块完全同结构）

```sql
ORDER BY (
  ${Prisma.raw(WEIGHTED_SORT_SUM_SQL)}    -- 一级：加权分 DESC
) DESC,
"sortOrder" DESC,                        -- 二级：运营权重
"createdAt" DESC                         -- 三级：创建时间倒序稳定翻页
LIMIT ${take} OFFSET ${skip}
```
`WEIGHTED_SORT_SUM_SQL` 由字段表生成，格式与 filters 完全相同（`CASE WHEN ... THEN weight ELSE 0 END` 相加）。

### count 查询与分页一致性

- count 查询：`this.prisma.<model>.count({ where })`，where 与 raw SQL 完全一致（applyVisibility 后共享同一个 where 对象）。
- 分页结构：`{ items, total, page: query.page, pageSize: query.pageSize }`，与 `paginateWithSort` 返回结构逐字段对齐。
- items 必经 `plainToInstance(ResponseDto, rows, { excludeExtraneousValues: true })`，禁止泄露 schema 自增 `id` 字段。

### 性能考量

- **filters**：数千行级，13 个 CASE WHEN → 可接受
- **equipment**：数千行级，8 个 CASE WHEN → 可接受
- **catalogs**：数十到数百行（字典），2 个 CASE WHEN → 可忽略
- 所有 count 查询走 Prisma 不参与排序，复用现有索引
- 不加物化列（避免写入路径变更、迁移）；万级数据时再评估

## Testing Decisions

### 测试设计原则

- **HTTP seam（最高层）为 e2e 主缝**：通过 supertest 打 `GET /equipment/<endpoint>` 端点，断言响应 `items` 顺序/DTO 结构/分页。不断言 SQL 内部字符串。
- **Unit seam（辅）**：`base.service.spec.ts` 针对 `'b2c'` 值补 unit 用例（visibility 属于底层逻辑、适合白盒覆盖）。
- **Mock 数据驱动顺序**：按加权分准备不同组合的 mock 数据，`$queryRaw` 直接返回预排序数组，不解析 SQL。
- **同一 where 断言**：在"匿名分支"中额外断言 `count` 收到的 where 含 `status='enabled'`（证明 applyVisibility 生效）。

### 5.1 it.each 改造（与 filters 相同模式）

原 5.1 `Anonymous GET list endpoints` 的 `it.each` 共享 case 为：
`brands / catalogs / filter-types / filters(已移除) / equipment`

**本次需进一步移除 equipment 和 catalogs** 两个 case（它们的匿名路径现在也走 `$queryRaw`），迁入 5.7、5.8 各自的子 describe。5.1 中仅剩 `brands / filter-types` 仍走 `findMany`。

### 5.7 Equipment 匿名加权排序（3 个中度用例）

在 `test/equipment-anonymous.e2e-spec.ts` 新增子 describe：

1. **匿名加权顺序断言**：mock `$queryRaw` 返回 3 条 equipment 记录（分值由高到低：A=engineBrand+engineType=10，B=power+productionDates=9，C=全空=0），并在 mock 前显式覆盖 base factory 的 NOT NULL 字段为 null（避免继承分值错误）。断言 `items[0/1/2].equipmentId` 顺序匹配 A→B→C，且所有 `status='enabled'`。
2. **匿名 sortBy 忽略**：请求加 `?sortBy=model&sortOrder=desc`，断言顺序仍为 mock 返回顺序。侧断言：`equipment.$queryRaw` 被调用，`equipment.findMany` 未被调用。
3. **DTO 过滤 + 分页结构**：请求 `?page=1&pageSize=3`，断言响应 `data.items` 数组里不含 `id`（Prisma 自增字段被 `excludeExtraneousValues` 剔除），且分页字段 `total/page/pageSize` 与请求一致（`total` 由 mock `count` 返回值驱动）。

### 5.8 Catalogs 匿名加权排序（3 个中度用例）

1. **匿名加权顺序断言**：mock `$queryRaw` 返回 3 条 catalog 记录（A：code+description=8；B：仅 code=5；C：全空=0）。断言顺序 A→B→C，所有 `status='enabled'`。
2. **匿名 sortBy 忽略**：请求加 `?sortBy=name&sortOrder=asc`，断言顺序仍为 mock 返回顺序。侧断言：`equipmentCatalog.$queryRaw` 被调用，`equipmentCatalog.findMany` 未被调用。
3. **DTO 过滤 + 分页结构**：请求 `?page=1&pageSize=3`，断言响应 items 不含 `id`、分页字段（total/page/pageSize）一致。

### BaseService Unit Test 补充

在 `src/shared/services/base.service.spec.ts` 现有 `applyVisibility`/`assertVisible` 用例旁追加：
1. `applyVisibility 传入 visibility='b2c' 时强制 status='enabled'`（与 `'anonymous'` 对齐）。
2. `assertVisible 传入 visibility='b2c' 时对 status='disabled' 抛出 NotFound`（与 `'anonymous'` 对齐）。

### 测试文件中的辅助函数

复用现有 `getRawMocks(prisma)` helper（扩展出 equipment 和 catalog 的 prisma 子对象访问：`harness.prisma.equipment.$queryRaw`、`harness.prisma.equipmentCatalog.$queryRaw`），各子 describe 的 `beforeEach` 中分别 `mockClear()` 以防跨用例污染。

## Out of Scope

> 注：原 Out of Scope 中已纳入扩展范围的条目以 ~~删除线~~ 标记并加注说明。

- **不改 Prisma schema**：不新增物化列、不加索引、不做迁移。
- **不改 Controllers**：`@Public()` + `AccessGuard` + 路由完全不变，`findAll` 调用签名与控制器传值不变。
- **不改 Query DTOs**：三个模块的 Query DTO 字段与装饰器不变；`sortBy` 在 B2C 分支被 service 忽略即可。
- **不改 Response DTOs**：字段与 `@Expose/@Exclude/@Type` 装饰器完全不变。
- **不改权限码**：不涉及 equipment 模块任何权限常量。
- **不影响所有 `findOne` 接口**：仅修改 `findAll` 列表排序；`applyVisibility` 行为在 B2C 下对 findOne 也生效但条件判断写法升级不改变行为。
- ~~不影响其他 equipment 子模块~~ → **equipment/catalogs 现在已在范围内**；brands/filter-types 因分歧度太低（各 1 个 nullable 字段）仍跳过。
- ~~不影响 BaseService 抽象~~ → **BaseService VisibilityOpts 类型 + 判断条件现在已在范围内**；但 `paginateWithSort`/`paginate` 的签名与实现保持不变。
- **不引入 OpenSpec 流程工件**：不创建 `openspec/changes/` 新目录（变更由本 spec + ADR 追加覆盖）。
- ~~不加 ADR~~ → **ADR-0005 末尾追加一节**（VisibilityOpts 三分流 + 扩展加权排序）。
- **不做物化列优化**：当前数据量下可接受；万级数据时再评估。
- **不实现权重可配置化**：5/3/1 通过代码常量定义，不暴露为 `system_configs` 项。
- **brands / filter-types 不做加权**：字段分歧不足以 justify raw SQL 复杂度。
- **不实现 B2C Customer 登录**：仅预留 `'b2c'` 值，Customer auth 模块在未来独立迭代。
- **不新增/修改任何路由 URL**：所有匿名 GET endpoint URL 与请求/响应结构保持不变。
- **不改动品牌/目录/类型的查询 where 逻辑语义**：where 条件集合不变，仅匿名路径下的**排序**实现方式从 ORM 改为 raw SQL。

## Further Notes

### 决策来源（grilling 三轮 15 题）

本 spec 由 2026-08-28 的三轮 grilling 综合 15 个决策点 + 原 v1 决策形成：

**Round 1**
- **Q1=C** VisibilityOpts 三分流（`'anonymous' | 'b2c' | 'admin'`），`undefined` 等价 admin
- **Q2=推荐** 后台 `'user'` 角色走管理视角（sortOrder），与 B2C 域严格分离
- **Q3=B** 加权排序扩展到 equipment（高价值）+ catalogs（中价值）；brands/filter-types 跳过
- **Q4=A** 由我提出各模块默认权重表（下一轮再细化）
- **Q5=A** 沿用 per-module 私有方法 + raw SQL 模式，不抽通用方法
- **Q6=B** 中度 e2e：equipment 3、catalogs 3，跳过 tiebreaker 重复验证

**Round 2**
- **Q7=推荐** `undefined ≡ 'admin'` + 删除死值 `'authenticated'` + 统一 `includes` 判断
- **Q8=推荐** Equipment 权重：engineBrand/engineType(5) + power/engineEnergy/productionStart/End(3) + brandId/catalogId(1)
- **Q9=推荐** Catalogs 权重：code(5) + description(3)
- **Q10=推荐** 未来 Customer auth 接入点：控制器按身份传 `'b2c'`
- **Q11=推荐** 3 个 service + BaseService 5 处判断统一 `B2C_VISIBILITIES.includes(...)`
- **Q12=推荐** raw SQL where 按模块的 Query DTO 与现有 service where 一一对应翻译

**Round 3**
- **Q13=A** 在本 spec 文件内扩展（追加修订 + 修正过时条目）
- **Q14=推荐** TDD 顺序：BaseService 类型/条件与 unit 先改 → Equipment 红绿 → Catalogs 红绿 → 同步 Filters 条件 → 文档 → 全量测试
- **Q15=A** 追加 ADR-0005 末尾一节，不拆新 ADR

### 原 v1 决策（保留）

详见 v1 Further Notes（Q1=C 非空加权、Q2=A 稳定排序、Q8=A Raw SQL、Q9=B 三档权重等）。

### 相关文档

- [docs/adr/0005-anonymous-visitor-access.md](file:///c:/Project/gvray/docs/adr/0005-anonymous-visitor-access.md)：匿名访客访问机制 + 本次在末尾追加"加权排序扩展与 VisibilityOpts 三分流"章节
- [docs/adr/0004-import-equipment-filter-data.md](file:///c:/Project/gvray/docs/adr/0004-import-equipment-filter-data.md)：迁移 SQL 验证的列名 camelCase 双引号约定
- [AGENTS.md](file:///c:/Project/gvray/AGENTS.md)：Controller 只处理路由/鉴权/DTO、业务逻辑放 Service、禁止返回未过滤 Prisma 对象、禁止泄露自增 `id` 等硬规则

### 后续演进

- 万级以上数据量 → 物化列 `nonEmptyWeightedScore Int` 并加索引
- 运营希望按品类调权重 → 权重表改为 `system_configs` 配置项
- 加权策略不合理反馈 → 改为字段优先级或二元计数（接口契约不变）
- B2C Customer auth 实现 → 控制器加 Customer 守卫分支，传 `visibility='b2c'`（service 侧判断已预留，零改动）
- brands/filter-types 若未来增加丰富字段（如 logoUuid、图片）→ 补加权排序，复用同模式
