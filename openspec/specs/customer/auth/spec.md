# customer/auth Specification

## Purpose
独立的 B2C 客户 JWT 认证域：让 `Customer` 能以用户名/邮箱/手机号任一凭证 + 密码登录，获得独立于后台 `User` 认证域的访问/刷新令牌，并据登录态恢复当前客户身份；与后台 RBAC 认证互不污染。

## Requirements

### Requirement: 客户密码登录

系统 SHALL 提供 `POST customer/auth/login`，接受 `username` / `email` / `phoneNumber` 三者**任一**字段 + `password` 的凭证。系统 SHALL 校验密码（bcrypt 哈希），成功则返回独立的 access token 与 refresh token；任一凭证不匹配或密码错误 SHALL 返回 401，且不泄露具体哪个字段错误。软删除（`deletedAt` 非空）或 `status = disabled` 的客户 SHALL 拒绝登录。

#### Scenario: 按用户名登录成功

- **WHEN** `POST customer/auth/login` 携带已启用客户的 `username` 与正确 `password`
- **THEN** 系统返回 200，含独立 access token（下述 payload 携带 `customerId`）与 refresh token

#### Scenario: 按邮箱登录成功

- **WHEN** `POST customer/auth/login` 携带客户已绑定的 `email` 与正确 `password`
- **THEN** 系统返回 200，含 access + refresh token，指向同一 `customerId`

#### Scenario: 密码错误

- **WHEN** `POST customer/auth/login` 凭证存在但 `password` 错误
- **THEN** 系统返回 401，错误信息不区分凭证不存在与密码错误（统一话术）

#### Scenario: 已禁用或已删除客户登录

- **WHEN** `POST customer/auth/login` 携带 `status = disabled` 或已软删除的客户凭证
- **THEN** 系统返回 401，不发放令牌

### Requirement: 独立客户令牌与认证域隔离

系统 SHALL 为 B2C 客户颁发**独立认证域**的 JWT，与后台 `User` 认证域隔离：客户 token 的 payload SHALL 携带 `customerId`（而非 `userId`），并由专用的 `CustomerJwtGuard` 识别；后台 `JwtAuthGuard` SHALL 只识别携带 `userId` 的 token。两者 SHALL 不可互认——携带客户 token 访问后台受保护接口、或携带后台 token 访问仅客户可访问的接口，SHALL 被拒绝。令牌敏感信息（token 本身）SHALL 不进入任何响应之外的业务回显。

#### Scenario: 客户令牌不被后台接口接受

- **WHEN** 携带客户 access token 访问仅鉴权后台 `User` 的受保护接口
- **THEN** 系统返回 401，不进入后台用户逻辑

#### Scenario: 后台令牌不被客户接口接受

- **WHEN** 携带后台用户 access token 访问要求客户登录态的接口
- **THEN** 系统返回 401，不进入客户活动逻辑

### Requirement: 刷新访问令牌

系统 SHALL 提供 `POST customer/auth/refresh`，接受有效的客户 refresh token，返回新的 access token（及旋转后的 refresh token，若采用轮换机制）。无效/已撤销/过期的 refresh token SHALL 返回 401。

#### Scenario: 用有效 refresh token 刷新

- **WHEN** `POST customer/auth/refresh` 携带先前登录返回的有效 refresh token
- **THEN** 系统返回新的 access token，且该客户会话保持有效

#### Scenario: 用已撤销 refresh token 刷新

- **WHEN** `POST customer/auth/refresh` 携带已被登出撤销的 refresh token
- **THEN** 系统返回 401，不发放新令牌

### Requirement: 客户登出

系统 SHALL 提供 `POST customer/auth/logout`，撤销当前客户会话（对应的 refresh token 失效，access token 进入失效处理），返回成功。

#### Scenario: 登出后会话失效

- **WHEN** 客户调用 `POST customer/auth/logout` 成功
- **THEN** 该会话的 refresh token 被撤销，再次刷新返回 401

### Requirement: 从登录态恢复当前客户

系统 SHALL 对标记为客户认证（`CustomerJwtGuard`）的接口，从客户 access token 恢复当前 `customerId`，并以 `@CurrentCustomer()` 方式对下游公开当前客户身份，SHALL 不要求在请求体/查询参数中重复提供 `customerId`。

#### Scenario: 已登录客户调用活动接口

- **WHEN** 已登录客户携带有效客户 access token 调用要求客户登录态的接口
- **THEN** 系统以令牌中的 `customerId` 作为当前客户处理请求，无需在请求中显式传 `customerId`

#### Scenario: 未登录调用活动接口

- **WHEN** 请求未携带客户 access token（或 token 无效）调用要求客户登录态的接口
- **THEN** 系统返回 401
