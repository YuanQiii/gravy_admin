## Why

客户 access token 是无状态的（`apps/mall/src/core/strategies/customer-jwt.strategy.ts:32-37` 仅解析 JWT payload，不查 DB/Redis；ADR 0011 决策 3 已接受）。问题在于**各受保护写路径对「客户是否仍可用」的二次校验并不一致**：`packages/domain/src/inquiry/inquiries/inquiries.service.ts:144-157` 的 `createForCustomer` 查了 `customer.deletedAt` 并返回 404；而 `apps/mall/src/modules/customer-activity/customer-activity.service.ts:89-117, 215-237`（`createFavorite`/`recordView`）与 `apps/mall/src/modules/mall/addresses/customer-addresses.service.ts:51-128`（`CustomerAddressesService.*`）**完全不查**客户状态，直接凭 `customerId` 写库。同一语义（「该客户是否还能操作」）在不同模块结论分叉，且被软删/禁用客户在 TTL 内仍可累积收藏、浏览历史、地址，形成无主数据。当前「一半查一半不查」是二者中最差的状态。

## What Changes

- **BREAKING**：移除 `packages/domain/src/inquiry/inquiries/inquiries.service.ts:144-157` 中 `createForCustomer` 对 `customer.deletedAt` 的二次可用性校验（含 `select` 投影里的 `deletedAt` 字段与 `CUSTOMER_NOT_FOUND` 分支）。使所有受 `CustomerJwtGuard` 保护的写路径在 access token TTL 内**一致地不再**校验客户可用性，对齐 ADR 0011 决策 3。被软删/禁用客户在 TTL 内原本会收到 404 的「创建询价单」路径，现改为按已认证身份正常处理（受 TTL 上限约束）。
- 将「TTL 内受保护写路径一致不校验客户可用性」作为统一策略，写入 ADR 0011 决策 3 的补充说明（归档前补注记，见 tasks）。
- 明确守卫/策略层保持无状态：**不**引入每请求 DB/Redis 校验，也**不**新增 `customerId` 存在性校验（软删客户行仍在，FK 不报错，存在性校验等价于已被排除的可用性校验）。

## Capabilities

### New Capabilities
- `customer-availability-gate`: 统一客户可用性门禁策略——所有受 `CustomerJwtGuard` 保护的写路径在 access token TTL 内一致不校验客户可用性，单一来源记录该策略以消除分叉。

### Modified Capabilities
<!-- 无既有 capability 的 Requirement 发生变化；现有 `customer`、`inquiry` capability 的 Requirement 仅描述业务行为，未涉及客户可用性二次校验，故无需 MODIFIED。 -->

## Impact

- **代码**：`packages/domain/src/inquiry/inquiries/inquiries.service.ts:144-157`（移除 `customer.deletedAt` 检查）；`apps/mall/src/modules/customer-activity/customer-activity.service.ts:89-117, 215-237` 与 `apps/mall/src/modules/mall/addresses/customer-addresses.service.ts:51-128`（维持不校验，无改动）。
- **守卫/策略**：`apps/mall/src/core/strategies/customer-jwt.strategy.ts:32-37`（保持无状态，无改动）；`apps/mall/src/core/guards/customer-jwt.guard.ts`（无改动）。
- **ADR**：`docs/adr/0011-customer-authorization-model-and-security-tradeoffs.md` 决策 3（追加「TTL 内受保护写路径一致不校验客户可用性」补充说明，归档前补注记）。
- **行为影响**：被软删/禁用客户在 TTL（默认 5m）内可新建询价单（此前返回 404）；所有权模型仍阻止跨客户访问，风险仅限数据卫生。无主数据由独立清理任务处理（见 design Non-Goals）。
- **无新增依赖**：不引入 Redis/DB 校验路径，不新增包。
