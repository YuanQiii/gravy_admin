## Why

询价单编号逻辑存在两个同源缺陷（P1-1 + P3-1）：其一，`inquiries.service.ts` 中 `create`（:95-125）与 `createForCustomer`（:204-258）两份**同构**实现各自内联「读当月最大编号 +1」并 `padStart(4,'0')`，单月超过 9999 单时序号溢出为 5 位 `10000`，且 `orderBy: { inquiryNo: 'desc' }` 是**字典序**——一旦存在 `…-10000`，字典序最大值被误判为 `…-9999`，派生出的候选号 `…-10000` 已存在，唯一约束冲突（P2002）重试 3 次后抛 `INQUIRY_NO_GENERATION_FAILED`（500），当月第 10000 单起的全部新建询价硬失败。其二，两份重复实现意味着同一修复须改两处且易漏。

## What Changes

- 抽出单一 `nextInquiryNo(tx, prefix)` **深模块**，收拢「序号推导 + advisory lock + P2002 重试」三段逻辑，供 `create` 与 `createForCustomer` 共用，消除 P3-1 两处重复（`inquiries.service.ts:100-102`、`:209-211` 内联块被替换）。
- 序号位数由 **4 位升到 6 位**并零填充 —— **BREAKING**：`INQ{YYYYMM}-{4位}` 变更为 `INQ{YYYYMM}-{6位}`（如 `INQ202608-000001`）。固定 6 位零填充使 `orderBy inquiryNo desc` 的字典序恒等于数值序，从根上修正「最大值误判」，并把单月上限从 9999 抬到 999999（对本域事实上无限）。
- 序号推导改用**数值比较**：以 `parseInt(inquiryNo.split('-')[1], 10)` 取当月最大序号（对固定 6 位零填充为双保险），不再依赖 `slice(-4)` 截断。
- capability `inquiry` 的「询价单编号生成」Requirement **MODIFIED**：格式改为 6 位，新增「单月超 9999 单」边界 Scenario（见 `specs/inquiry/spec.md`）。
- 在 `inquiry.constant.ts` 新增序号宽度常量（如 `INQUIRY_NO_SEQ_LENGTH = 6`），替代散落的魔法数 `4`，编号前缀/格式常量 `INQUIRY_NO_PREFIX`/`INQUIRY_NO_FORMAT` 保持不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `inquiry`：Requirement「询价单编号生成」——编号格式由 4 位变 6 位（**BREAKING**），新增单月超 9999 单的边界行为；其余创建/唯一性契约不变。

## Impact

- 代码：`packages/domain/src/inquiry/inquiries/inquiries.service.ts:84-127`（`create`）、`:199-211`（`createForCustomer` 编号块）改为调用 `nextInquiryNo`；`packages/core/src/shared/constants/inquiry.constant.ts` 新增序号宽度常量。
- 测试：现有 `inquiries.service.spec.ts`（`:129`、`:156`、`:218`、`:228`、`:287` 等处的字面量 `INQ202609-0001`）与 `inquiry-detail-response.dto.spec.ts:38` 需随 6 位格式更新；并补「单月第 10000 单」边界测试。
- 对外行为（**BREAKING**）：生成的 `inquiryNo` 由 4 位序号变为 6 位序号。任何依赖固定 4 位宽度的下游消费者、导出、或人工核对习惯需同步；数据库 `inquiryNo` 列仍为 `TEXT` + 全局唯一索引（无需改表结构）。
- 并发语义不变：`pg_advisory_xact_lock(hashtext(candidate))` + P2002 重试保留为并发接缝，在 6 位固定宽度下正确工作。
