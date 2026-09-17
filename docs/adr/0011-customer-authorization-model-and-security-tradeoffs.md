# ADR 0011: Mall 客户域授权模型与安全取舍

- 状态：已接受

- 日期：2026-09-09

- 关联：ADR 0009（独立 B2C Customer JWT 认证域）、ADR 0010（Monorepo 双应用拆分，D5/D12）、CONTEXT.md 词条 `Customer`/`Anonymous Visitor`/`B2C Customer JWT realm`

## 背景

ADR 0009 定案了 B2C Customer 的**认证**（authentication）：独立 `customer` realm、`CustomerJwtStrategy/Guard`、纯 Redis `SessionStore`。但客户域作为**自助域**的**授权**（authorization）模型与安全取舍并未成文：哪些 guard 保护什么、客户是否引入 RBAC、token 无状态到何种程度、登出撤销边界、登录爆破防护——这些决定散落在代码注释与既有记忆里，缺乏单一权威记录。

本次审查（grill-with-docs）复核了 Mall 应用 `apps/mall` 的认证/权限实现，确认 ADR 0009/0010 的决策仍成立，并把授权模型与安全取舍落成文。

## 决策

### 1. 客户域授权 = 纯所有权模型，无 RBAC

`Customer` 不引入角色/权限码（无 RolesGuard/PermissionsGuard/permissions.constant）。授权是**纯所有权式**：受保护 Service 方法以 `customerId` 为首参做归属校验（如 `findOneForCustomer(customerId, id)`），由 `CustomerJwtGuard` + `@CurrentCustomer()` 注入身份。与后台 `User` 的 RBAC（Role+Permission）完全隔离。这一结论与 CONTEXT.md `Customer` 词条「N/A (B2C, no RBAC)」及 ADR 0009/0010 一致。

### 2. 双域共享签密钥 + realm 单点互斥

Mall 与后台共用同一 `jwt.secret`（YAGNI，ADR 0009 已接受），两端仅靠 `realm` 声明互斥：

- 客户侧 `CustomerJwtStrategy`：显式要求 `realm === 'customer'`（`isCustomerRealm`）。

- 后台侧 `JwtStrategy`（core 包）：`realm && realm !== AUTH_REALM_USER` → 拒；**缺 realm 的历史后台 token 放行**（一次性兼容，ADR 0010 D5）。

泄密即双域失守是已接受取舍；触发条件：出现「客户域需单独轮换密钥」需求时改按 realm 可注入。后台侧 realm 显式断言已就位，ADR 0009 记载的「靠缺 roleKeys 间接排除」巧合防线已替换。

### 3. Customer access token 无状态（业务状态仅刷新路径校验）

`CustomerJwtStrategy.validate` 不查 DB。被禁用/软删的客户在 access token TTL（默认 5m）内仍可调用受保护接口；`customer-auth.service` 的 `refresh` 路径会查 `customer.status`，禁用在下一次刷新即生效。无状态是已知取舍（免去每请求 DB/Redis 校验）。

> **补充说明（2026-09-17，变更 `unify-customer-availability-gate`）**：TTL 内「不校验客户可用性」是**全路径一致**的策略，不是逐路径的实现巧合——所有受 `CustomerJwtGuard` 保护的写路径（询价创建、收藏、浏览历史、地址）在 access token TTL 内**均不**校验客户可用性（存在性/`status`/`deletedAt`），业务状态仅在 refresh 路径校验。该策略的单一来源是 Mall 侧 `CustomerAvailabilityPolicy`（`apps/mall/src/core/customer-availability/`），守卫边界预置 `AvailabilityGate` 适配 seam（当前 no-op）。触发条件：出现「要求即时封禁」需求时，改为守卫层缓存校验路线（替换 `AvailabilityGate` provider 即可），届时需重新评估本决策。

### 4. 登出只撤销 refresh token

`logout` 通过 access JTI 撤销 refresh token（`CustomerTokenService`）；已签发 access token 残留至 TTL。与 access 无状态语义一致，会话语义简单；强制即时撤销需每请求查 SessionStore，本期视为过度设计。

### 5. 登录/刷新独立限流（仅 IP 级）

全局 `ThrottlerGuard` 为 1000 req/min per-IP，对暴力破解过宽。对 `login`/`refresh`/`logout` 用 `@Throttle` 设更严预算：**login 10/min、refresh 30/min**（有效客户刷新频率更高）。**不做账户级失败锁定**（连续密码错误锁账号），避免账号枚举与 DoS 面，锁账号留待未来。

## 备选方案（已否决）

- **客户引入 RBAC/角色**：客户为自助域、无后台运营角色概念，引入将把后台权限模型污染进商城，违背 ADR 0009「customer token 不带 roleKeys」与 ADR 0010「customer 自助各留各家」。触发条件：未来出现需区分的客户等级（如 VIP）时，优先考虑在 payload 加轻量 `customerLevel`，而非完整 RBAC。

- **access token 每请求查业务状态**：即时禁用/软删生效，代价是每个受保护请求多一次 DB 查询，与自助域高并发浏览目标冲突。

- **支持强制撤销 access token**：需每请求查 SessionStore/黑名单，引入 Redis 往返与复杂会话语义，与无状态目标冲突。

- **账户级失败锁定**：连续 N 次错误锁账号，抗爆破更强，但引入账号枚举风险与 Redis 复杂状态；本期仅 IP 级限流。

## 后果

正面：

- 授权模型极简且语义自洽：自助域客户无 RBAC，所有权校验由 `customerId` 参数承载，无后台权限耦合。

- 双域 realm 互斥显式化（后台侧已补显式断言），消除「customer token 伪造 roleKeys 打后台」的巧合防线窗口。

- access 无状态 + 登出只撤 refresh，会话语义简单、高并发友好。

- login/refresh 独立限流收敛爆破面，且不引入账号枚举风险。

负面/风险：

- 无状态意味着「禁用客户最多残留 5 分钟权限」「登出后 access 残留至 TTL」——均为已接受取舍，须在安全/合规场景（如要求即时封禁）重新评估。

- 后台侧「缺 realm 旧 token 放行」是一次性兼容窗口；存量后台 token 全部轮换后应收紧为强制 `realm === 'user'`（挂入 ADR 0010 D5 的收尾清单）。

- 限流仅 IP 级，分布式部署下需依赖 Redis store（现为单机内存 store 过渡版）才能跨实例收敛。

## 参考

- ADR 0009（独立 B2C Customer JWT 认证域）：认证域的现状与接缝。

- ADR 0010（Monorepo 双应用拆分）决策 5/12：双域互斥与 `authenticateByRealm` 缓做触发条件。

- 实现：`apps/mall/src/core/{strategies,guards}/`、`apps/mall/src/modules/customer-auth/`、`packages/core/src/core/strategies/jwt.strategy.ts`、`apps/mall/src/app.module.ts`。

