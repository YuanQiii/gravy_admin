## Why

同一业务域内删除语义被「机制」割裂，且存在永不为真的死条件：

- `Inquiry` 的两条删除路径机制不一致：`remove` 走集中的 `SoftDeleteService.softDelete`（`packages/domain/src/inquiry/inquiries/inquiries.service.ts:506`），而 `removeMany` 却直接 `updateMany({ data: { deletedAt: new Date() } })`（同文件 `:513-518`）。两者都是软删，但实现分叉，批量删除绕过了集中服务，未来若要在软删处加审计/唯一性诊断，需两处同步改。
- `CustomerAddress` 的删除**全部是硬删**（Mall `removeForCustomer` 走 `customerAddress.delete`：`apps/mall/src/modules/mall/addresses/customer-addresses.service.ts:127`；Admin `remove`/`removeMany` 走 `delete`/`deleteMany`：`apps/admin/src/modules/addresses/addresses.service.ts:156,160`），而 schema 仍保留 `deletedAt` 列（`prisma/schema.prisma:787`，含 `@@index([deletedAt])`）。读路径（`findMyAddresses` `:73`、`assertOwned` `:138`、`findAll` admin `:61`、`findOne` admin `:82`、`update` admin `:97`、`setDefault` admin `:130`、`remove` admin `:153`）处处检查 `deletedAt`，但硬删从不写入它——这些判断**永不为真**，是死条件。

业务审查报告 P3-2 据此要求统一删除机制并明确 `CustomerAddress` 删除语义。

## What Changes

- **Inquiry 批量删除统一走 `SoftDeleteService`**：给 `SoftDeleteService` 新增 `softDeleteMany(model, idField, ids)`（`packages/core/src/shared/services/soft-delete.service.ts`），`Inquiry.removeMany` 改为调用它，使单条与批量删除共用同一软删实现。删除语义不变（仍是置 `deletedAt`）。
- **`CustomerAddress` 明确「硬删」语义并删除 `deletedAt` 列**：从 `prisma/schema.prisma` 移除 `deletedAt` 字段与 `@@index([deletedAt])`（含迁移），并清除读写路径中全部 `deletedAt` 死条件判断。删除行为保持硬删（与 `customer/spec.md`「系统硬删该地址」一致）。
- **`InquiryLine.deletedAt` 保持不变**：它是活条件（详情读取 `where: { deletedAt: null }`，`packages/domain/src/inquiry/inquiries/inquiries.service.ts:38`），不在本变更范围。
- 迁移（删列）**需用户显式确认后执行**（仓库硬规则：未经确认不跑数据库迁移），写进 tasks。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `inquiry`：`软删除与唯一约束` Requirement 新增「单条与批量删除均经 `SoftDeleteService`」的约束与场景，统一删除机制。
- `customer`：`客户自助管理收货地址` Requirement 明确 `CustomerAddress` 为硬删、无 `deletedAt` 软删语义、读路径不检查 `deletedAt`（原「客户删除默认地址」场景「系统硬删该地址」保持不变，并补强语义）。

## Impact

- `packages/core/src/shared/services/soft-delete.service.ts`：新增 `softDeleteMany` 方法（interface 扩展，不影响既有 9 个调用方）。
- `packages/domain/src/inquiry/inquiries/inquiries.service.ts`：`removeMany` 改调 `softDeleteMany`。
- `apps/mall/src/modules/mall/addresses/customer-addresses.service.ts`：移除 `findMyAddresses`/`assertOwned` 中的 `deletedAt` 死条件。
- `apps/admin/src/modules/addresses/addresses.service.ts`：移除 `findAll`/`findOne`/`update`/`setDefault`/`remove` 中的 `deletedAt` 死条件。
- `prisma/schema.prisma`：`CustomerAddress` 移除 `deletedAt` 字段与 `@@index([deletedAt])`；生成一次 `DROP COLUMN` 迁移（需确认）。
- 依赖 P0-2（`openspec/changes/snapshot-inquiry-shipping-address/`）：保留 `Inquiry.shippingAddress → CustomerAddress` 的 `onDelete: SetNull`；本变更硬删语义与之自洽（硬删触发 `SetNull`，快照兜住地址信息），详见 design.md Context。
