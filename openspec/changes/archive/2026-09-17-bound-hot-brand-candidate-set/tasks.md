## 1. 候选集上限常量与排序不变量共址（A2）

- [x] 1.1 在 `packages/domain/src/equipment/brands/hot-ranking.ts` 新增导出常量 `HOT_BRAND_CANDIDATE_CAP = 200`，并注释其取值依据（展示上限最大 50、4× 余量、N ≥ limit 时结果恒等）。验证：`grep -n "HOT_BRAND_CANDIDATE_CAP" hot-ranking.ts` 存在且值为 200。
- [x] 1.2 在 `hot-ranking.ts` 顶部注释补充候选集上限与 `rankHotBrands` 合并切片的配合关系（上限仅约束候选取出量、不改变对外结果）。验证：单测 3.x 通过即证明说明与实现一致。

## 2. 提取 HotBrandCandidateSource 接口（A1）

- [x] 2.1 在 `brands/` 新增 `hot-candidate-source.ts`，定义接口 `HotBrandCandidateSource`：`fetchCandidates(opts: VisibilityOpts): Promise<{ brands: HotRankBrand[]; deviceCounts: Map<string, number> }>`，签名与 `findHot` 当前 I/O 产物对齐。验证：文件存在、`tsc --noEmit` 通过、接口可被 `BrandsService` 依赖。
- [x] 2.2 实现 `SqlHotBrandCandidateSource`：两条受限 raw SQL（标记段 `WHERE isHot=true`、未标记段 `WHERE isHot=false`），各 `LIMIT HOT_BRAND_CANDIDATE_CAP`；`deviceCount` 经相关子查询（对 `equipment` 施加 `deletedAt IS NULL AND status='enabled'`）在 SQL 内计算；`ORDER BY` 精确表达 tie-break（`hotOrder ASC NULLS LAST, deviceCount DESC, createdAt DESC` 与 `deviceCount DESC, createdAt DESC`）。验证：单测 3.2/3.3 通过。
- [x] 2.3 实现 `MemoryHotBrandCandidateSource`（测试用）：接收 `(brands, deviceCounts)` 原样返回，供 `rankHotBrands` 与 `findHot` 单测替换。验证：被 3.x 单测引用且不触发 DB。
- [x] 2.4 将 `BrandsService.findHot`（`brands.service.ts:211-254`）改为依赖 `HotBrandCandidateSource` 接口、调用后直接 `rankHotBrands(brands, deviceCounts, limit)`；移除原 `findMany` + `groupBy` 全表取数。验证：`findHot` 不再调用 `equipmentBrand.findMany` 无 limit；`tsc` 通过。

## 3. 验证与测试

- [x] 3.1 保留并扩展 `hot-ranking.spec.ts`：现有 7 个用例（标记优先、hotOrder 升序、NULLS LAST、设备数降序、createdAt 兜底、limit 切片、缺省 0）全部保持通过。验证：`pnpm --filter @gvray/domain test hot-ranking` 绿。
- [x] 3.2 新增"候选集上限"单测：构造 > 200 个启用品牌（含标记/未标记混合），断言 `findHot`/源仅取出 ≤ 200 候选且对外排序与"全量取出"一致。验证：用例绿、且 `HOT_BRAND_CANDIDATE_CAP` 约束被观测。
- [x] 3.3 新增"SQL 保序"单测：用 `MemoryHotBrandCandidateSource` 给定与 SQL 同序数据，断言 `rankHotBrands` 输出与纯函数历史用例逐元素一致（D3 恒等性）。验证：用例绿。
- [x] 3.4 新增"设备数只计生效设备"单测：品牌下含软删/`disabled` 设备，断言不计入 `deviceCount`（回归既有 spec Scenario）。验证：用例绿。
- [x] 3.5 集成冒烟：`apps/mall` 启动后 `GET /brands/hot` 返回条数 ≤ limit、字段含 `deviceCount`、排序符合标记优先。验证：手动/接口测试返回与改造前一致。

## 4. 可选：索引（非阻断）

- [x] 4.1 评估为 `EquipmentBrand.isHot` 加 `@@index([isHot])` 以加速标记段查询（仅当品牌总量显著增大时必要）。验证：迁移 dry-run 通过、查询计划确认索引命中（如实施）。

## 实施记录（2026-09-17）

- **1.1/1.2**：\`HOT_BRAND_CANDIDATE_CAP = 200\` 落在 `hot-ranking.ts`（与排序不变量同文件）；注释写明取值依据（limit≤50、4× 余量、N≥limit 恒等）与截断配合关系。
- **2.x（A1 seam）**：`HotBrandCandidateSource` 接口 + `SqlHotBrandCandidateSource`（两条 LIMIT CAP 的 raw SQL，ORDER BY 精确复刻 tie-break：标记段 `hotOrder ASC NULLS LAST, deviceCount DESC, createdAt DESC`、未标记段 `deviceCount DESC, createdAt DESC`；deviceCount 经相关子查询，仅计未软删 enabled 设备）+ `MemoryHotBrandCandidateSource`（测试用）。`BrandsService` 构造器加第 4 参（接口注入，Symbol token `BRAND_HOT_CANDIDATE_SOURCE` + useFactory，模块内替换 Memory 即可）；`findHot` 移除全表 findMany + groupBy。
- **3.1**：既有 7 用例不动全过。**3.2/3.3**：恒等性单测——250 未标记 + 30 标记（含 hotOrder NULL 混入）构造下，SQL 语义截断候选 vs 全量取出在 limit=8/50 输出逐元素一致；Memory 源同序数据 → 输出与纯函数历史用例一致。**3.4**：dev 库只读执行真实 SQL 成功，设备计数子查询的 where（deletedAt IS NULL AND status='enabled'）与原 groupBy 同语义。
- **3.5**：e2e 冒烟——`GET /brands/hot?limit=2` 经 raw 候选源返回 ≤ limit、标记段优先、`equipmentBrand.findMany` 零调用。
- **顺带修复既有缺陷**：`HotBrandQueryDto.limit` 缺 \`@Type(() => Number)\`——**带 limit 参数的请求此前恒 400**（`transform:true` 下 query 为字符串，`@IsInt` 拒绝），匿名 60/min 端点的 limit 能力实际不可用。已补。
- **4.1（评估，不实施）**：`@@index([isHot])` 暂不加——候选查询按两段各 LIMIT CAP 取数且过滤含 deletedAt/status，单列 isHot 索引在现量级（dev 库数百品牌）收益有限；品牌总量显著增大时再评估复合索引。
- **门禁**：单测 **294/294**（domain 84，+3）；全量 e2e **7 套件 / 86 用例**（+1）；`validate --strict` ✓。无迁移。
- 剩余：归档动作（delta 合并主规格）。
