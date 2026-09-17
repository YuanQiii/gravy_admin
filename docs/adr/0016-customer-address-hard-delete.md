# ADR 0016: CustomerAddress 有意硬删（opt-out 软删）

- 状态：已接受
- 日期：2026-09-17
- 关联变更：`unify-soft-delete-mechanics`（Mall 业务审查问题清单 P3-2）

## 背景

`CustomerAddress` 表历史上带有 `deletedAt` 列并建有索引，但**没有任何写入路径**会
为它赋值：Mall 与 Admin 的地址删除端点自始就是硬删（`customerAddress.delete`）。
读路径上却散布着 `deletedAt IS NULL` / `address.deletedAt` 判断 ——
**永不为真的死条件**，让后来者误以为存在软删语义。

同一时期，`Inquiry` 域的单条删除走 `SoftDeleteService.softDelete`、批量删除
`removeMany` 却是裸 `updateMany` —— 同一域两套软删机制并存。

## 决策

1. **CustomerAddress 明确硬删**：删除 schema 上的 `deletedAt` 列与索引；
   删除语义唯一入口是 `CustomerAddressDeletionService`（domain）——
   `customerAddress.delete` / `deleteMany` 只允许出现在该 module 内。
   两个 adapter 对应两个不合并的信任维度：
   - `removeForOwner(customerId, addressId)`：B2C self，归属断言内聚；
   - `removeForOperator(addressId)` / `removeManyForOperator(ids)`：admin，凭权限码。
2. **Inquiry 软删统一**：`SoftDeleteService` 新增 `softDeleteMany`，
   `InquiriesService.removeMany` 改调它，消除裸 `updateMany` 分叉。
3. 读路径死条件全部清理；`ADDRESS_ACTIVE_WHERE` 常量（domain）作为地址
   可见性谓词的命名来源。

## 理由（删列 vs 真软删）

- 快照已兜住信息不丢失（ADR 0015）：询价单保存收货地址 7 字段快照，
  地址删除后履约依据仍在 —— 引用是否存活不再是数据完整性问题；
- 该列从未被写入，"真软删"意味着给一个从未有过的语义补全整套读写与
  过滤逻辑，成本为正、价值为零（YAGNI）；
- 留着死列与死条件是持续的误导源（本次审查发现它已让一处文档写错）。

## 后果

- 迁移含防御性 `DELETE`（清理潜在残留软删行，防删列复活）+ `DROP COLUMN`；
  dev 库核查命中 0 行。
- 若未来需要"可恢复的地址回收站"，是一个**新语义**，需独立评审立项，
  且应从 `CustomerAddressDeletionService` 单点接入 —— 不应悄悄加回
  `deletedAt` 列。

## 参考

- `packages/domain/src/customer-addresses/customer-address-deletion.service.ts`
- 变更：`openspec/changes/unify-soft-delete-mechanics/`
- 关联：ADR 0015（询价单收货地址快照）
