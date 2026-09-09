## 1. 纯 Redis `SessionStore` 深接缝 + 双适配器

- [x] 1.1 新增 `src/core/session/session-store.service.ts`（纯 Redis，不知道 User/Customer、不碰 Prisma），小接口 `store / verify / revoke / revokeAll(subjectId, token, meta, ns)`；把 TokenService 现有的 tokenHash、rtIndex、atJti 反向索引、sessionsSet 会话逻辑迁入，key 按注入的 `ns` 取 RedisKeys 命名空间（`user`/`customer`）。单测：同一 subject 在 `user`/`customer` 两命名空间下 key 隔离、互不覆盖

- [x] 1.2 把后台 `TokenService` 退化为 `SessionStore` 的**适配器**（沿用 `user` 命名空间，revoke/批量撤销中**保留** `prisma.refreshToken` DB 归档），调用方签名不变 → 先跑现有 auth/token 单测固底，改完回归全绿

- [x] 1.3 新增 `CustomerTokenService` 适配器（`customer` 命名空间、纯 Redis、**无** DB 归档）；单测覆盖 customer realm 不写 `refreshToken` 表、与 user 命名空间互不覆盖

## 2. 客户认证基础设施（strategy / guard / decorator）

- [x] 2.0 提取 `realm` 声明常量（`'user' | 'customer'`）供两域共享，防笔误；**不**新建 `authenticateByRealm` 深接缝（本期仅一个消费者，假设接缝，D4 决定缓做）

- [x] 2.1 新建 `CustomerJwtStrategy`（校验签名 + `realm==='customer'`，产出 `ICustomer { customerId }`），并验证 `realm` 非 `customer` 的 token 校验失败（单测覆盖 401 路径）

- [x] 2.2 新建 `CustomerJwtGuard`（Passport `AuthGuard` 包装客户策略）与 `@CurrentCustomer()` 装饰器，并验证守卫注入 `request.customer.customerId`（单测覆盖：customer token 放行、user token 拒绝 401）

## 3. 客户认证域（CustomerAuthModule）

- [x] 3.1 新建 `src/modules/customer/customer-auth/`：`CustomerAuthController`（`POST customer/auth/login|refresh|logout`）、`CustomerLoginDto { identifier, password }`、`CustomerAuthService`；挂入 `CustomerModule`，验证路由注册并可通过 Swagger 看到

- [x] 3.2 `CustomerAuthService.login`：按 `username→email→phoneNumber` 顺序以 `identifier` 解析客户，bcrypt 校验密码，签发 `{ sub: customerId, realm: 'customer' }` 的 access + refresh token（复用 `JwtService` + `CustomerTokenService`），记录登录相关日志但不打印 token；任一失败统一 401、禁用/软删客户拒绝登录（单测覆盖成功与各类失败）

- [x] 3.3 `CustomerAuthService.refresh` / `logout`：复用 `CustomerTokenService` 验证/撤销客户 refresh token，无效或已撤销返回 401（单测覆盖）

## 4. 活动接口改登录态取客户

- [x] 4.1 改造 `favorites.controller.ts`：移除后台 `AccessGuard` 与显式 `customerId` 入参，改 `@UseGuards(CustomerJwtGuard)` + `@CurrentCustomer()` 取 `customerId`，幂等收藏/取消收藏仅限当前客户（验证对应请求/测试通过）

- [x] 4.2 改造 `history.controller.ts`：同上改为登录态 `customerId`，查询仅返回当前客户历史、按 `visitedAt` 降序分页（验证分页与隔离测试通过）

## 5. 测试账号 seed

- [x] 5.1 新建 `prisma/seeds/customers.ts`（`seedCustomers`），仅 `NODE_ENV==='development'` 创建 2 条（`customer.one` / `customer.two`，bcrypt `123456`），并在 `prisma/seed.ts` 主流程接线；运行 `pnpm prisma:seed`（dev 库）验证两账号 upsert 正确、密码可登录

- [x] 5.2 确认 seed 在生产路径不受影响（customer seed 受 dev 环境开关保护），构建无报错（`pnpm build` 通过）

## 6. 端到端与文档同步

- [x] 6.1 端到端验证（dev 环境）：`customer.one/123456` 登录 → 携带 access token 收藏/取消收藏/查历史成功；`customer.two` 无法查看 `customer.one` 的历史；user token 访问活动接口 401、customer token 访问后台接口 401

- [x] 6.2 同步相关文档（AGENTS 规约：接口/配置/部署变更同步文档）：确认 ADR 0009、CONTEXT.md 与实现一致（含 SessionStore/候选2缓做/共用 secret 的记录）；如引入 env 配置项，更新 `.agents/project/configs.md` 与 `.env.example`

## 7. 收尾

- [x] 7.1 运行 `pnpm test`（或受影响模块单测）全绿，`pnpm build` 通过，更新 tasks 勾选状态为完成

- [x] 7.2 将「后台 JWT 校验收敛到 `authenticateByRealm` 深接缝」（候选 2 缓做）与「按 realm 拆分 JWT secret」（候选 3 触发条件）记为后续项，避免未来架构审查重复建议

