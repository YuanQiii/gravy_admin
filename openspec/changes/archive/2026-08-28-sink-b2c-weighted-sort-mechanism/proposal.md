## Why

"信息齐全优先" 加权排序（Completeness-weighted sort，见 CONTEXT.md 词条）的**机制**——加权求和 SQL 编译、参数化 raw 查询模板、三级稳定翻页排序、count 分页、DTO 包络——在 equipment 域的 filters / equipment / catalogs 三个 service 中逐字复制了三份（~150 行实现中 ~80% 逐字相同）。真正逐模块变化的只有数据（表名、字段权重表、where→SQL 条件映射、ResponseDto）。ADR 0005 增补自记录的维护仪式要求：调整一个加权字段要同时更新 3 处常量 + spec + e2e 构造数据；机制级 bug（翻页不稳定、注入缺口）需打三遍补丁，漏一处即静默回归。

三个模块的 `findAll(query, opts)` 接口本身是好的——问题在机制没有 seam，无处安放。

## What Changes

- 把加权排序机制下沉为 equipment 模块内一个共享深模块：纯函数 `runWeightedSort(prisma, spec)`，接收 `WeightedSortSpec`，返回 `PaginationData<DTO>`；各 service 只保留数据（字段表、conditions、ResponseDto）。**行为零变更**：接口签名、响应结构、排序规则、权重数值、参数化策略、B2C 域忽略 sortBy 语义逐字保留。
- 导出谓词 `isB2cVisibility(opts)`，替换四处带 cast 的 `B2C_VISIBILITIES.includes(...)`（三个 `findAll` 分支 + equipment `findOne` 的 B2C 关系过滤，另 `base.service.ts` 的 `applyVisibility`/`assertVisible` 直接改用谓词实现）；分支判断保留在各 `findAll`（接口语义，不入 BaseService）。
- 顺带：catalogs 的 where 条件改由 query DTO 直接构建，删除经 `buildWhere` 中转再拆包的反向路径（行为等价）。
- CONTEXT.md 新增 `Completeness-weighted sort` 词条（已随本 change 落词条）；ADR 0005 追加第三段增补记录本次下沉（append-only）。

## Capabilities

### New Capabilities

无。纯重构，不引入新能力。

### Modified Capabilities

无。`skip_specs: true` 已声明——规范级（外部可观察）行为不变，纯实现重构，故不写 delta spec。

## Impact

- 代码：`src/modules/equipment/` 下 filters / equipment / catalogs 三个 service；新增共享机制模块（同目录）；`base.service.ts` 导出一个谓词（导出 `isB2cVisibility`，不增方法）。
- 文档：`CONTEXT.md`（词条已落）、`docs/adr/0005-anonymous-visitor-access.md`（追加增补段）。
- 测试：新增机制单测；既有 `test/equipment-anonymous.e2e-spec.ts` 三个 describe **断言零修改**（行为保持的证明）。
- 无 API / schema / 依赖 / 配置变更。