## Why

管理端 `create` 把 `dto.shippingAddressId` 经 `...rest` 原样透传给 Prisma，**既不校验地址存在、也不校验是否属于 `dto.customerId`**：可写入任意客户的地址 ID，传入不存在的 ID 时由数据库外键兜底抛出 **500**（证据 `packages/domain/src/inquiry/inquiries/inquiries.service.ts:93-112` 的 `...rest` 透传、`apps/admin/src/modules/inquiry/inquiries/inquiries.controller.ts:53-59` 的 `POST` 端点仅持 `INQUIRY_PERMISSIONS.CREATE`、无归属校验）。客户路径 `createForCustomer` 虽有归属校验，但位于 `$transaction` **之前**（`inquiries.service.ts:159-167`），校验通过到写入之间地址若被删除将被 `onDelete: SetNull` 静默吞掉（TOCTOU，证据 `prisma/schema.prisma:694`）。

并行变更 `snapshot-inquiry-shipping-address`（P0-2）已把客户路径的归属校验收进事务内的私有接缝 `resolveShippingSnapshot(tx, addressId, ownerCustomerId?)`，并把管理端调用写成 `(tx, dto.shippingAddressId, null)`（刻意不校验、预留 `ownerCustomerId` 参数位，注释声明「P2-4 将改为传 `dto.customerId`」）。本变更**建立在该接缝之上**，补完 P0-2 尚未覆盖的部分：管理端归属校验、`customerId` 为空时的语义、以及 DTO 层跨字段约束。

## What Changes

- 管理端 `create` 在 `$transaction` 内（与编号/主体同一事务）调用 P0-2 的 `resolveShippingSnapshot(tx, dto.shippingAddressId, dto.customerId)`：地址**必须存在、未软删、且 `address.customerId === dto.customerId`**，否则返回 **400 `INVALID_SHIPPING_ADDRESS`**，不再以 500 FK 错误暴露。**BREAKING**：原先传入不存在/他人地址 ID 会得到 500，现改为 400（错误码与状态码语义更正，非契约字段变更）。
- `CreateInquiryDto`（`packages/domain/src/inquiry/inquiries/dto/create-inquiry.dto.ts:25-53`）新增跨字段约束：**`shippingAddressId` 非空 ⇒ `customerId` 非空**（class-validator 类级自定义约束，失败 400）。
- 明确「`customerId` 为空 + `shippingAddressId` 非空」语义为**拒绝（400）**：地址由某客户拥有，收货地址必须属于该询价单的 `customerId`；无客户时归属无法成立，且放行会把他人地址挂到空客户单上。该语义与「匿名询价（`customerId` 与 `shippingAddressId` 均为空）合法」不冲突。
- 客户自助路径**不改动**：其归属校验已由 P0-2 移入事务内 seam（传 `customerId`），行为与本变更一致，不重复实现。
- **不纳入**：P0-2 的快照 7 字段、迁移、`resolveShippingSnapshot` 本身的引入——这些由 P0-2 负责，本变更只消费该接缝。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `inquiry`：修改「询价单创建」要求（新增 `shippingAddressId`/`customerId` 跨字段约束场景），新增「管理端询价单收货地址归属校验」要求（事务内归属校验、400 而非 500）。

## Impact

- 代码：`packages/domain/src/inquiry/inquiries/inquiries.service.ts`（`create` 管理端路径的 `resolveShippingSnapshot` 调用实参由 `null` 改为 `dto.customerId`）；`packages/domain/src/inquiry/inquiries/dto/create-inquiry.dto.ts`（新增类级 `@Validate` 约束 + 约束实现类）。
- 权限/路由：`apps/admin/src/modules/inquiry/inquiries/inquiries.controller.ts` 的 `POST` 端点与 `INQUIRY_PERMISSIONS.CREATE` **不变**。
- 依赖：必须先落地 `openspec/changes/snapshot-inquiry-shipping-address`（提供 `resolveShippingSnapshot` seam）。若 P0-2 未落地，本变更需自行引入等价 helper（见 design.md 决策 1 与 tasks）。
- 测试：单测需覆盖管理端错挂他人地址、地址不存在（断言 400 而非 500）、仅传地址不传客户（DTO 400）。
