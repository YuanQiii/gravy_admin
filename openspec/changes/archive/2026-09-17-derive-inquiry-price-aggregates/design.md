## Context

- `InquiryLine.subtotal` 当前是 `dto.subtotal ?? null`（`packages/domain/src/inquiry/inquiry-lines/inquiry-lines.service.ts:68`）——纯人工填写，与 `quantity`/`unitPrice` 无约束关系。
- `Inquiry.totalAmount` 全仓只出现在 DTO 声明与响应投影里（`create-inquiry.dto.ts:48`、`inquiry-response.dto.ts:59`、`schema.prisma:686`），**没有服务端写入方**：值靠 admin 在 `POST/PATCH` 手工传，经 `create`/`update` 的 `...rest` 透传落库。
- 客户侧已能看到这些字段（归档变更 `2026-09-16-expose-inquiry-lines-in-detail` 把明细行与金额暴露成数值类型），因此"合计与小计不自洽"已经是对外可见的缺陷。
- 字段精度：`Inquiry.totalAmount`、`InquiryLine.unitPrice`、`InquiryLine.subtotal` 均为 `Decimal(12,2)`；`quantity` 为 `Int`。
- 相关并行未归档变更（**串行依赖，见决策 6**）：`snapshot-inquiry-shipping-address`（同改「询价单创建」Requirement 与 `create`）、`atomic-inquiry-status-transition`（引入 `applyStatusTransition` 接缝）、`resolve-inquiry-expiry-semantics`（`submitted → quoted` 强制 `expiresAt`）。

## Goals / Non-Goals

**Goals:**

- 让 `subtotal` 与 `totalAmount` 成为**可推导的派生值**，使"四者可任意不一致"在结构上不可能。
- 聚合只有一个所有者、一个触发面，任何写入路径都不会漏算。
- 存量不一致数据一次性纠正，并让纠正范围可量化。

**Non-Goals:**

- **不做**人工覆盖 / 整单折扣 / 税额 / 运费 / 多币种。若将来要"整单改价"，正确做法是新增显式的 `discountAmount` + 理由字段，而不是保留一个可任意填写的 `totalAmount` —— 记为未来能力，不在本变更夹带。
- **不引入** DB 层生成列或触发器（见决策 1 的备选否决）。
- **不新增**状态门禁（例如"报价后禁止改明细"）。报价后编辑明细会改写 `totalAmount` 这一事实被记录为 Open Question（决策 5），本变更保持现有权限模型。
- **不改**明细行的软删语义（`InquiryLine.deletedAt` 是活条件，由 `unify-soft-delete-mechanics` 之外的既有行为处理）；本变更只规定聚合的取数范围是"未软删明细行"。

## Decisions

### 1. 聚合的所有者：一个 providers-only 的深 module

新增 `InquiryPricingService`（`packages/domain/src/inquiry/pricing/`，providers-only，仅注入 `PrismaService`），对外只有一个方法：

```ts
recomputeForInquiry(tx, inquiryId): Promise<void>   // 重算 totalAmount
deriveLineSubtotal(quantity, unitPrice): Decimal | null  // 纯派生，供 InquiryLinesService 使用
```

`InquiryLinesService` 与 `InquiriesService` 各注入它。为什么不把重算放进其中任何一个 Service：`InquiryLinesService` 写明细、`InquiriesService` 拥有询价单主体，两个方向都要触发聚合，任一方向内联都会形成对另一方的依赖（或复制一份）。

*备选（否决）*：
- **DB 生成列 / 触发器**：`subtotal` 可用生成列表达，但 `totalAmount` 是跨行聚合（PostgreSQL 生成列不能引用其他行），必须靠触发器或物化；触发器把业务规则移出 TS 代码、绕过 DTO/审计与 `updatedById`，且 `prisma migrate` 的 schema diff 无法表达它（会长期漂移）。收益与成本不成比例。
- **只在报价动作时算 `totalAmount`**：会让"报价前运营看到的合计"与"客户看到的合计"含义分叉，且报价后任何明细改动都会让合计失真——留出一个肉眼不可见的窗口。

### 2. `subtotal` 派生：`quantity × unitPrice`，空单价 → `null`

`deriveLineSubtotal` 是纯函数（Decimal 入参、Decimal 出参），`unitPrice` 为 `null` 时返回 `null`（**不是 `0`**）——`0` 会与"免费"混淆，而 `null` 表达"尚未报价"，与规格「未报价为 null」的既有口径一致。

