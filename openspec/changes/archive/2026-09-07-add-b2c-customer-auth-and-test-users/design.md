## Context

见 proposal.md（Why/What）与 specs（行为契约）。当前 `TokenService`（[token.service.ts](file:///c:/Project/gvray/src/modules/auth/token.service.ts)）深度耦合后台 `User`：Redis key 走 `RedisKeys.auth.*`、会话归档写 `prisma.refreshToken`（后台 User 外键表）、方法签名以 `userId` 为主语。后台 `JwtStrategy` 校验 `sub`/`roleKeys`/`status` 并产出 `IUser`。B2C `Customer` 无角色、无 `refreshToken` 表。

## Goals / Non-Goals

**Goals:**

- 在不动后台认证现状的前提下，为 B2C `Customer` 建立独立 JWT 认证域（login/refresh/logout）。

- 复用 `JwtService` 与 `TokenService` 的会话/刷新逻辑，通过**命名空间**实现与后台会话隔离。

- 客户 token 与后台 token **严格互斥**（payload 带 `realm` 声明，双 guard 互不认）。

- `customer-activity`（收藏/历史）改由 `@CurrentCustomer()` 从登录态取客户。

**Non-Goals:**

- 不新增 customer session 列表/踢设备接口；本期仅标准域（login/refresh/logout）。

- 不改变滤清器 `equipment/filters` 浏览的匿名可见性。

- 建立 Customer 数据模型之外的新表（B2C 会话不落 `refreshToken` 表）。

## Decisions

### D1. 独立 `customer/auth` 认证域 + `realm` 声明

新增 `CustomerAuthModule`（挂到 `CustomerModule`），路由 `customer/auth`。客户 token payload：`{ sub: customerId, realm: 'customer', jti }`；后台不改（仍 `{ sub: userId, realm: 'user', ... }`）。`realm` 声明是两域互斥的最后一道闸——后台 `JwtStrategy` 拒绝 `realm === 'customer'`，客户 `CustomerJwtStrategy` 要求 `realm === 'customer'`，任一判定逻辑都会挡掉对方 token。

> 备选：payload 不加 `realm`，仅靠子/否则误放行→已在 ADR 0009 列为风险，`realm` 声明是显式防线。

### D2. 抽纯 Redis `SessionStore` 深接缝，后台 `TokenService` 与新 `CustomerTokenService` 均为薄适配器

把当前散在 `TokenService` 里的 Redis 会话逻辑（`storeRefreshToken` / `verifyRefreshToken` / revoke 系列的 tokenHash、rtIndex、atJti 反向索引、sessionsSet）下沉为一个**纯 Redis** 的 `SessionStore`：小接口 `store / verify / revoke / revokeAll`，签名以通用 `subjectId` + `token` + 元信息 + **命名空间(ns)** 为准，**不知道** User/Customer、不碰 Prisma。两个身份各用一个**薄适配器**：

- 后台 `TokenService`：适配 `SessionStore`（沿用 `user` 命名空间），并在 revoke/批量撤销中**保留** `prisma.refreshToken` DB 归档（那是后台会话审计，不属会话存储）。

- 新增 `CustomerTokenService`：适配 `SessionStore`（`customer` 命名空间），纯 Redis、**无 DB 归档**（B2C 会话为易失态，ADR 0009 已记）。

> 这是本次 review 的加深决定：既有"给 TokenService 每个方法加 `realm?`"会让接口变宽、并把 Customer 知识（"无 refreshToken 表→跳过归档"）泄漏进后台模块；改深接缝后 realm 差异收敛在薄适配器、后台模块不再懂 Customer，且后台行为不变（调用方不感知）。两个真实消费者（User、Customer）→ 接缝成立。
> 备选 A（否决）「完全独立 CustomerTokenService 含 Redis 逻辑」：复制会话逻辑，浅、违背复用。
> 备选 B（否决）「realm 参数化」：接口变宽 + 后台模块懂 Customer（本次 review 推翻的初版 D2）。

### D3. 登录凭证单一字段 `identifier`

`POST customer/auth/login` DTO 为 `{ identifier, password }`。Service 按 `username → email → phoneNumber` 顺序在 `Customer` 中解析 `identifier`（三者均为唯一索引），找到则校验 bcrypt 密码。任一步失败统一 401、话术一致（不泄露哪个凭证/字段错）。客户 `status !== 'enabled'` 或 `deletedAt` 非空拒绝登录。

> 备选：DTO 暴露 `username?/email?/phoneNumber?` 三字段——违背 specs「任一字段」且易造成同时传多字段的歧义；单一 `identifier` 语义更干净。

### D4. `CustomerJwtStrategy` / `CustomerJwtGuard` / `@CurrentCustomer()`（薄适配器，不新建认证深接缝）

- `CustomerJwtStrategy`：注册命名策略（独立于后台），用 `JwtService` 校验签名与 `realm==='customer'`，产出 `ICustomer { customerId }`。

- `CustomerJwtGuard`：复用 Passport `AuthGuard` 包装该策略，供活动接口 `@UseGuards(CustomerJwtGuard)`。

- `CustomerAuthController` 对 login/refresh/logout 开放（login/refresh 匿名可访问），logout 受 `CustomerJwtGuard` 保护。

- `@CurrentCustomer()` 从 `request.customer.customerId` 注入。

> **本 review 的加深决定（候选 2：暂不收敛两套 JWT 校验）**：考虑过把两套 strategy/guard/decorator 收敛到一个 `authenticateByRealm(token, realm)` 深接缝。但本期**不迁移后台** **`JwtStrategy`**（避免触碰活跃后台认证），则 `authenticateByRealm` 只有一个消费者（Customer）→ **假设接缝**，违背"一个适配器=假设接缝"原则。故本期不建该深接缝，两套保持薄实现，仅共享 `realm` 声明常量（防笔误）；待后台认证也迁移、出现第二个消费者时再收敛。事后记入 CONTEXT/ADR 供后续触发。

### D5. 活动接口改登录态取客户

`favorites.controller.ts` / `history.controller.ts`：去掉后台 `AccessGuard` 与显式 `customerId` 入参，改 `@UseGuards(CustomerJwtGuard)` + `@CurrentCustomer() customerId`。Service 传客户侧真实语义（幂等收藏/upsert 历史/取消收藏仅限当前客户）。

### D6. 测试账号 seed

`prisma/seeds/customers.ts` 导出 `seedCustomers(prisma)`，仅 `NODE_ENV==='development'` 执行，upsert 2 条（`customer.one` / `customer.two`，bcrypt `123456`，分别覆盖不同 `nickName`），并在 `prisma/seed.ts` 主流程接线。密码不落明文日志（遵循项目脱敏规约）。

### D7. 两域共用同一 JWT secret（本期不拆，记录原因）

`customer/auth` 与后台 `auth/*` 共用 `JwtModule` 与同一签密钥（`jwt.secret`）。便利：仅一套密钥轮换/配置。风险：客户/后台 token 同钥，泄密即双域失守、隔离弱化。**本期保持共用**（YAGNI：无第三个身份、密钥未到期、无独立轮换需求）；若将来出现"客户域需单独轮换密钥"，把签名密钥做成按 realm 可注入再拆，记入 ADR 供触发。

## Risks / Trade-offs

- \[SessionStore 下沉触及后台会话逻辑] → `TokenService` 退化为适配器后行为须与现状逐字节等价；移入前先用现有 auth/token 单测固底，改完回归全绿。

- \[两 JWT 域混淆 / 误放行] → 显式 `realm` 声明 + 双 guard 互斥；单测覆盖「customer token 打后台接口=401」「user token 打客户接口=401」。

- \[B2C 会话无 DB 归档，Redis 丢失即全量登出] → 易失态可接受（B2C 纯 Redis 会话），日志明确。

- \[identifier 走 username/email/phone 解析顺序] → 三个字段全局唯一（含软删约束），冲突面小；解析顺序在 DTO 层注释固化。

- \[两套 JWT 校验暂不收敛（D4）] → 后台不迁移换取零风险，但短期保留两套薄判定；已记 CONTEXT/ADR，待出现第二消费者时收敛。

- \[两域共用 secret（D7）] → 运维便利 vs 隔离弱化的取舍；本期接受并记录，触发条件已写明。

## Migration Plan

- 无 schema 变更（复用 Customer 既有字段）。无数据迁移。

- 部署：抽 `SessionStore`（`TokenService` 退化为适配器、行为不变）→ 新增 `CustomerTokenService` 与 `customer-auth` 子模块 → 活动接口切换 guard → seed 接线。可分步灰度：先合 auth 域，再切活动接口。

- 回滚：活动接口切回 `AccessGuard` 显式传参即可；customer token 不与后台混用，不影响后台登录。

## Open Questions

- 无（本期范围在 grilling 阶段已收敛；刷新令牌是否轮换：默认随后台一致，不轮换，作为任务内实现细节即可）。

