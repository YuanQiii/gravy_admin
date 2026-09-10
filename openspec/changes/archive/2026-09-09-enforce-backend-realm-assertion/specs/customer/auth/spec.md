## MODIFIED Requirements

### Requirement: 独立客户令牌与认证域隔离

系统 SHALL 为 B2C 客户颁发**独立认证域**的 JWT，与后台 `User` 认证域隔离：客户 token 的 payload SHALL 携带 `customerId`（而非 `userId`），并由专用的 `CustomerJwtGuard` 识别；后台 `JwtAuthGuard` SHALL 只识别携带 `userId` 的 token。两者 SHALL 不可互认——携带客户 token 访问后台受保护接口、或携带后台 token 访问仅客户可访问的接口，SHALL 被拒绝。令牌敏感信息（token 本身）SHALL 不进入任何响应之外的业务回显。后台侧 SHALL 显式校验 `realm` 声明：凡 `realm` 不是 `user` 的 token——包括**缺失** `realm` 的 token——SHALL 被后台拒绝，不得依赖「缺 roleKeys 字段」等间接排除。

#### Scenario: 客户令牌不被后台接口接受

- **WHEN** 携带客户 access token（`realm = customer`）访问仅鉴权后台 `User` 的受保护接口
- **THEN** 系统返回 401，不进入后台用户逻辑

#### Scenario: 后台令牌不被客户接口接受

- **WHEN** 携带后台用户 access token 访问要求客户登录态的接口
- **THEN** 系统返回 401，不进入客户活动逻辑

#### Scenario: 无 realm 声明的令牌被后台拒绝

- **WHEN** 携带一个已签发但**缺失** `realm` 声明的 access token 访问后台受保护接口
- **THEN** 系统返回 401，不进入后台用户逻辑
