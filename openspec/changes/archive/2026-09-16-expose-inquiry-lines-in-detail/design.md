## Context

动机与范围见 `proposal.md`。这里只记录塑造方案的现状约束。

**响应投影链路的既有语义。** 本项目所有响应都经 `plainToInstance(DtoClass, row, { excludeExtraneousValues: true })`（AGENTS.md 硬规则：禁止返回未过滤的 Prisma 对象）。`excludeExtraneousValues: true` 下只有被 `@Expose()` 标注的属性会保留 —— 未在 DTO 上声明的键被静默丢弃，**不报错、不留痕**。这正是本次缺陷的发生机制：`findOne` / `findOneForCustomer` 的 `include: { inquiryLines: { where: { deletedAt: null } } }` 有效执行了查询，但出口 DTO 没有对应的 `@Expose()` 属性，数据在投影阶段消失。

**涉及的既有构件（grep 实测）。**

- `InquiryResponseDto`（`packages/domain/src/inquiry/inquiries/dto/inquiry-response.dto.ts`）：在 `InquiriesService` 内被 `plainToInstance` **9 次**（`create` / `createForCustomer` / `findMyInquiries` / `findOneForCustomer` / `transitionForCustomer` / `findAll` / `findOne` / `update` / `updateStatus`），控制器侧另有 8 处 Swagger `type:` 引用。
- `InquiryLineResponseDto`（`packages/domain/src/inquiry/inquiry-lines/dto/`）：已含 `inquiryLineId` / `productName` / `model` / `typeName` / `quantity` / `unitPrice` / `subtotal` / `remarks` / `sortOrder` 等，是详情明细元素**字段集的来源**，本变更直接复用它作为元素类型。
- `packages/domain/src/index.ts` 是唯一公开导入面，新增 DTO 必须在此导出（禁止 `@gvray/*/src` 深路径）。
- 明细行的写入路径：Mall 客户在 `createForCustomer` 事务内批量建行；Admin 经 `InquiryLinesService.create` 逐条建行并填写 `unitPrice` / `subtotal`。行数上限由 `CreateCustomerInquiryDto` 的 `@ArrayMaxSize(50)` 约束。

**仓内先例与术语。** `UsersService.findUserForResponse` + `USER_RESPONSE_SELECT`（CONTEXT.md「User response projection」）是一个私有接缝，同时拥有读取形状与映射，8 个调用点复用。本轮设计审查确认询价域做对齐接缝，词条 **`Inquiry response projection`** 已入 CONTEXT.md（带 ⚠️ 落地标记，实现完成后移除）。

**约束。**

- 无 schema 变更可用（本轮不引入迁移）；Admin 与 Mall 两个详情端点都要修；列表与写端点的外部契约必须零变化。
- 接缝是**实现**，规格（spec delta）说的是对外行为 —— 两者分层。
- **`Decimal` 序列化陷阱（既有规范，询价域漏用）**：`class-transformer` 对**没有 `@Type`** 的属性会把 `value.constructor` 当目标类型并 `new value.constructor()`；对 Prisma `Decimal` 即 `new Decimal(undefined)` → 抛 `Invalid argument`，整个响应 500。`FilterResponseDto` / `EquipmentResponseDto` 的文件头注释已写明该陷阱并一律使用 `@Type(() => Number)`；全仓 Decimal 字段中只有询价域 3 个漏了（见决策 3）。

## Goals / Non-Goals

**Goals:**

- 两个详情端点（Mall `GET /inquiries/:id`、Admin `GET /inquiry/inquiries/:id`）的响应真正携带该询价单的未软删除明细行。
- 询价域金额字段（`totalAmount` / `unitPrice` / `subtotal`）以 JSON 数值传输、为空时保持 `null`，且其存在不再导致 5xx。
- 列表端点与全部写端点的响应结构保持稳定。
- **投影与详情读取形状收敛为单一内部接缝（`Inquiry response projection`），9 个出口共用** —— 字段增删只改一处。
- 字段集一致由继承结构性保证（详情 DTO 继承主体 DTO、明细元素复用明细 DTO）。
- 把契约写进规格（`inquiry` 能力 delta），使「详情含明细」可被测试断言。

**Non-Goals:**

- **价格聚合口径**：`subtotal = quantity × unitPrice`、`totalAmount = Σ subtotal` 的服务端推导与校验。本轮只做可见性与序列化正确性，价格仍由后台手工填写，未填即 `null`。
- 其余审查发现：地址快照与 `SetNull` 丢址（P0-2）、状态流转竞态（P0-3）、编号生成 4 位溢出（P1-1）、懒过期与 ADR 0014 冲突（P1-3）。各自独立变更。
- **不做 re-query 接缝**（如 `findInquiryForResponse(where)`）：只有 2 个详情方法会消费它，且 `findAll` / `findMyInquiries` 走 `paginateWithSort`，是假设接缝。
- **不把 `InquiryLinesService` 并入接缝**：Admin 明细行端点是另一个 adapter，合并会把两个端点耦起来。
- 客户侧明细行的增删改、明细行展示字段扩充（如 `filter.photoUuid`）。
- 修复 `openspec/specs/inquiry/spec.md` 中已过时的「询价单状态只读约束」Requirement —— 独立文档漂移。
- 全仓其它域 Decimal 字段的排查（复核结论：只有询价域漏用 `@Type`，其余已合规；未来新增 Decimal 列遵循同一约定）。
- 存量脏数据清洗。

