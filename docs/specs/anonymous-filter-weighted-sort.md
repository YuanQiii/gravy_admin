# 匿名访客滤清器列表加权排序

## Problem Statement

作为 B2C 客户（匿名访客）浏览滤清器列表时，当前接口 `GET /equipment/filters` 按运营 `sortOrder` 字段降序返回，导致信息不全的产品（无产品编码、无图片、无图纸、无尺寸参数）可能因为 `sortOrder` 较高而排在前面。客户在浏览前几页时看不到完整产品信息，影响转化决策。

运营手动维护 `sortOrder` 的成本高且不稳定，无法保证每次录入时都设置合理权重。需要一个自动化的排序机制，让"信息齐全的产品"在 B2C 浏览场景下自然优先展示，无需运营额外干预。

## Solution

在 `FiltersService.findAll` 内部，根据 `opts.visibility` 分支排序逻辑：

- **匿名访客**（`visibility === 'anonymous'`）：按"非空字段加权计数"降序作为一级排序，`sortOrder` 降序作为二级，`createdAt` 降序作为第三级稳定排序。匿名访客传入的 `?sortBy` 参数被忽略，以保证产品决策的排序体验一致性。
- **登录用户**（`opts.visibility !== 'anonymous'`）：保持现有 `paginateWithSort` 行为，按 `?sortBy` 自定义或默认 `sortOrder` 降序。

加权计数采用三档权重：

- **核心展示型字段**（`gencode`、`photoUuid`、`drawingUuid`）每个非空 +5
- **关键参数型字段**（`weight`、`volume`）每个非空 +3
- **详细参数型字段**（`dimensionD1`、`dimensionD2`、`dimensionD3`、`dimensionD7`、`dimensionH1`、`dimensionH2`、`dimensionH3`、`dimensionD8`）每个非空 +1

"空"的定义：数据库 `NULL` 或空字符串 `''` 均视为"空"。字符串字段需 `IS NOT NULL AND != ''`，数值字段需 `IS NOT NULL`。

实现采用 Raw SQL via `Prisma.$queryRaw`（项目中首例 raw SQL 用法），表名 `filters`、列名为 camelCase（如 `"photoUuid"`、`"dimensionD1"`，需带双引号）。`where` 条件全部参数化以防止 SQL 注入。`count` 查询继续走 Prisma `filter.count()`（不带 orderBy，与排序无关）。

## User Stories

1. 作为 B2C 客户（匿名访客），我希望浏览滤清器列表时先看到信息齐全的产品（有 gencode/图片/图纸），这样我能快速判断产品价值并做出采购决策。
2. 作为 B2C 客户（匿名访客），我希望信息齐全度相似时按运营 `sortOrder` 排序，这样运营置顶的产品在同等信息密度下能优先展示。
3. 作为 B2C 客户（匿名访客），我希望信息齐全度和 `sortOrder` 都相同时按创建时间倒序，这样最近上架的产品能优先展示，避免翻页时遇到"老产品卡在前面"的视觉不一致。
4. 作为登录运营用户，我希望滤清器列表保持原有 `sortOrder` 排序，这样我能按运营权重管理产品顺序，不被加权排序干扰。
5. 作为登录运营用户，我希望仍能通过 `?sortBy=xxx` 自定义排序（如 `?sortBy=createdAt&sortOrder=desc` 查最近更新），这样我能按不同管理场景切换排序。
6. 作为 B2C 客户（匿名访客），我希望即使我尝试传 `?sortBy=xxx` 参数也不会改变加权排序，这样产品决策的排序体验在所有匿名访客间保持一致，不会被前端参数覆盖。
7. 作为前端开发者，我希望匿名访客和登录用户的列表接口保持同一个 URL `GET /equipment/filters`，这样调用方代码简单，不需要根据用户身份切换接口。
8. 作为开发者，我希望排序逻辑通过 e2e 测试覆盖（含匿名加权场景与登录原排序场景），这样未来重构时不会无意识地破坏 B2C 浏览体验。
9. 作为开发者，我希望 `test/harness/mock-prisma.ts` 支持 mock `$queryRaw`，这样 e2e 测试能验证走 raw SQL 路径的代码分支。
10. 作为开发者，我希望 Raw SQL 实现使用 `Prisma.sql` 模板标签进行参数化，这样能防止 SQL 注入（`keyword`、`typeName`、`status` 等用户可控输入）。
11. 作为 B2C 客户（匿名访客），我希望空字符串 `''` 也视为"未填写"，这样数据库脏数据（运营误填空字符串）不会错误地排到前面。
12. 作为开发者，我希望排序逻辑仅在 `FiltersService.findAll` 内部实现，不污染 `BaseService.paginateWithSort` 抽象，这样 `BaseService` 保持通用性、其他模块不受影响。
13. 作为维护者，我希望加权权重表（5/3/1 三档）在代码中通过具名常量定义而非散落 SQL 字符串，这样未来调整权重时单点修改即可。
14. 作为维护者，我希望本次改动不修改 Prisma schema、不新增物化列、不做迁移，这样部署无需停机或回滚数据。
15. 作为 B2C 客户（匿名访客），我希望仅启用的滤清器（`status='enabled'`）参与加权排序，禁用记录不进入列表（沿用现有 `applyVisibility` 强制 `status='enabled'` 过滤）。

