## Why

后台 `JwtStrategy`（`packages/core`）对「缺 `realm` 声明的旧后台 token」保留一次性放行兼容（ADR 0010 D5），这是唯一未用显式 realm 断言封闭的两域互斥窗口：任何被签发的无 `realm` token 仍可进后台，与「customer token 不得打后台接口」的隔离契约（`customer/auth` spec）不一致。需要在其收尾时机收紧为强制 `realm === 'user'`，消除巧合防线。

## What Changes

- 后台 `JwtStrategy.validate`（[jwt.strategy.ts](file:///c:/Project/gvray/packages/core/src/core/strategies/jwt.strategy.ts#L33-L35)）：把「`payload.realm && payload.realm !== AUTH_REALM_USER` 拒」收紧为「`payload.realm !== AUTH_REALM_USER` 即拒」，即**缺** **`realm`** **的 token 也拒绝**，移除一次性兼容窗口。

- 后台 token 签发侧确认始终携带 `realm: AUTH_REALM_USER`（[auth.service.ts](file:///c:/Project/gvray/apps/admin/src/modules/auth/auth.service.ts#L706) 已带；核对无其它签发路径漏带 realm）。

- 同步更新 `customer/auth` spec 的「独立客户令牌与认证域隔离」需求：后台侧对非 `user` realm（含缺失 realm）的 token SHALL 显式拒绝。

- **BREAKING**：存量**无** **`realm`** **声明的后台 access token** 将不再被后台 `JwtAuthGuard` 接受，需在部署前重新签发。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `customer/auth`: 更新「独立客户令牌与认证域隔离」需求——后台侧对非 `user` realm 的 token 由「缺 roleKeys 间接拒绝 + 缺 realm 兼容放行」改为「realm !== 'user'（含缺失）一律显式拒绝」，移除旧 token 兼容窗口。

## Impact

- 代码：`packages/core/src/core/strategies/jwt.strategy.ts`（后台 JWT 校验）。

- 依赖方：`apps/admin`（`JwtAuthGuard`）——存量后台 token 兼容被移除；`apps/mall` 无影响（customer token 本就要求 `realm === 'customer'`）。

- 文档：`customer/auth` spec 增量；ADR 0011 后果项据此闭环。

- 部署注意：发布前须让存量后台会话重新登录（token 轮换），否则旧 token 立即 401。

<br />
