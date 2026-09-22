# apps/mall — Mall 应用（商城端）

> 本文件是本包的**增量**约定：只写本包特有、根 [AGENTS.md](../../AGENTS.md) 没有的内容。全局硬规则、Gate、文档路由表都在根文件——本文件不复述，也不另立路由表。

## 本包是什么

商城端 NestJS 应用。**纯后端 API，没有前端页面**——客户界面在本仓之外（微信生态为主，故有 `access_token` / `refresh_token` 与 code2session）。入口 `src/main.ts`。

- `src/modules/` —— `mall/`（浏览 / 收藏 / 询价）、`customer-auth/`（登录 / 令牌 / 微信静默登录）、`customer-activity/`（浏览历史）。
- `src/core/` —— 客户认证基础设施：`guards/{customer-jwt,optional-customer}.guard.ts`、`decorators/{current-customer,client-info}.decorator.ts`、`strategies/customer-jwt.strategy.ts`。

## 本包的额外约定

- **认证装饰器**：客户自助端点用 `CustomerJwtGuard`；匿名与登录都能访问的端点用 `OptionalCustomerGuard`。当前客户身份一律 `@CurrentCustomer()`，**不接受请求体或查询参数里的显式 `customerId`**。
- **身份域隔离**：`Customer` 与后台 `User` 是两套独立身份（ADR 0002、0009）。本端只认客户 token，后台 token 进不来、反之亦然；两域共用同一签名密钥（ADR 0011）。
- **浏览可见性**：一律走 `BaseService.applyVisibility` 的三分流（`anonymous` / `b2c` / `admin`）。非 `enabled` 的记录对 B2C **返回 404 而不是 403**——不暴露记录是否存在。新增浏览端点时不要绕开它自己写 `where status`。
- **本端不注册三个横切**：`OperationLogInterceptor` / `FeatureFlagGuard` / `PermissionsGuard`（`src/app.module.ts` 顶部注释即此约定）。改动横切时不要顺手把它们加进来。
- **负向契约（最容易被无声突破的一条）**：本端**不提供**客户自助注册，也**不提供**改密端点。这不是"还没做"，而是产品事实——它由 `modules/customer-auth/public-routes.ts` 与 `customer-auth.routes.spec.ts` 表驱动强制：`/auth` 下已注册路由必须**恰好等于**清单。**若确需开放，请新立变更并同步清单、规格与 ADR，而不是删断言。**
- **端口**：本端与 Admin 在本地默认都是 3000。同时起两个应用需 `PORT=3001 pnpm start:mall:dev`；`pnpm docker:dev:up` 用 `MALL_PORT`（默认 3001）区分。

## 本包对全局规则的显式例外

- 全局规则要求"受保护接口默认 `@UseGuards(AccessGuard)`"：**本端不适用**。`AccessGuard` 是后台 `User` 域的编排器；客户侧一律走 `CustomerJwtGuard` 系列（可选认证用 `OptionalCustomerGuard`）。