### 3. 聚合在 Decimal / SQL 层完成，不用 JS `number` 相加

`quantity` 是整数，`unitPrice` 是两位小数，单行乘法精确；但**逐行用 JS `number` 相加会引入浮点误差**（`0.1 + 0.2` 类问题在金额上不可接受）。因此 `totalAmount` 的重算用一次 SQL 聚合（或 Prisma `Decimal` 相加）完成，**不**把行读进内存再 `reduce`。这条约束要写进代码注释，否则极易被后续重构"优化"掉。

### 4. 触发面：每个写路径在同一事务内重算，客户端不再能传金额

- `InquiryLinesService` 的 `create` / `update` / `remove` / `removeMany`：写完明细行后在**同一 `tx`** 内调 `recomputeForInquiry(tx, inquiryId)`。
- `InquiriesService` 的报价流转（`updateStatus` → `quoted`）后重算一次；该调用落在 `applyStatusTransition` 的**调用方**，不塞进接缝内部（接缝的职责是原子流转，不是定价）。
- `CreateInquiryDto.totalAmount`、明细行 DTO 的 `subtotal` 移除。因 ValidationPipe 启用 `forbidNonWhitelisted`，旧调用方传这些字段会收到 **400**（**BREAKING**，见决策 7）。

### 5. 一致性窗口：只保证"同一事务内自洽"，不保证"报价不可变"

事务保证读数永不矛盾；但**报价之后运营仍可编辑明细**，此时 `totalAmount` 会跟着变，客户看到的历史报价因此可能被改写。本变更不新增状态门禁（那会改变既有权限/流程语义，属独立决策），但把它写进 Open Questions 与规格的措辞（"合计随明细行变化重算"），使行为是已知的而非意外的。

### 6. 与并行变更的串行关系

三者都落在同一条报价/创建路径上：

- `snapshot-inquiry-shipping-address`：同改「询价单创建」Requirement 与 `create`/`createForCustomer`。**归档与实现都需串行**，否则两个 MODIFIED 会互相覆盖（本变更只改 `totalAmount` 相关文字，但整块替换意味着必须以对方合并后的主规格为基准重放）。
- `atomic-inquiry-status-transition`：本变更在 `updateStatus` 里加一次重算，位于 `applyStatusTransition` 调用之后；不修改该接缝本身。
- `resolve-inquiry-expiry-semantics`：`expiresAt` 校验与本变更的重算是报价动作的两个副作用，实现时同处编排，顺序无关。

建议实现顺序：`snapshot-inquiry-shipping-address` → `atomic-inquiry-status-transition` → 本变更 → `resolve-inquiry-expiry-semantics`（先落地改动面重叠最大的，减少 rebase 成本）。

### 7. 破坏性与迁移

- 入参收窄是 **BREAKING**：Admin 前端若在创建/更新询价单或明细行时传 `totalAmount`/`subtotal`，会从"被静默接受"变为 **400**。需在 Impact 与 Swagger 描述中写明，并在实现时核对 admin 前端调用点。
- **回填**：迁移内一次性 `UPDATE inquiry_lines SET subtotal = quantity * unit_price WHERE unit_price IS NOT NULL`（`unit_price` 为空的行保持原值不动——它们本就应为 `null`，若历史值非空则**保留**并记录，避免擅自抹掉人工数据）+ `UPDATE inquiries SET total_amount = (SELECT SUM(...) ...)`。
- 回填会**改写已有数据**，因此迁移文件里必须附一条**核查 SQL**（先量化将被改动的行数与差额），执行前由用户确认。

## Risks / Trade-offs

1. **[BREAKING 的 400]** → 旧客户端传金额会失败。这是刻意的（否则一致性无法保证）；缓解：Swagger 描述明确 + 实现时 grep admin 前端调用点 + 错误信息指向"金额由服务端派生"。
2. **[回填改写历史金额]** → 会纠正"看起来不一致"的历史数据，但也可能改掉运营**有意**填过的值（例如手工抹零）。缓解：核查 SQL 先输出差异行；`unitPrice` 为空的行不动；若差异量超预期则暂停并上报，而不是自动放行。
3. **[报价后编辑改写合计]** → 决策 5，记录为已知行为 + Open Question（是否需要在 `quoted` 后锁价）。
4. **[Decimal 相加被重构回 JS number]** → 在 `recomputeForInquiry` 上方写注释说明原因；单测用 `0.1/0.2` 类小数构造用例，使浮点误差一旦引入就会失败。
5. **[与三个并行变更的文件重叠]** → 决策 6 的顺序；实现时同一文件的改动必须合并处理，不能各自 patch。
6. **[`totalAmount` 语义变化]** → 从"运营填的数字"变成"派生值"。若下游（报表/导出/BI）依赖手工填的值，需同步；本变更未发现此类消费方（`grep totalAmount` 仅命中 DTO 与 schema），实现时复核一次。

