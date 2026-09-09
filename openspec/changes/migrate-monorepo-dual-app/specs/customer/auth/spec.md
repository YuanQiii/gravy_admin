# customer/auth Delta

## MODIFIED Requirements

### Requirement: 客户密码登录

系统 SHALL 在 Mall 应用上提供 `POST /auth/login`，接受 `username` / `email` / `phoneNumber` 三者**任一**字段 + `password` 的凭证。系统 SHALL 校验密码（bcrypt 哈希），成功则返回独立的 access token 与 refresh token；任一凭证不匹配或密码错误 SHALL 返回 401，且不泄露具体哪个字段错误。软删除（`deletedAt` 非空）或 `status = disabled` 的客户 SHALL 拒绝登录。

#### Scenario: 按用户名登录成功

- **WHEN** `POST /auth/login` 携带已启用客户的 `username` 与正确 `password`
- **THEN** 系统返回 200，含独立 access token（下述 payload 携带 `customerId`）与 refresh token

#### Scenario: 按邮箱登录成功

- **WHEN** `POST /auth/login` 携带客户已绑定的 `email` 与正确 `password`
- **THEN** 系统返回 200，含 access + refresh token，指向同一 `customerId`

#### Scenario: 密码错误

- **WHEN** `POST /auth/login` 凭证存在但 `password` 错误
- **THEN** 系统返回 401，错误信息不区分凭证不存在与密码错误（统一话术）

#### Scenario: 已禁用或已删除客户登录

- **WHEN** `POST /auth/login` 携带 `status = disabled` 或已软删除的客户凭证
- **THEN** 系统返回 401，不发放令牌

### Requirement: 刷新访问令牌

系统 SHALL 提供 `POST /auth/refresh`，接受有效的客户 refresh token，返回新的 access token（及旋转后的 refresh token，若采用轮换机制）。无效/已撤销/过期的 refresh token SHALL 返回 401。

#### Scenario: 用有效 refresh token 刷新

- **WHEN** `POST /auth/refresh` 携带先前登录返回的有效 refresh token
- **THEN** 系统返回新的 access token，且该客户会话保持有效

#### Scenario: 用已撤销 refresh token 刷新

- **WHEN** `POST /auth/refresh` 携带已被登出撤销的 refresh token
- **THEN** 系统返回 401，不发放新令牌

### Requirement: 客户登出

系统 SHALL 提供 `POST /auth/logout`，撤销当前客户会话（对应的 refresh token 失效，access token 进入失效处理），返回成功。

#### Scenario: 登出后会话失效

- **WHEN** 客户调用 `POST /auth/logout` 成功
- **THEN** 该会话的 refresh token 被撤销，再次刷新返回 401