## Implementation Decisions

### 模块改动范围

- **`src/modules/equipment/filters/filters.service.ts`**：修改 `findAll` 方法，在 `opts?.visibility === 'anonymous'` 分支下走 raw SQL 加权排序路径；其他分支保持现有 `paginateWithSort` 调用。
- **`src/modules/equipment/filters/dto/query-filter.dto.ts`**：不变。匿名访客传 `sortBy` 时由 service 层忽略，DTO 层不做额外校验。
- **`src/modules/equipment/filters/filters.controller.ts`**：不变。`findAll` 调用 `findAll(query, user ? undefined : { visibility: 'anonymous' })` 保持原样。
- **`src/shared/services/base.service.ts`**：不变。不污染 `paginateWithSort` / `paginate` 抽象。
- **`prisma/schema.prisma`**：不变。不加物化列、不做迁移。

### Raw SQL 实现风格

- 使用 `Prisma.sql` 模板标签拼接 SQL，配合 `this.prisma.$queryRaw<T>` 返回类型化结果。
- `where` 条件参数化：`keyword`、`typeName`、`status` 通过 `Prisma.sql` 的 `${param}` 插值传入（自动参数化）。
- `LIMIT` / `OFFSET` 通过 `${pageSize}` / `${skip}` 参数化。
- `count` 查询继续走 `this.prisma.filter.count({ where })`（不参与排序）。
- 列名使用双引号包裹 camelCase：`"filterId"`、`"gencode"`、`"photoUuid"`、`"dimensionD1"` 等（已在迁移 SQL `prisma/scripts/migrate_af_eqm_to_gvray.sql` 验证）。

### 加权权重表

代码中定义模块级常量：

```ts
const NONEMPTY_FIELD_WEIGHTS = {
  core: 5,    // gencode, photoUuid, drawingUuid
  key: 3,     // weight, volume
  detail: 1,  // dimensionD1/D2/D3/D7/H1/H2/H3/D8
} as const;
```

SQL 中通过 `CASE WHEN ... THEN <weight> ELSE 0 END` 求和作为一级 `ORDER BY`：

```sql
ORDER BY (
  (CASE WHEN "gencode" IS NOT NULL AND "gencode" != '' THEN 5 ELSE 0 END) +
  (CASE WHEN "photoUuid" IS NOT NULL AND "photoUuid" != '' THEN 5 ELSE 0 END) +
  (CASE WHEN "drawingUuid" IS NOT NULL AND "drawingUuid" != '' THEN 5 ELSE 0 END) +
  (CASE WHEN "weight" IS NOT NULL THEN 3 ELSE 0 END) +
  (CASE WHEN "volume" IS NOT NULL THEN 3 ELSE 0 END) +
  (CASE WHEN "dimensionD1" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "dimensionD2" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "dimensionD3" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "dimensionD7" IS NOT NULL AND "dimensionD7" != '' THEN 1 ELSE 0 END) +
  (CASE WHEN "dimensionH1" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "dimensionH2" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "dimensionH3" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "dimensionD8" IS NOT NULL AND "dimensionD8" != '' THEN 1 ELSE 0 END)
) DESC,
"sortOrder" DESC,
"createdAt" DESC
LIMIT ${pageSize} OFFSET ${skip}
```

注：`dimensionD7` 与 `dimensionD8` 在 schema 中为 `String?`，需要 `!= ''` 判定；其他 dimension 字段为 `Decimal?`，仅 `IS NOT NULL` 即可。`gencode`、`photoUuid`、`drawingUuid` 同为 `String?`。

### Service 分支逻辑

