## 1. 常量与深模块

- [ ] 1.1 在 `packages/core/src/shared/constants/inquiry.constant.ts` 新增 `INQUIRY_NO_SEQ_LENGTH = 6`（保留 `INQUIRY_NO_PREFIX`/`INQUIRY_NO_FORMAT`），并导出。验证：`grep -rn "INQUIRY_NO_SEQ_LENGTH" packages/core` 命中常量定义与后续引用。
- [ ] 1.2 在 `inquiries.service.ts` 新增 `private async nextInquiryNo(tx, prefix): Promise<string>`，收拢「数值比较取当月最大序号（`parseInt(inquiryNo.split('-')[1], 10)`）+ `padStart(INQUIRY_NO_SEQ_LENGTH,'0')` + `pg_advisory_xact_lock(hashtext(candidate))` + P2002 重试 3 次」三段逻辑，返回完整候选号。验证：单元测试覆盖首单/并发重试/重试耗尽三路径，且候选号宽度为 6 位。

## 2. 调用方改造（消除两处重复）

- [ ] 2.1 改造 `create`（`inquiries.service.ts:95-125`）：删除内联的 `findFirst/orderBy/parseInt(slice(-4))/padStart(4)/advisory lock` 块，改为 `const candidate = await this.nextInquiryNo(tx, prefix)`。验证：`grep -n "slice(-4)\|padStart(4" packages/domain/src/inquiry/inquiries/inquiries.service.ts` 在 `create` 范围内无命中。
- [ ] 2.2 改造 `createForCustomer`（`inquiries.service.ts:204-258`）：同 2.1 替换其编号块（`:209-211`）。验证：同上 grep 在整个文件无 `slice(-4)`/`padStart(4` 残留（仅 `nextInquiryNo` 内部保留 `padStart(INQUIRY_NO_SEQ_LENGTH`）。

## 3. 规格同步（BREAKING，经 archive 落地）

- [ ] 3.1 确认 `specs/inquiry/spec.md` 的 MODIFIED delta 已把「询价单编号生成」格式写为 6 位（`INQ{YYYYMM}-{6位序号}`，示例 `INQ202608-000001`），原 3 个 Scenario 整块保留 + 新增「单月超 9999 单不溢出」。验证：`openspec validate deepen-inquiry-no-generation --strict` 通过（MODIFIED 未遗漏 Scenario）；`openspec archive` 后 `openspec/specs/inquiry/spec.md` 主规格同步为 6 位（本任务执行期内不手动改主规格，由 archive 应用 delta）。

## 4. 测试

- [ ] 4.1 批量更新既有测试字面量：将 `inquiries.service.spec.ts`（:129、:156、:218、:228、:287）与 `inquiry-detail-response.dto.spec.ts:38` 处的 `INQ202609-0001` 改为 `INQ202609-000001`。验证：`grep -rn "INQ20[0-9]\{4\}-[0-9]\{4\}" packages/domain/src/inquiry` 无 4 位序号字面量残留。
- [ ] 4.2 新增边界测试：当月已存在 9999 条（最大 `INQ202608-009999`）时，第 10000 单生成 `INQ202608-010000`，且第 10001 单可继续生成 `INQ202608-010001` 无 P2002/500。验证：该单测断言两个编号且不抛 `INQUIRY_NO_GENERATION_FAILED`。
- [ ] 4.3 新增数值比较测试：在存在 `INQ202608-010000` 记录时，`nextInquiryNo` 推导的当月最大序号为 10000（而非被字典序误判为较小值）。验证：单测断言返回序号数值为 10001 对应候选号。

## 5. 全量验证

- [ ] 5.1 运行 `openspec validate deepen-inquiry-no-generation --strict` 通过。验证：命令退出码 0，无 "MODIFIED omits scenario(s)" 等报错。
- [ ] 5.2 运行 inquiry 域单测套件（如 `nx test domain --testPathPattern=inquiry`），确认编号相关用例全绿。验证：测试命令退出码 0。

## 6. 架构审查采纳结论（回写）

- [ ] 6.1 在 `design.md` 记录审查采纳结论：候选 1（抽取 `nextInquiryNo` 深模块）与候选 2（6 位固定宽度 + 数值比较）已采纳，与决策 1/2/3 一致；候选 3（计数表适配器）按推荐项暂缓，理由写入 design.md。验证：`design.md` 含「架构审查采纳结论」一节，且候选 3 标为暂缓并给出理由。
- [ ] 6.2 候选 3 计数表不作为本期实现，仅在 `design.md` 记为未来选项（月度量逼近 6 位时启用）。验证：`tasks.md` 无新增计数表/migration 实现任务，`design.md` 含该未来选项说明。
