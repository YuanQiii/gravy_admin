## Context

`InquiriesService` 在两处写路径内联了同一套编号逻辑：`create`（`packages/domain/src/inquiry/inquiries/inquiries.service.ts:95-125`）与 `createForCustomer`（`:204-258`）。两段逻辑完全相同：在事务内以 `inquiryNo` 的 `INQ{YYYYMM}-` 前缀 `findFirst` + `orderBy: { inquiryNo: 'desc' }` 取「当月最大编号」，再 `parseInt(last.inquiryNo.slice(-4), 10) + 1` 推导下一序号，`String(next).padStart(4,'0')` 零填充，最后 `pg_advisory_xact_lock(hashtext(candidate))` + 插入冲突重试 3 次。

根因有两层：
1. **序号宽度写死 4 位**：`next=10000` 时 `padStart(4)` 产出 5 位 `10000`，单月 9999 上限被硬突破。
2. **「最大值」用字典序而非数值序**：一旦存在 `…-10000`，`orderBy inquiryNo desc` 的字典序把 `…-9999` 判为更大（因为 `"9999" > "10000"` 字典序成立），派生候选 `…-10000` 已存在 → P2002 → 重试耗尽 → `INQUIRY_NO_GENERATION_FAILED`（500）。

规格 `openspec/specs/inquiry/spec.md:26-43` 的「询价单编号生成」Requirement 已**写死 4 位格式**（`INQ{YYYYMM}-{4位序号}`，示例 `INQ202608-0001`、场景含 `-0006`/`-0007`），故改位数是**对外行为变更**，须标 BREAKING 并同步规格。`inquiryNo` 在 schema（`prisma/schema.prisma:679`）为 `@unique`，迁移 `prisma/migrations/0_init/migration.sql:769` 建全局唯一索引 `inquiries_inquiryNo_key`；列类型为 `TEXT`，改序号位数**无需改表结构**。

## Goals / Non-Goals

**Goals:**
- 消除写路径在单月超 9999 单时的硬失败（P1-1）。
- 将两处重复编号实现合并为单一深模块，修复只需一处（P3-1）。
- 让「当月最大值」推导在语义上正确（数值序），并在固定宽度下字典序自动等价。

**Non-Goals:**
- 不引入新的数据库表或 PostgreSQL 序列对象（见 Decisions 备选否决）。
- 不改变 `inquiryNo` 的全局唯一约束、列类型或索引结构。
- 不改动 `INQUIRY_NO_PREFIX` / `INQUIRY_NO_FORMAT` 常量含义（仅新增序号宽度常量）。

## Decisions

### 决策 1：抽出单一 `nextInquiryNo(tx, prefix)` 深模块

**决策**：新增 `nextInquiryNo(tx, prefix): Promise<string>`，把「序号推导 + advisory lock + P2002 重试」三段收拢为单一实现，签名接收事务客户端 `tx` 与 `prefix`（`INQ{YYYYMM}-`），返回完整候选号。`create` 与 `createForCustomer` 各自删除内联块、改为调用该模块。

**理由**：直接消除 P3-1 两处同构重复，把缺陷局部化到一处；符合本仓既有「深模块」实践（如 `INQUIRY_DETAIL_INCLUDE` / `projectInquiry` 投影接缝）。调用方只表达「给我下一个号」，内部加锁/重试/比较均对调用方不可见。

**备选否决**：
- *保持两处内联、仅分别修 bug*：修复须改两处、审查易漏，已在 P3-1 明确列为问题，否决。

### 决策 2：序号由 4 位升到 6 位零填充（**BREAKING**）

**决策**：`padStart(4,'0')` → `padStart(6,'0')`，格式 `INQ{YYYYMM}-{6位}`（如 `INQ202608-000001`）。新增常量 `INQUIRY_NO_SEQ_LENGTH = 6`（`packages/core/src/shared/constants/inquiry.constant.ts`），替代魔法数 `4`。

**理由**：① 4 位在定义上上限 9999，无法突破；升 6 位把单月上限抬到 999999，对本域事实上无限。② 固定 6 位零填充使 `orderBy inquiryNo desc` 的字典序**恒等于**数值序（等宽零填充的同宽字符串字典序 == 数值序），从根上消除「最大值误判」——这是比单纯修正比较更稳健的修复，因为即使比较逻辑有偏差，等宽字符串排序也已正确。③ 因规格写死 4 位，本决策为对外行为变更，已在 proposal 标 **BREAKING** 并同步 `specs/inquiry/spec.md`。