## Open Questions

1. `quoted` 之后是否应锁定明细行（禁止改价）？当前不锁；若要锁，是状态机 + 权限的独立变更。
2. 是否需要"整单折扣/抹零"能力？若需要，应新增显式字段与理由，而非恢复可自由填写的 `totalAmount`。

### 8. 触发点收成一条写路径（架构审查候选 A，采纳）

> 审查结论：把"每个写路径都记得调重算"改成"写路径本身保证重算"。

`InquiryLinesService` 内新增私有 `writeLine(tx, op, args)`：负责「派生 `subtotal` → 执行写 → 无条件调 `recomputeForInquiry`」。四个出口（`create`/`update`/`remove`/`removeMany`）退化为对它的一次调用。

理由：本变更要消灭的缺陷形态是"字段之间可以不一致"，而"4 个出口各自记得调用重算"是**同一个失败模式换了个位置**——漏一处就是静默的陈旧合计。让重算成为写路径的固有部分后，漏算在结构上不可能。报价路径（`updateStatus` → `quoted`）保留独立一处：它不写明细，是另一类动作。

### 9. 精度约束升级为编译期约束（架构审查候选 B，采纳）

决策 3 的"不得用 JS `number` 相加"原由注释与一条单测守护——`reduce((a, b) => a + b)` 这种自然写法随时会回来。采纳轻量 branded type：`type Money = Decimal & { readonly __money: unique symbol }`（或等价包装），使聚合函数的签名**只接受** Decimal，`number` 参与直接编译失败。约定因此从"注释里的纪律"变成"签名里的约束"。

### 记录的后续项（不在本变更实现）

- 审查候选 C：「报价」动作的编排落点。`submitted → quoted` 现在至少有三个独立副作用（状态时间戳、`expiresAt` 必填、合计落定），分属三个并行变更。建议后续引入显式 `quoteInquiry(tx, inquiryId, dto)` 编排 module，把三者的接缝收口——**跨变更，需在四者都归档后单独立项**。

### 10. 创建期字段不可变：换址/改价 = 新建单据（并入 W1）

> 来源：`openspec/changes/archive/2026-09-17-snapshot-inquiry-shipping-address/verification-20260917.md` 的 W1。P0-2 验证时发现 `update` 用 `{ expiresAt, ...rest } = dto` 整块 spread，而 `UpdateInquiryDto extends PartialType(CreateInquiryDto)` 仍带 `shippingAddressId`，于是后台 PATCH 能把地址引用换成另一张地址而**不动快照**，得到「引用指向 B、收货人是 A」。规格此前既未定义该行为，也无测试。

**选定（a）创建后引用不可变**，而不是（b）换引用时同事务重解析快照：

- 快照的语义是"创建时点的商业事实"（P0-2 决策 2）。允许换引用而不换快照 = 数据自相矛盾；换引用同时换快照 = 悄悄改写既有单据的履约依据与报价基础（客户看到的历史报价被改写）。两种"允许"都在破坏同一件事：**单据是事实的记录，不是可回指的活引用**。
- 干净的表达是：换址或改价 ⇒ 新建一张询价单。它让"更新"这条路径的语义收缩为"改标题/描述/备注等非履约字段"，与本变更"金额由服务端派生、入参不得指定"的方向完全一致。
- 落地方式与 3.1 同一处：`UpdateInquiryDto` 改为 `PartialType(OmitType(CreateInquiryDto, ['shippingAddressId', 'totalAmount'] as const))`。因为 ValidationPipe 启用了 `forbidNonWhitelisted`，旧调用方传这两个字段会得到 **400** 而不是静默忽略——这避免了本项目已在 P2-2 批评过的"文档允许、实际无效"的静默 no-op。

*备选否决*：(b) 换引用时同事务重解析快照——实现上更"宽容"，但它把"快照冻结"变成"快照跟随单据自身的引用变更"，冻结的语义就不再有边界；且客户已看过的报价会被改写。