## Decisions

### 1. `Inquiry response projection`：一个内部接缝同时承载「详情怎么读」与「读出来怎么投影」

新增物（`InquiriesService` 的私有实现 + `dto/` 下纯数据）：

- 私有投影函数 `projectInquiry(row)` → `InquiryResponseDto`、`projectInquiryDetail(row)` → `InquiryDetailResponseDto`；
- 读取形状常量 `INQUIRY_DETAIL_INCLUDE`（`inquiryLines` 的 `where: { deletedAt: null }` + `orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]`），供两个详情方法共用；
- 9 个出口全部改调投影函数。

**为什么是这个形状，而不是更小或更大的：**

- **不是只收投影、不动 include**：`deletedAt` 过滤与排序语义就会留在两个详情方法里各写一份 —— 那正是「让出口追上查询」要消除的重复的一半。
- **不是完整 re-query 接缝**：只有 2 个消费者，且列表路径的读取形状本就不同（假设接缝）。先例 `findUserForResponse` 有 8 个调用点，形态不可照搬。
- **不并入 `InquiryLinesService`**：另一个 adapter，合并会把两个端点耦起来。

**删除测试**：删掉接缝，映射与读取形状知识在 9 个出口重现 —— 集中，成立。locality：字段增删落一处；leverage：一个接缝、9 个出口。

### 2. 派生 `InquiryDetailResponseDto`（继承），明细元素直接复用 `InquiryLineResponseDto`

新增 `InquiryDetailResponseDto extends InquiryResponseDto`，只额外声明 `@Expose() @Type(() => InquiryLineResponseDto) inquiryLines?: InquiryLineResponseDto[]`。详情出口由 `projectInquiryDetail` 唯一构造，其余 8 个出口经 `projectInquiry` 产出 `InquiryResponseDto`。

**为什么不是直接给 `InquiryResponseDto` 加字段**：基础 DTO 被列表端点复用，加字段会让列表 payload 随明细数量线性膨胀（每条最多 50 行）。派生让「新增可见性」与「既有契约」物理隔离。

**明细元素为什么不需要派生新类**：`unitPrice` / `subtotal` 的数值化由决策 3 落在 `InquiryLineResponseDto` 自身，因此详情与 Admin 明细行端点共用同一元素 DTO、同一序列化口径 —— 不存在「同名字段两副类型」需要继承覆写来表达。

*备选（否决）*：给 `InquiryResponseDto` 加 `includeLines: boolean` 开关切换 DTO —— 同一方法两副返回形状会让调用方类型与运行时行为脱钩；在 Controller 手工拼装响应 —— 绕过 DTO 投影，违反硬规则。

### 3. 询价域 Decimal 金额统一数值化（实现期修正：补全仓既有规则）

> **实现期修正（2026-09-16）**。本节此前写作「金额数值化限定在详情 DTO，`InquiryLineResponseDto` 保持 Decimal 字符串序列化以兼容 Admin 既有消费方」，并据此引入 `InquiryDetailLineResponseDto` 子类用 `declare` 覆写两个字段。E2E 阶段该前提被**证伪**：`InquiryLineResponseDto` 今天不是「字符串序列化」，而是 `DecimalError` → 500（详见「实现期发现」）。「保持不变」的选项并不存在；子类也随之失去理由，已删除。

`Inquiry.totalAmount`（`Decimal?`）加 `@Type(() => Number)`、类型收紧 `number | null`；`InquiryLine.unitPrice` / `subtotal` 同理。这是 `FilterResponseDto` / `EquipmentResponseDto` 早已写明的**全仓约定**（Decimal 一律经 `@Type(() => Number)` 走原语转换路径），询价域是唯一漏用者。

**语义**：`@Type(() => Number)` 走原语转换，`Decimal` → `number`；`null` 保持 `null`（实测，不转 `0`）—— 与规格「非空为数值、为空为 null」一致。

*备选（否决）*：保留字符串（不满足规格，且今天根本走不通）；在 Service 里 `Number(row.unitPrice)`（序列化关注点写进业务逻辑，两条读取路径重复承担）；只给详情路径的字段加、父类不动（等价于保留 500）。

### 4. 读取形状收成常量

两个详情方法的 `include` 收成 `INQUIRY_DETAIL_INCLUDE` 单点。出口（投影函数）与查询形状（常量）都在接缝内，谁也不会静默漂移。排序交给数据库而非依赖返回顺序。

### 5. 测试面分层：DTO 层即 internal seam 的测试面

