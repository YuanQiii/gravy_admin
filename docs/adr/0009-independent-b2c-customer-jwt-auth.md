# ADR 0009: 独立 B2C Customer JWT 认证域

- 状态：已接受

- 日期：2026-09-07

- 关联：ADR 0002（独立 Customer 模型）、CONTEXT.md 词条 `Customer`/`Anonymous Visitor`、`customer-activity` 域

## 背景

`Customer` 自 ADR 0002 起独立于后台 `User`，但 CONTEXT.md 中 Customer 的登录被标记为「future（自注册或微信 OAuth）」。滤清器 B2C 浏览接口（`equipment/filters` GET）是 `@Public()`、仅按 `visibility`（anonymous）过滤，无需登录。

现有 `customer-activity`（收藏/历史）接口在 [favorites.controller.ts](file:///c:/Project/gvray/src/modules/customer/customer-activity/favorites.controller.ts) 中由**后台管理员显式传** **`customerId`** 拼装，并非 B2C 客户自助操作的登录态。这割裂了 B2C 语义：客户的活动数据与客户身份脱钩，无法承载「该客户收藏了什么」。

需求：给滤清器 B2C 业务补登录态，使客户能以 `Customer` 身份登录并取回自己的收藏/历史，同时提供开发环境测试账号。

## 决策

新建**独立的 B2C Customer JWT 认证域**，与后台 `User` 认证域（`auth/*` + `JwtAuthGuard`）完全隔离：

- 新增端点（`POST customer/auth/login` / `refresh` / `logout`）：

  - 登录凭证为 **username / email / phoneNumber 任一 + 密码**（三者均为 Customer 上的唯一字段）。

  - 登录成功返回独立 access + refresh token，JWT payload 携带 `customerId`（与后台的 `userId` 明确区分）。

- **会话/令牌存储**：抽**纯 Redis 的** **`SessionStore`** **深接缝**（`store/verify/revoke(subjectId, token, meta, ns)`，不知道 User/Customer、不碰 Prisma）。后台 `TokenService` 与新 `CustomerTokenService` 均为其薄适配器：前者沿用 `user` 命名空间并**保留** `prisma.refreshToken` DB 归档，后者用 `customer` 命名空间、纯 Redis**无** DB 归档（B2C 会话为易失态）。两域 Redis key 命名空间隔离，互不污染。复用其上的 `JwtService` 签发令牌（见 D7：两域共用同一签密钥）。

- 新增 `CustomerJwtStrategy` / `CustomerJwtGuard` / `@CurrentCustomer()` 装饰器，与后台 `jwt.strategy` / `JwtAuthGuard` / `@CurrentUser()` 互不影响。

- `customer-activity`（收藏/历史）接口**改为从登录态取** **`customerId`**（`CustomerJwtGuard` + `@CurrentCustomer()`），移除显式传 `customerId` 的入参。

- **滤清器 B2C 浏览保持匿名公开**（不扩展 visibility）：登录态本期不通用于浏览，仅服务客户活动（收藏/历史）。

- 测试账号：新开 `prisma/seeds/customers.ts`，**仅** **`NODE_ENV=development`** 创建，2 条（username `customer.one` / `customer.two`，密码统一 `123456`），对齐后台测试用户约定。

## 备选方案（已否决）

- **复用后台** **`auth/*`** **认证**：后台 payload 语义（`userId`/roles/RBAC）与 Customer 无角色、无 department 的模型冲突，且会让 B2C 请求进入 `JwtAuthGuard` 的后台 RBAC 处理路径，两个身份域互相污染。

- **将 Customer 并入** **`User`**：ADR 0002 已否决，本决策不逆转；Customer 无 RBAC、无审计字段，合并需在每个 guard 特判「是否为 customer」。

- **B2C 浏览也扩展 visibility（登录后见** **`b2c`** **数据）**：本贴额外摊开滤清器浏览的可见性判定；本期测试用户与活动接口的范围不包含它，留作后续变更。

## 后果

正面：

- B2C Customer 以独立身份登录并安全取回自己的收藏/历史，语义自洽，不污染后台 RBAC。

- `JwtService`/`TokenService` 复用而非复制，刷新/登出/session 撤销能力与后台保持一致；隔离命名空间避免 key 冲突。

- 后台认证代码零侵入。

负面/风险：

- 系统同时存在**两个 JWT 认证域**，守卫必须严格区分（`CustomerJwtGuard` 只认 customer token，`JwtAuthGuard` 只认 user token），否则可能跨域放行——需在 guard 实现与测试中显式验证互斥。

- `SessionStore` 深接缝是本决心的实现前提：后台 `TokenService` 退化为薄适配器，行为与现状等价（先以现有单测固底再迁移）；realm 差异收敛在适配器，后台模块不再懂 Customer。

- **两套 JWT 校验本期不收敛**：考虑过统一到 `authenticateByRealm(token, realm)` 深接缝，但本期不迁移后台 `JwtStrategy`（避免触碰活跃后台认证），该接缝只有 Customer 一个消费者→假设接缝，违背"一个适配器=假设接缝"，故缓做；两套仅共享 `realm` 声明常量。触发条件：后台认证也迁移、出现第二个消费者。

- **后台侧对 customer token 的拒绝是隐式的（已知边界）**：en vivo 验证，customer token 打后台路由返回 401——但这依赖后台 `JwtStrategy` 要求 payload 携带 `roleKeys`+`status`，而 customer token 不带这两者（见 6.1 实测）。即后台侧**未显式校验 realm**，靠"缺 roleKeys"间接排除；customer 侧则显式要求 `realm==='customer'`。若未来 customer token 出现 `roleKeys`/`status` 字段，后台侧防线会失效。触发条件：**候选 2 把后台 JwtStrategy 迁到 `authenticateByRealm` 时，必须为后台侧加显式 `realm=='user'` 校验**——标签为安全项，勿丢。

- **两域共用同一 JWT 签密钥**（YAGNI）：便利、风险（泄密即双域失守）均被接受；触发条件：出现"客户域需单独轮换密钥"需求时改按 realm 可注入。

- 本期范围（标准登录域）不含 customer session 列表/踢设备；与后台完全对齐留作后续。

## 参考

- CONTEXT.md 词条 `Customer` / `Anonymous Visitor` / `customer-activity` 域

- ADR 0002 `Independent Customer Model`

