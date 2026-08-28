# Design — Sink completeness-weighted sort mechanism

## Context

Motivation in [proposal.md](proposal.md)（Why）。当前状态与约束：

- 三个 service 各自持有整份机制：`WEIGHTED_*_FIELDS` 常量表 + `*.SUM_SQL` 编译器 + `findAllWithWeightedSort` 私有方法（`$queryRaw` + 参数化 conditions + count + plainToInstance + envelope）。
- 三者接口一致（`findAll(query, opts)`）、返回类型统一（`PaginationData<DTO>`），但 Prisma where 输入类型不同（`FilterWhereInput` / `EquipmentWhereInput` / `EquipmentCatalogWhereInput`），count 对象不同。
- ADR 0003 已提供 seam 先例（SoftDeleteService）；ADR 0003 备选 D 明确拒绝向 BaseService 继续堆方法 → 本次不改 BaseService 方法面。
- ADR 0005 增补决策 2 已约定排序语义（加权分 DESC → sortOrder DESC → createdAt DESC、B2C 忽略 sortBy、count 复用 status='enabled'）。
- brands / filter-types 两个子模块经 schema 核实几乎无业务 nullable 字段，不消费此机制。

## Goals / Non-Goals

**Goals:**
- 机制单点收容：SUM-SQL 编译、注入防护、三级稳定翻页、count + envelope 装配写一次。
- 各 service 只留数据声明（字段表 + conditions + DTO）。
- 模块间 code 面貌高度收敛，behavior 零变化（e2e 断言不改即可证明）。

**Non-Goals:**
- 不改 BaseService 方法面（ADR 0003 备选 D 方向）。
- 不做候选 3（P2002 兜底下沉）——不同 seam，另行处理。
- 不迁移 brands / filter-types——无可加权内容。
- 不引入任何对外行为 / API / schema / 配置变更。

## Decisions

- **D1 — 形态：纯函数，非注入式 service。** `runWeightedSort(prisma, spec)`，prisma 作参数。理由：单机制、3 消费者、零配置依赖，符合"accept dependencies, don't create them"，测试传 mock prisma 即可、零 Nest 仪式。与 SoftDeleteService（多能力、9 消费者、DI）前提不同，故不随其形态。**备选**：`@Global` service → 多一层 DI 仪式，constructor 已显膨胀，否。

- **D2 — 位置：`src/modules/equipment/weighted-sort.ts`，不进 shared。** 3 消费者全在 equipment 模块树内；brands/filter-types 已证实不会成为第 4 个，跨模块 B2C 消费者是假设（one adapter = hypothetical seam）。未来出现时 `git mv` 提升。**备选**：shared → 为不存在的消费者预付耦合成本，否。

- **D3 — 接口：全接管。** 返回值 `PaginationData<DTO>`。count 以 thunk 传入（各模块 Prisma where 类型不同，真实类型差异，不用泛型强统）。DTO 通过 `ClassConstructor<DTO>` 传入（class-transformer 泛型）。**备选**：只编 SQL（机制仍散 3 处，太浅）、不做 envelope（每处仍留 10 行复制），均否。接口约 6 参数，全是数据、无行为耦合。

- **D4 — where→conditions 留在 service。** 各模块差异真实（equipment 有 brandId/catalogId/engineEnergy；filters 有 typeName；catalogs 有 name/code），helper 收 `conditions: Prisma.Sql[]`。**备选**：定义过滤 DSL → 接口变大，为省 10 行引入规约，浅化方向，否。

- **D5 — 谓词收敛：`isB2cVisibility(opts)`。** 从 `base.service.ts` 导出（与 `B2C_VISIBILITIES` / `VisibilityOpts` 同居），消灭四处带 cast 的 `B2C_VISIBILITIES.includes(...)`：三个 `findAll` 分支 + equipment `findOne` 的 B2C 关系过滤（`const isB2c = ...`）；`base.service.ts` 自身的 `applyVisibility`/`assertVisible` 两处判断改为谓词实现（谓词定义即收敛点）。分支 `findAll` 内部保留（接口语义）。**备选**：分支下沉 BaseService → god-class 生长，ADR 0003 备选 D，否。

- **D6 — catalogs conditions 改直。** 当前 `buildWhere({ contains: { name } })` 再 `where.name as { contains }` 拆回，喂 raw SQL。改直：`findAll` 直接 `query.name` 转 `Prisma.sql\`"name" ILIKE ...\``。行为等价。

- **D7 — 排序/注入语义逐字保留。** ORDER BY `(SUM_SQL) DESC, "sortOrder" DESC, "createdAt" DESC`；用户值全 `${...}` 参数化，列名/权重经 `Prisma.raw` 内联（常量）；count 与排序解耦。

- **D8 — CONTEXT.md 词条 + ADR 0005 追加增补。** 词条已随本 change 落（Technical Vocabulary）。ADR 0005 append 第三段增补，记录机制下沉、语义零变更、维护仪式三步→一步；标注旧"三步仪式"已被取代。append-only，不改写历史。

## Risks / Trade-offs

- **[机制行为被单点承载，回归风险集中]** → 新增机制单测覆盖 SQL 编译、注入安全、ORDER BY 结构、envelope；既有 e2e（三个 describe 断言零修改）作为行为保持的回归网；`$queryRaw` 共享 mock 根 + `beforeEach mockClear()` 模式照旧。
- **[shared 模块新增 export 谓词被误用]** → `isB2cVisibility` 是只读判断，无副作用；文档注释标明用途，避免被当成分流控制器调用。
- **[count thunk 造成额外类型负担]** → 六参数接口已流经所有调用点，实际只新增一处 count 包装（`() => this.prisma.filter.count({ where })`），成本可接受，换来 count 类型天然解耦。
- **[纯函数 README/导航可见性]** → 单测即文档冗余一例；CONTEXT.md 词条 + ADR 增补保证可发现；文件紧邻三个消费者。

## Migration Plan

- 单次落地 + 单次 conventional commit（`refactor(equipment): ...`）。
- 落地顺序：先建 `weighted-sort.ts` + `isB2cVisibility` 谓词与单测 → 逐个 service 迁移（filters → equipment → catalogs，含 catalogs 改直）→ 全量单测 + e2e 通过 → 文档（CONTEXT.md 词条、ADR 增补）+ 归档。
- 回滚：提交可整段 revert 至原三处复制形态；无数据/schema 迁移，无数据库改动。