- **单测**（`*.spec.ts`）：直接 `plainToInstance(...)`，断言**线上 JSON 形状**（`wire` / `wireKeys` —— `Object.keys(instance)` 会包含值为 `undefined` 的未暴露字段、稀释断言）。投影函数是薄委托，DTO 层就是接缝的实际行为测试面；不为测试把私有函数提为公开面。
- **契约测试**（E2E）：规格 Scenario 落成 HTTP 层断言，含「非空 Decimal 不再 500」的回归护栏。

## 实现期发现（2026-09-16）

设计阶段的两个「不能假定」用一次性探针在真实依赖版本上跑定，探针已删除；实现阶段又挖出一个**既有缺陷**。

**探针结论（设计前提）**

| 问题 | 实测 | 影响 |
| --- | --- | --- |
| 继承链上的 `@Expose()` 是否被收集 | **收集**，`@Exclude()` 不带入 | 决策 2 成立；显式声明 20 字段的回退方案不需要 |
| 子类覆写父类属性 + `@Type` 是否生效 | **生效**（需 `declare`，否则 TS2612） | 曾支撑已删除的 `declare` 覆写方案 |
| `@Type(() => Number)` 遇 `null` | **保持 `null`**，不转 `0` | 不需要 `@Transform` 兜底 |
| 嵌套数组 `@Type` + `excludeExtraneousValues` | 逐元素映射，元素内多余键被剔除 | 详情 `inquiryLines` 投影成立 |

**既有缺陷：询价域 3 个 Decimal 字段漏用 `@Type`**

- **机制**：`TransformOperationExecutor` 对无 `@Type` 的属性执行 `targetType = value.constructor` → `new Decimal()` → `DecimalError: Invalid argument: undefined`。本仓 `FilterResponseDto` / `EquipmentResponseDto` 的文件头已写明该陷阱并一律加 `@Type`；询价域 3 个字段是唯一漏网者。
- **暴露面**：`totalAmount` 非空 → 询价列表 / 详情 / 创建 / 更新 / 状态流转全部 500；`unitPrice` / `subtotal` 非空 → Admin 明细行端点 500。即**后台录报价必 500**，且规格要求的「客户查看已报价详情」场景此前不可达。
- **为何从未暴露**：`totalAmount` 长期无写入方；明细行在详情出口被 DTO 剥掉（本次缺陷本体），Admin 明细行端点的已报价路径未被测试覆盖。
- **处置**：由决策 3 一并修复；E2E 增加「非空 Decimal 不再 500」回归护栏（`test/inquiry-detail-lines.e2e-spec.ts` 的 5.1 与 5.5）。

**基线**：core + domain `tsc` 通过；domain 既有 4 suite / 26 用例全绿（改动前）。

## Risks / Trade-offs

- **[字段漂移]** → 结构性消除：明细元素直接复用 `InquiryLineResponseDto`，详情主体继承 `InquiryResponseDto` —— 父类加字段、子类/复用方自动跟上，危险方向（详情缺字段）不可能发生。
- **[金额字段从此为 `number`，Admin 侧消费方需同步]** → 该端点此前对已报价行返回 500，不存在需要保留的既有行为；数值化后与全仓其它域（Filter / Equipment）一致。
- **[Precision 损失]** → `Decimal(12,2)` 转 JS `number` 对两位小数金额安全（远低于 `Number.MAX_SAFE_INTEGER`）；`Decimal(10,3)` 的 `Filter` 字段已有同样转换先例。
- **[详情响应体积随明细增长]** → Mall 侧单笔最多 50 行（DTO 已约束）；Admin 侧逐条建行无上限，验收时确认详情页对超大明细单的渲染策略。
- **[修复后首次暴露存量数据质量问题]** → 若历史明细行的 `productName` 为空，会首次出现在客户视野。不阻塞本次修复，验收时抽查；清洗留作独立事项。
- **[接缝是 internal seam，没有编译器强制「9 个出口都走接缝」]** → 走查验收：`grep "plainToInstance(InquiryResponseDto"` 必须只命中投影函数内一处。
- **[新增 Decimal 列时的同类风险]** → 约定已写入 `InquiryResponseDto` / `InquiryLineResponseDto` 的类注释（⚠️ 必须带 `@Type`），供后人照抄。

## Migration Plan

- 无 schema 变更、无数据回填、无 seed 变更，因此**无迁移步骤**。
- 发布顺序无约束：DTO、接缝与 Service 出口在同一提交内变更，两个应用同步生效（monorepo 共享包）。
- 回滚：`git revert` 该提交即可。无状态残留、无数据副作用。
- CONTEXT.md 词条的 ⚠️ 落地标记随实现完成移除。

## Open Questions

- 存量明细行的展示质量（`productName` 为空、快照字段缺失等历史数据）是否需要在后续变更中做一次性清洗与回填？可安全延后：不影响本变更的方案选择与任务拆分，且清洗是独立的数据作业。
