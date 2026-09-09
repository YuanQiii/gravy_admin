## Why

B2C 客户（`Customer`）目前无法登录：滤清器 B2C 浏览是匿名的，`customer-activity`（收藏/历史）只能由后台管理员显式传 `customerId` 拼接，客户身份与活动数据脱钩，无法承载"该客户收藏/浏览了什么"。需要给滤清器 B2C 业务补上独立的客户登录态，让客户能以自己的身份取回收藏与历史，同时提供开发环境测试账号。

## What Changes

- 新增**独立 B2C Customer JWT 认证域**（与后台 `User` 认证域严格隔离）：
  - `POST customer/auth/login`：username / email / phoneNumber 任一 + 密码 → 返回独立 access + refresh token
  - `POST customer/auth/refresh`：刷新访问令牌
  - `POST customer/auth/logout`：退出登录并撤销会话
  - JWT payload 携带 `customerId`（与后台 `userId` 区分）
  - 复用既有 `JwtService` 与基于 Redis 的 `TokenService`，Redis key 加 `customer` 前缀隔离，不污染后台会话
- 新增 `CustomerJwtStrategy` / `CustomerJwtGuard` / `@CurrentCustomer()`，与后台 `JwtGuard`/`@CurrentUser()` 互斥。
- `customer-activity`（收藏 `PUT`/取消、浏览历史）接口**改为从登录态取 `customerId`**，移除显式 `customerId` 入参。
- 滤清器 B2C 浏览（`equipment/filters` GET）保持匿名公开，本期不扩展 visibility。
- 新增 `prisma/seeds/customers.ts`：仅 `NODE_ENV=development` 创建 2 条测试账号（`customer.one` / `customer.two`，密码 `123456`），并接入 `prisma/seed.ts` 主流程。

## Capabilities

### New Capabilities
- `customer/auth`: 独立的 B2C Customer JWT 认证——登录（任一凭证 + 密码）、刷新、登出、获取当前客户；与后台 `User` 认证域严格隔离。

### Modified Capabilities
- `customer`: 收藏管理、浏览历史管理的"当前客户"来源由后台显式 `customerId` 改为**登录态取 `customerId`**（B2C 自助语义）；其余需求不变。

## Impact

- **代码**：`src/modules/customer/`（新增 `customer-auth` 子模块；改造 `customer-activity` 从登录态取 customerId）；`src/core/`（新增 customer 认证 strategy/guard/decorator）；`src/modules/auth/token.service.ts`（命名空间化适配，非破坏）；`src/config/` 与 env（如需要 customer JWT 配置）。
- **种子**：`prisma/seeds/customers.ts` 新增；`prisma/seed.ts` 接线；`prisma/seed.ts` 主流程需在后台 seed 之外引入 customer seed。
- **文档**：ADR 0009 与 CONTEXT.md 已记录决策（本 change 关联引用）。
- **不做**：不改变滤清器 B2C 浏览的匿名可见性；不新增 customer session 列表/踢设备接口。