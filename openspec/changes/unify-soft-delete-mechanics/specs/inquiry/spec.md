## MODIFIED Requirements

### Requirement: 软删除与唯一约束

`Inquiry` 与 `InquiryLine` SHALL 支持 `deletedAt` 软删除。单条删除与批量删除 SHALL 均经 `SoftDeleteService` 完成（统一软删机制），不得各自以不同方式设置 `deletedAt`：单条删除调用 `softDelete(model, idField, id)`，批量删除调用 `softDeleteMany(model, idField, ids)`，二者 SHALL 产生相同的 `deletedAt = now()` 软删语义。`inquiryNo` 唯一约束在数据库层面全局生效（含软删除记录）；Service 层 SHALL 在创建前校验未软删除记录无同名编号（实际由编号生成逻辑保证不会重复，因为基于当月最大序号递增）。

#### Scenario: 软删除询价单

- **WHEN** 管理员软删除询价单
- **THEN** 系统设置 `deletedAt = now()`，记录保留；查询接口不再返回该记录；`inquiryNo` 仍占位，新询价单不会复用该编号

#### Scenario: 批量软删除询价单

- **WHEN** 管理员批量软删除一组询价单（`inquiryId` 列表）
- **THEN** 系统经 `SoftDeleteService.softDeleteMany` 将列表内每条记录的 `deletedAt` 置为 `now()`，仅命中 `deletedAt` 为空的记录；删除后查询接口不再返回这些记录，且软删语义与单条删除完全一致

#### Scenario: 批量软删对已软删记录幂等

- **WHEN** 批量软删除的 `inquiryId` 列表中包含已软删（`deletedAt` 非空）的询价单
- **THEN** 系统跳过该记录（不重复置 `deletedAt`），其余记录正常软删，不抛错
