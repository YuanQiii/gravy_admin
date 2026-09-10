## ADDED Requirements

### Requirement: 微信小程序静默登录

系统 SHALL 在 Mall 应用上提供 `POST /auth/wechat-login`，接受 `{ code }`（小程序 `wx.login` 获取的 `js_code`）。系统 SHALL 使用 Mall 的微信 appid/secret 调用微信换取接口取得 `openid`；当微信换取失败（`errcode != 0` 或未返回 `openid`）时 SHALL 返回 401，且错误信息不泄露微信内部细节。换取成功后，系统 SHALL 以 `openid` 定位 `Customer`：命中则直接登录，未命中则自动创建后登录；无论命中与否 SHALL 返回与账密登录结构一致的 access token 与 refresh token，且令牌认证域仍为 `customer`。软删除（`deletedAt` 非空）或 `status = disabled` 的既有客户 SHALL 拒绝登录、不发放令牌。

#### Scenario: 已注册微信用户再次登录

- **WHEN** `POST /auth/wechat-login` 携带某既有客户 `openid` 已对应的有效 `code`
- **THEN** 系统返回 200，含 access + refresh token，指向该客户同一 `customerId`

#### Scenario: 未注册微信用户首次登录自动建号

- **WHEN** `POST /auth/wechat-login` 携带的 `code` 换取出的 `openid` 尚无对应 `Customer`
- **THEN** 系统自动创建该客户并直接登录，返回 200 与 access + refresh token

#### Scenario: 微信换取失败

- **WHEN** 微信换取返回错误（无效 `code` 等）或未返回 `openid`
- **THEN** 系统返回 401，不发放令牌，且错误话术不泄露微信 errcode/errmsg

#### Scenario: 已禁用或已删除客户微信登录

- **WHEN** `POST /auth/wechat-login` 的 `openid` 命中既有但 `status = disabled` 或已软删除的客户
- **THEN** 系统返回 401，不发放令牌

### Requirement: 微信自动建号的默认态与幂等

系统 SHALL 在 `openid` 未命中时创建客户，并满足：客户 `status = enabled`、`deletedAt = null`；`username` 由 `openid` **稳定且唯一**派生（多次登录同一 `openid` 得到同一 `username`）；`password` 为**不可用账密登录的占位值**（该客户无法通过 `POST /auth/login` 用密码登录）；`unionid` 不依赖、可留空。对于同一 `openid` 的并发首次登录请求，系统 SHALL 保证**只创建一个客户**且均成功登录（幂等）。

#### Scenario: 同名 openid 并发首次登录只建一个客户

- **WHEN** 同一未注册 `openid` 的两个 `POST /auth/wechat-login` 请求并发到达
- **THEN** 系统最终只存在一个对应该 `openid` 的 `Customer`，两个请求均返回 200 与令牌

#### Scenario: 微信建号客户无法用账密登录

- **WHEN** 对一个由微信登录自动创建、尚未绑定密码的客户调用 `POST /auth/login`
- **THEN** 系统返回 401，不发放令牌，因该客户持有不可登录的占位密码

### Requirement: 微信登录端点限流

系统 SHALL 对 `POST /auth/wechat-login` 应用与账密登录同级的限流档位（按客户端 IP），不因 IP 级限流之外的账户维度而锁定登录。

#### Scenario: 超频调用被限流

- **WHEN** 同一客户端 IP 在窗口期内对 `POST /auth/wechat-login` 的调用超过阈值
- **THEN** 系统返回 429，不换取微信、不建号、不发放令牌