```ts
async findAll(query, opts?) {
  // where 构建保持原样
  this.applyVisibility(where, opts);

  if (opts?.visibility === 'anonymous') {
    // 走 raw SQL 加权排序，忽略 query.sortBy
    return this.findAllWithWeightedSort(query, where);
  }

  // 登录用户走原 paginateWithSort（含 sortBy 自定义）
  const result = await this.paginateWithSort(
    this.prisma.filter, query, where, undefined, 'sortOrder',
  );
  return {
    ...result,
    items: plainToInstance(FilterResponseDto, result.items, {
      excludeExtraneousValues: true,
    }),
  };
}
```

`findAllWithWeightedSort` 私有方法负责构造 `Prisma.sql` 并执行 `$queryRaw`，返回结构与 `paginateWithSort` 一致（`{ items, total, page, pageSize }`），仍经 `plainToInstance(FilterResponseDto, ...)` 包装。

### 性能考量

- filter 表数据量预期数千行级别，每行 13 个 `CASE WHEN` 计算成本可接受。
- `count` 查询走 Prisma `filter.count()`，与排序无关，复用现有索引。
- 不引入物化列，避免写入路径变更。
- 若未来数据量增长至万级以上，可考虑加物化列 `nonEmptyWeightedScore Int @default(0)`，由触发器或 service 层维护。

## Testing Decisions

### 单一切入点（Seam）

