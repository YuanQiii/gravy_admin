## Why

询价单状态流转是「先读状态、再校验、最后按 `inquiryId` 无条件写入」三步，其中 `update` 的 `WHERE` **不带当前状态前置条件**、两次调用也不在同一事务内（`packages/domain/src/inquiry/inquiries/inquiries.service.ts` 的 `transitionForCustomer` 与 admin `updateStatus`）。因此并发 `submit` 与 `cancel` 交错时，两边都能通过校验，后写入者覆盖先写入者，最终可能得到 `status = "submitted"` 且 `cancelledAt ≠ null` 的**自相矛盾状态**——时间戳与状态互斥这条不变量没有任何一层在保护它。后果不只是"数据不一致"：下游按 `status` 判断业务动作（"仅 submitted 可报价"）会得到错误结论，且 `submittedAt`/`cancelledAt` 作为审计事实不可信。

## What Changes

- 状态流转改为**条件写入**：`updateMany({ where: { inquiryId, status: <读取到的当前状态>, deletedAt: null }, data })`，随后断言影响行数 `=== 1`；为 `0` 时重读归因——行不存在或已软删 → 404，否则 → 409。校验与写入合并为单一原子语句，读写间隙不再存在。
- **不引入乐观锁版本列、不加显式事务、不用 `SELECT … FOR UPDATE`**：条件写入已是单条 SQL，成本最低且不改变表结构。
- 两条流转路径（客户 `submit`/`cancel`、后台 `updateStatus`）共用**同一个**私有流转执行接缝；「目标状态 → 时间戳字段」的派生收成一个纯函数，与 `INQUIRY_STATUS_TRANSITIONS` 同址，使"状态机规则"与"状态对应的字段副作用"只有一份真值。
- 并发失效更新统一返回 409，**复用**既有错误码 `INQUIRY_INVALID_STATUS_TRANSITION`，不新增错误码（客户端无需新增分支）。
- 同步修正一处既有规格漂移：`openspec/specs/inquiry/spec.md` 的「询价单状态只读约束」声称 B2C 不提供状态流转，而 ADR 0014 已引入客户 `POST /inquiries/:id/submit` 与 `/cancel`。本变更把它按实际行为改写为「客户提交与取消权限边界」。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `inquiry`: 「询价单状态流转」——补充原子性、并发失败语义，以及「状态与时间戳必须一致」的可断言约束；「询价单状态只读约束」——重命名为「客户提交与取消权限边界」并按 ADR 0014 的实际能力改写。

## Impact

- **代码**：`packages/domain/src/inquiry/inquiries/inquiries.service.ts`（`transitionForCustomer`、`updateStatus` 改为薄适配器 + 新增私有流转接缝）、`packages/core/src/shared/constants/inquiry.constant.ts`（新增状态→字段派生纯函数）。
- **接口**：Mall `POST /inquiries/:id/submit`、`POST /inquiries/:id/cancel`；Admin `PATCH /inquiry/inquiries/:id/status`。**并发失效更新从"静默写入非法态"变为 409**——这是修复而非破坏，但响应集合确实新增了一种结果，需同步 Swagger 描述。
- **数据库**：无 schema 变更、无迁移。
- **不在本次范围**：`expireDueQuoted` 的存储语义与读路径写放大（P1-3）——它对 `quoted + expiresAt` 的批量流转本身已是条件写，本变更不动它。
