## ADDED Requirements

### Requirement: 可信客户端 IP 与登录限流边界

系统 SHALL 通过单一可信客户端 IP 解析模块（可信代理边界）推导用于限流的客户端 IP，而非直接取请求头链 `x-forwarded-for`/`x-real-ip` 的首段。该模块 SHALL 是「谁是客户端 IP」的唯一所有者；其正确答案依赖部署拓扑，由配置项 `security.trustedProxy`（受信代理层数 / CIDR 网段 / `false`）决定，`false` 表示信任关闭、IP 取真实对端 socket 地址。当 `security.trustedProxy` 配置为受信代理时，模块 SHALL 按框架 `req.ip`（仅解析由受信代理写入的链尾段）返回 IP；未被受信代理写入的 `X-Forwarded-For` 首段 SHALL 不计入客户端 IP。客户认证端点 `POST /auth/login`、`POST /auth/wechat-login`、`POST /auth/refresh`、`POST /auth/logout`（`apps/mall/src/modules/customer-auth/customer-auth.controller.ts:33,49,68,78`）的限流 SHALL 一律以该模块返回的 IP 为计数键，预算保持 `login`/`wechat-login` 10 req/min、`refresh`/`logout` 30 req/min（ADR 0011 决策 5）。

#### Scenario: 伪造 X-Forwarded-For 不绕过登录限流

- **WHEN** 攻击者对 `POST /auth/login` 每次请求附带不同的随机 `X-Forwarded-For` 头
- **THEN** 系统按可信客户端 IP（真实来源）而非伪造头计数，同一来源在 1 分钟内第 11 次请求返回 429，限流预算未被绕过

#### Scenario: 受信代理后 IP 正确归因

- **WHEN** 请求经受信代理（`security.trustedProxy` 已配置）转发，代理按规范在 `X-Forwarded-For` 链尾追加真实客户端地址
- **THEN** 模块返回的客户端 IP 为代理写入的链尾段（真实客户端地址），而非攻击者可控的首段

#### Scenario: 无代理部署从对端 socket 取 IP

- **WHEN** 应用直接暴露、未配置受信代理（`security.trustedProxy=false`，如 `docker-compose.yml` 中 mall 直接监听 3001）
- **THEN** 模块返回请求对端 socket 地址作为客户端 IP，攻击者附加的 `X-Forwarded-For` 被忽略

#### Scenario: 限流预算按可信 IP 生效

- **WHEN** 同一可信客户端 IP 在 1 分钟内对 `login`/`wechat-login` 发起超过 10 次、或对 `refresh`/`logout` 发起超过 30 次请求
- **THEN** 系统对该 IP 返回 429，预算与 ADR 0011 决策 5 一致，且不计伪造头