**备选否决**：
- *维持 4 位仅修比较*：上限 9999 不变，第 10000 单仍必然失败，治标不治本，否决。
- *改用 PostgreSQL 原生 SEQUENCE*：按月前缀需动态序列名（序列数量随月份膨胀），Prisma 对序列 DDL 无一等公民支持，月度重置与迁移繁琐，否决。
- *独立计数表原子自增（counter table, `UPDATE … SET seq=seq+1 RETURNING seq`）*：最彻底，从根上移除「读最大+1」竞态、可去掉 advisory lock/重试复杂度；但需新增表 + migration + 新仓储接缝，对本域月度量不可能逼近 6 位属过度设计。记录为未来选项：若真实月度量逼近 6 位再启用。

### 决策 3：序号推导改用数值比较

**决策**：以 `parseInt(inquiryNo.split('-')[1], 10)` 取当月最大序号，不再用 `slice(-4)`（后者依赖尾段固定长度，位数变化时即失效）。

**理由**：与决策 2 的固定 6 位零填充形成双保险——即便未来宽度再变，比较仍基于分隔符后的子串取数值，不依赖尾段长度。

**备选否决**：无（与决策 2 协同，非互斥选项）。

### 决策 4：保留 advisory lock + 重试作为并发接缝

**决策**：`pg_advisory_xact_lock(hashtext(candidate))` 与 P2002 重试 3 次保留在 `nextInquiryNo` 内部。

**理由**：在正确数值推导 + 固定 6 位宽度下，两个并发事务读到同一最大序号会派生同一候选，advisory 锁串行化该候选、失败方重试时重新读最大序号 +1，竞态被正确覆盖；无需替换为更强的机制。

**备选否决**：见决策 2 中对 counter table 的否决（若日后采用计数表，本锁与重试可整体移除）。

## Risks / Trade-offs

- **[BREAKING 编号格式]** → 下游消费者、导出、人工核对若依赖固定 4 位宽度会错位。缓解：proposal 已标 BREAKING 并同步规格；`inquiryNo` 列类型/唯一索引不变，仅字符串内容变宽。
- **[测试字面量漂移]** → `inquiries.service.spec.ts`（`:129`、`:156`、`:218`、`:228`、`:287`）与 `inquiry-detail-response.dto.spec.ts:38` 中的 `INQ202609-0001` 须批量更新为 6 位。缓解：列入 tasks 验证项。
- **[6 位仍非原子自增]** → 理论上仍有「读最大+1」乐观路径；但 advisory lock + 重试在正确推导下已覆盖并发冲突，且本域月度量远未及上限。若未来量逼近 6 位，按决策 2 备注启用计数表。
- **[回放/迁移数据]** → 历史 `inquiryNo` 为 4 位，新单为 6 位，混合存在不影响唯一性与排序（等宽比较仅作用于新宽度；历史 4 位记录在 `split('-')[1]` 数值比较下与新 6 位记录在同一个月不会并存，因月份前缀不同）。无数据迁移需要。

## 架构审查采纳结论（improve-codebase-architecture）

对 4 份规划件做 deepening 审查（报告：`C:\Users\Admin\AppData\Local\Temp\architecture-review-P1-1-inquiry-no.html`），用户预授权「同意推荐」，逐候选采纳如下：

- **候选 1（Strong · 合并两处内联编号块为一个 deep module）→ 采纳**：与决策 1 一致。`nextInquiryNo(tx, prefix)` 作为深模块收拢推导+锁+重试，`create` 与 `createForCustomer` 改为调用。提升 locality（缺陷集中一处）与 leverage（一处实现、N 调用点）。
- **候选 2（Worth exploring · 6 位固定宽度 + 数值比较下沉到模块接口）→ 采纳**：与决策 2/3 一致。模块接口以 `INQUIRY_NO_SEQ_LENGTH=6` 声明宽度、以 `split('-')[1]` 数值比较推导最大值；固定 6 位零填充使 `orderBy inquiryNo desc` 字典序 == 数值序，从根上消除「最大值误判」。
- **候选 3（Speculative · 计数表适配器替换乐观读最大）→ 否决（暂缓）**：采纳其推荐项「暂缓」。理由：本域月度量远未及 6 位上限（999999），引入新表 `inquiry_no_seq` + migration + 新适配器接缝属过度设计；当前 advisory lock + 重试在正确数值推导下已覆盖并发冲突。记录为**未来选项**：若真实月度量逼近 6 位，再启用计数表（届时候选 3 的 seam 已存在，`nextInquiryNo` 内部由委托计数器适配器实现，锁与重试可整体移除）。
