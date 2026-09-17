## MODIFIED Requirements

### Requirement: 访问日志

系统 SHALL 为每个已匹配请求记录一条结构性访问日志，包含用户标识（userId）、请求方法、路由、路径、响应状态码、耗时、请求关联 ID、**来源 IP**、User-Agent 与脱敏后的 query。超过慢请求阈值（`LOG_SLOW_MS`，默认 1000ms）的请求 SHALL 附带脱敏后的请求体。来源 IP SHALL 经由单一可信客户端 IP 解析模块（可信代理边界）推导，与登录限流使用同一来源，**不得**直接取请求头 `x-forwarded-for` 首段；该模块按部署拓扑配置 `security.trustedProxy` 决定 IP 归因（参见 `customer` 能力「可信客户端 IP 与登录限流边界」）。

#### Scenario: 记录成功请求

- **WHEN** 一个 GET 请求正常返回 200

- **THEN** 系统记录一条访问日志，包含 method、路由、状态码、耗时与请求关联 ID

#### Scenario: 慢请求附带请求体

- **WHEN** 一次请求的耗时超过 `LOG_SLOW_MS`

- **THEN** 该访问日志附带脱敏后的请求体字段

#### Scenario: 失败请求不重复记录

- **WHEN** 一个请求失败并产生异常

- **THEN** 该失败细节只通过异常日志记录一次，访问日志不再重复记录该失败的错误堆栈，两者通过同一请求关联 ID 关联

#### Scenario: 来源 IP 经可信解析且抗伪造

- **WHEN** 请求携带伪造的 `X-Forwarded-For` 首段、但经受信代理（`security.trustedProxy` 已配置）转发

- **THEN** 访问日志记录的来源 IP 为可信解析模块返回的真实客户端地址，而非伪造头首段
