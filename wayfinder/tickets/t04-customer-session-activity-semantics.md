# T04 · 客户会话活性语义调和

label: `wayfinder:grilling`
status: open
blocked_by: none

## Question

在**无状态 access token**（Q5 定案，strategy 只验签名不查 Redis 会话）前提下，客户会话的活性与心跳有何语义价值，是否值得接线？

- `CustomerTokenService.touchSessionByJti` 目前死代码（mall 无 heartbeat interceptor，admin 有）。客户会话的 `lastActiveAt` 是否要被任何业务消费？
- 会话活性能否用于判定客户"在线/被篡改"？（120 无状态 AT 下它不能强制下线，只能作指标）
- 受信代理头：`getClientIp` 直取 `x-forwarded-for` 可伪造。落地受信代理（trust proxy）白名单后，IP 从 `req.ip` 取、XFF 仅在明确代理列表内解析——配置放哪里（app 级 trust proxy 设置 vs 逐请求解析），与 mall 独立 Throttle 预算的限流 IP 来源是否要统一。
- 若 Q5 维持无状态 AT，心跳/`lastActiveAt` 是否应降级为"仅统计"，还是干脆不接线保留死代码清理？（避免为指标制造活跃副作用）

## Resolution

（待关闭后记录；map 仅一行要点。）