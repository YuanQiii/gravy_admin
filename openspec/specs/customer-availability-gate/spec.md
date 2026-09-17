# customer-availability-gate Specification

## Purpose
统一 B2C 客户域「客户可用性门禁」策略：所有受 `CustomerJwtGuard` 保护的写路径在 access token TTL 内一致地不校验客户可用性，使同一语义在各模块结论相同，消除「一半查一半不查」的分叉。

## Requirements

### Requirement: 受保护写路径在 TTL 内一致不校验客户可用性

系统 SHALL 仅由 `CustomerJwtGuard` + `CustomerJwtStrategy` 对客户 access token 做无状态认证（校验签名与 `realm === 'customer'`），**不**在 access token TTL 内对受保护写路径做客户可用性二次校验（即不校验客户是否存在、`status = 'enabled'`、或 `deletedAt IS NULL`）。所有受保护写路径 SHALL 行为一致：**不**执行任何 per-path 客户可用性检查；业务状态校验仅在 refresh 路径（`customer-auth.service`）发生（与 ADR 0011 决策 3 一致）。该策略 SHALL 作为单一来源记录，供未来客户域变更遵循，避免再次分叉。

#### Scenario: 软删客户在 TTL 内可发起写请求

- **WHEN** 软删客户（`deletedAt` 非空）持有的 access token 仍在 TTL 内，命中任一受保护写端点（如创建询价单、新增收藏、新增地址）
- **THEN** 请求按已认证身份被正常处理，任何写路径 SHALL NOT 因 per-path 客户可用性检查而返回 404 `CUSTOMER_NOT_FOUND`

#### Scenario: 禁用客户在 TTL 内写请求不被守卫拦截

- **WHEN** `status = 'disabled'` 客户的 access token 仍在 TTL 内，命中受保护写端点
- **THEN** `CustomerJwtGuard` 通过（守卫不查客户状态），请求进入业务层；无任何写路径因客户可用性返回拒绝，分叉消除

#### Scenario: 刷新路径仍校验可用性

- **WHEN** 客户提交 refresh token
- **THEN** `customer-auth.service` 仍校验 `status`/`deletedAt`（既有行为不变），禁用/软删客户在下次刷新即被拒，会话经 `revokeRefreshToken` 撤销

#### Scenario: 全路径无分叉

- **WHEN** 对比创建询价单、新增收藏、记录浏览、新增/改地址等受保护写路径
- **THEN** 所有路径 SHALL 均不执行 per-path 客户可用性检查，行为统一，不存在部分路径查、部分不查
