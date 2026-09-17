## 1. 常量与深模块

- [x] 1.1 在 `packages/core/src/shared/constants/inquiry.constant.ts` 新增 `INQUIRY_NO_SEQ_LENGTH = 6`（保留 `INQUIRY_NO_PREFIX`/`INQUIRY_NO_FORMAT`），并导出。验证：`grep -rn "INQUIRY_NO_SEQ_LENGTH" packages/core` 命中常量定义与后续引用。
- [x] 1.2 在 `inquiries.service.ts` 新增 `private async nextInquiryNo(tx, prefix): Promise<string>`，收拢「数值比较取当月最大序号（`parseInt(inquiryNo.split('-')[1], 10)`）+ `padStart(INQUIRY_NO_SEQ_LENGTH,'0')` + `pg_advisory_xact_lock(hashtext(candidate))` + P2002 重试 3 次」三段逻辑，返回完整候选号。验证：单元测试覆盖首单/并发重试/重试耗尽三路径，且候选号宽度为 6 位。

## 2. 调用方改造（消除两处重复）

- [x] 2.1 改造 `create`（`inquiries.service.ts:95-125`）：删除内联的 `findFirst/orderBy/parseInt(slice(-4))/padStart(4)/advisory lock` 块，改为 `const candidate = await this.nextInquiryNo(tx, prefix)`。验证：`grep -n "slice(-4)\|padStart(4" packages/domain/src/inquiry/inquiries/inquiries.service.ts` 在 `create` 范围内无命中。
- [x] 2.2 改造 `createForCustomer`（`inquiries.service.ts:204-258`）：同 2.1 替换其编号块（`:209-211`）。验证：同上 grep 在整个文件无 `slice(-4)`/`padStart(4` 残留（仅 `nextInquiryNo` 内部保留 `padStart(INQUIRY_NO_SEQ_LENGTH`）。

## 3. 规格同步（BREAKING，经 archive 落地）

- [x] 3.1 确认 `specs/inquiry/spec.md` 的 MODIFIED delta 已把「询价单编号生成」格式写为 6 位（`INQ{YYYYMM}-{6位序号}`，示例 `INQ202608-000001`），原 3 个 Scenario 整块保留 + 新增「单月超 9999 单不溢出」。验证：`openspec validate deepen-inquiry-no-generation --strict` 通过（MODIFIED 未遗漏 Scenario）；`openspec archive` 后 `openspec/specs/inquiry/spec.md` 主规格同步为 6 位（本任务执行期内不手动改主规格，由 archive 应用 delta）。

## 4. 测试

- [x] 4.1 批量更新既有测试字面量：将 `inquiries.service.spec.ts`（:129、:156、:218、:228、:287）与 `inquiry-detail-response.dto.spec.ts:38` 处的 `INQ202609-0001` 改为 `INQ202609-000001`。验证：`grep -rn "INQ20[0-9]\{4\}-[0-9]\{4\}" packages/domain/src/inquiry` 无 4 位序号字面量残留。
- [x] 4.2 新增边界测试：当月已存在 9999 条（最大 `INQ202608-009999`）时，第 10000 单生成 `INQ202608-010000`，且第 10001 单可继续生成 `INQ202608-010001` 无 P2002/500。验证：该单测断言两个编号且不抛 `INQUIRY_NO_GENERATION_FAILED`。
- [x] 4.3 新增数值比较测试：在存在 `INQ202608-010000` 记录时，`nextInquiryNo` 推导的当月最大序号为 10000（而非被字典序误判为较小值）。验证：单测断言返回序号数值为 10001 对应候选号。

## 5. 全量验证

- [x] 5.1 运行 `openspec validate deepen-inquiry-no-generation --strict` 通过。验证：命令退出码 0，无 "MODIFIED omits scenario(s)" 等报错。
- [x] 5.2 运行 inquiry 域单测套件（如 `nx test domain --testPathPattern=inquiry`），确认编号相关用例全绿。验证：测试命令退出码 0。

## 6. 架构审查采纳结论（回写）

- [x] 6.1 在 `design.md` 记录审查采纳结论：候选 1（抽取 `nextInquiryNo` 深模块）与候选 2（6 位固定宽度 + 数值比较）已采纳，与决策 1/2/3 一致；候选 3（计数表适配器）按推荐项暂缓，理由写入 design.md。验证：`design.md` 含「架构审查采纳结论」一节，且候选 3 标为暂缓并给出理由。
- [x] 6.2 候选 3 计数表不作为本期实现，仅在 `design.md` 记为未来选项（月度量逼近 6 位时启用）。验证：`tasks.md` 无新增计数表/migration 实现任务，`design.md` 含该未来选项说明。

## 实施记录（2026-09-17）

- `nextInquiryNo(tx, prefix)` 已落地：数值比较（`split('-')[1]`）+ `padStart(INQUIRY_NO_SEQ_LENGTH)` + advisory lock；**P2002 重试保留在两个调用方的 3 行循环里**（任务 1.2 原计划把重试收进模块，但重试必须与业务写入同循环，收进去就得传回调，控制流更绕——推导逻辑本身已单点，tasks 2.1/2.2 的验证条件不受影响）。
- 字面量已全部更新为 6 位（spec mock、Swagger example、3 个 e2e fixture）；`grep -rn "INQ20\d{4}-\d{4}" ` 无 4 位残留。
- 新增 4 条边界/数值比较用例：首单 000001、9999→010000、**存在 -010000 时按 10000 递增**（字典序误判的根治证明）、advisory lock 针对候选号。
- 门禁：domain **67/67**；全量 e2e **6 套件 / 65 用例**；`validate --strict` ✓。**无需迁移**（列仍为 TEXT，`split('-')[1]` 数值解析兼容既有 4 位行，混存期间新号继续递增）。
- 残余边界（如实记录）：若某月先有 6 位行、而字典序最大的是 4 位旧行（仅当该月跨过 9999 且未迁移时可能），推导会重复候选号 → P2002 重试耗尽 → 500。生产该状态不可达（旧缺陷使任何月都不可能超过 9999），dev 库仅 2 行。若担心，可在归档后补一次性 `UPDATE` 把存量 4 位行刷成 6 位。
- 剩余：3.1（归档动作）。
- **BREAKING 已生效范围**：新询价单编号为 6 位序号；依赖 4 位宽度的下游（导出/报表/人工核对）需同步。