**扩展** **[test/equipment-anonymous.e2e-spec.ts](file:///c:/Project/gvray/test/equipment-anonymous.e2e-spec.ts)** 作为唯一切入点。不新增 `filters.service.spec.ts` 单元测试文件——遵循"测试外部行为而非实现细节"原则，service 内部分支由 e2e 间接覆盖。

### 测试设计原则

- 只断言外部可观察行为（HTTP 响应的 `items` 顺序与字段值），不断言 SQL 字符串内容。
- 用准备好的 mock 数据集（不同的非空字段组合）驱动 mock `$queryRaw` 返回预排序结果，验证 controller 通过 service 把数据原样透出。
- 同时覆盖匿名加权场景与登录原排序场景，确保两条分支都被验证。

### mock-prisma 扩展

**修改** **[test/harness/mock-prisma.ts](file:///c:/Project/gvray/test/harness/mock-prisma.ts)**，添加 `$queryRaw` mock：

- 接受 `Prisma.Sql` 参数或字符串模板。
- 返回调用方预设的行数组（按测试场景预排序）。
- 不实际解析 SQL 内容——这是 mock 的职责边界，断言顺序由测试数据驱动。

### 新增 e2e 用例

在 `test/equipment-anonymous.e2e-spec.ts` 内新增 5 个用例（`5.6 Anonymous filter weighted sort` 子描述块）：

1. **匿名加权排序 + 状态断言用例**：mock `$queryRaw` 返回 3 条记录——记录 A 有 gencode+photo+drawing（分值 15）、记录 B 只有 weight+volume（分值 6，base factory 的 `gencode='GEN001'` 显式覆盖为 `null` 以使分值准确为 6）、记录 C 全空（分值 0，同样覆盖 `gencode`）。断言响应 `items` 顺序为 A→B→C，且每条 `status === 'enabled'`。

2. **匿名 sortBy 忽略用例**：附加 `?sortBy=model&sortOrder=desc` 请求参数，断言响应顺序仍为 A→B→C（加权排序未被覆盖）。同时断言 `$queryRaw` 被调用、`findMany` 未被调用。

3. **count 状态过滤用例**：断言 `prisma.filter.count` 收到的 `where` 含 `status: 'enabled'`，验证 `applyVisibility` 在匿名分支下仍生效（不仅作用于 raw SQL 路径，count 查询共享同一 where）。

4. **登录原排序用例**：用登录态 token 请求 `GET /equipment/filters`，mock `prisma.filter.findMany` 返回单条记录，断言响应长度与 `filterId` 一致；同时断言 `findMany` 被调用、`$queryRaw` 未被调用（验证分支切换）。

5. **加权分相同 + sortOrder 相同用例（createdAt 兜底）**：mock 两条记录分值相同（均无展示/参数字段，仅 gencode 显式置 null）且 `sortOrder` 相同、`createdAt` 不同，让 mock 模拟 DB 按 `createdAt DESC` 预排序返回（新记录在前）。断言响应顺序与新→旧一致——验证第三级排序的接线路径。

### 现有测试兼容性

- 现有 [test/equipment-anonymous.e2e-spec.ts](file:///c:/Project/gvray/test/equipment-anonymous.e2e-spec.ts) 的 5.1 Anonymous GET list endpoints 子描述块原本以 `it.each` 共享 5 个 case（brands/catalogs/filter-types/filters/equipment）并统一断言 `findMany` 被调用。本次改动将 `filters` case 从 5.1 移除（匿名路径不再走 `findMany`），迁入新的 5.6 子描述块单独覆盖。其余 4 个 case（brands/catalogs/filter-types/equipment）不变。
- 5.1 的共享 `findMany was called` 断言对 filters case 不再成立（匿名路径改走 `$queryRaw`），故移除；登录态 filters 排序由 5.6 用例 4 覆盖。
- 5.2 / 5.3 / 5.4 / 5.5 子描述块不受影响（`findOne` 路径未改、POST 鉴权未改、brands disabled 路径未改、限流配置未改）。
- 现有 32 个 unit test 不涉及 `findAll` 排序断言，无需调整。

## Out of Scope

- **不改 Prisma schema**：不新增物化列、不加索引、不做迁移。
- **不改 controller**：`@Public()` + `AccessGuard` + 路由不变，`findAll` 调用签名不变。
- **不改 QueryFilterDto**：`sortBy` / `sortOrder` 字段保留，匿名访客传值由 service 忽略。
- **不改 FilterResponseDto**：响应字段不变。
- **不改权限码**：不涉及 `EQUIPMENT_FILTER_PERMISSIONS`。
- **不影响** **`findOne`** **接口**：仅修改 `findAll` 列表排序。
- **不影响其他 equipment 子模块**：brands / catalogs / filter-types / equipment 保持现状。
- **不影响** **`BaseService`** **抽象**：不修改 `paginateWithSort` / `paginate` 签名。
- **不引入 OpenSpec 流程**：本次改动范围小、不涉及接口契约/权限/schema 变更，不创建 `openspec/changes/` 工件。
- **不加 ADR**：决策痕迹由本 spec 文档保留，不单独建 ADR-0006。
- **不做物化列优化**：当前数据量下 raw SQL 性能可接受，物化列留待未来万级数据时考虑。
- **不实现权重可配置化**：权重表 5/3/1 通过代码常量定义，不暴露为配置项。

## Further Notes

### 决策来源

本 spec 由 grilling 流程综合 13 个决策点形成：

- **Q1=C** 非空字段加权计数（而非二元分类、字段顺序优先级、单字段 NULLS LAST）
- **Q2=A** 前置叠加稳定排序（保留 `sortOrder` 二级）
- **Q3→Q10=A** 作用范围由"全部生效"修正为"仅匿名访客生效"，与 B2C 动机对齐
- **Q4=B** `null` 与 `''` 均视为"空"
- **Q5** 动机：B2C 转化优先展示信息齐全产品
- **Q6=B** 字段差异化加权（而非平等计数）
- **Q7=B + Q12=B** 登录用户 `sortBy` 覆盖非空加权；匿名访客 `sortBy` 被忽略
- **Q8=A** Raw SQL via `Prisma.$queryRaw`（而非 Prisma `orderByRaw`、物化列、内存计算）
- **Q9=B** 三档权重：核心展示 +5 / 关键参数 +3 / 详细参数 +1
- **Q11=B** 不走 OpenSpec 流程
- **Q13=A** `createdAt DESC` 作为第三级稳定排序

### 相关文档

- [docs/adr/0005-anonymous-visitor-access.md](file:///c:/Project/gvray/docs/adr/0005-anonymous-visitor-access.md)：匿名访客访问机制（`@Public()` + `AccessGuard` + `applyVisibility`），是本次改动所依赖的可见性分支基础。
- [docs/adr/0004-import-equipment-filter-data.md](file:///c:/Project/gvray/docs/adr/0004-import-equipment-filter-data.md)：滤清器数据导入决策，本次改动的 SQL 列名约定（camelCase 带双引号）由迁移脚本 `prisma/scripts/migrate_af_eqm_to_gvray.sql` 验证。
- [AGENTS.md](file:///c:/Project/gvray/AGENTS.md)：项目硬规则——"业务逻辑放 Service"、"返回业务数据由 `ResponseInterceptor` 自动包装"、"查询用户等敏感对象优先用 `select` 排除敏感字段"，本次改动均遵循。

### 后续可能的演进

- 若数据量增长至万级以上：考虑物化列 `nonEmptyWeightedScore Int @default(0)`，由 `create` / `update` 路径维护，并加索引。
- 若运营希望按品类调整权重：将权重表移至 `system_configs` 配置项，service 启动时加载。
- 若 B2C 反馈加权策略不合理：可调整为"字段顺序优先级"（Round 1 的 Q1=B 方案）或"二元分类"（Q1=A 方案），仅需改 service 内部分支，接口契约不变。

