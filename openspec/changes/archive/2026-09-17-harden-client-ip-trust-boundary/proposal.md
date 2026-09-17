## Why

登录/微信登录限流按「客户端 IP」计数，而 IP 取自请求头链 `x-forwarded-for → x-real-ip → …` 且**无条件信任第一个值**，应用未启用 `trust proxy`。攻击者每次请求附带随机 `X-Forwarded-For` 即可让 `login`/`wechat-login` 的 `@Throttle({ default: { limit: 10 } })` 形同虚设，ADR 0011 决策 5「login 10/min 收敛爆破面」的前提被绕过。这属安全边界缺陷，需让「谁是客户端 IP」只有一个所有者，且正确答案依赖部署拓扑（配置项）。

## What Changes

- 引入**单一可信客户端 IP 解析模块**（可信代理边界）：所有 IP 归因（限流、访问日志、审计日志）只经此模块，不再各自直接读 `x-forwarded-for`。**BREAKING**：`resolveClientIp` 的无条件首段信任语义被取代，由 `ClientIpResolver` 接管（见 `packages/core/src/shared/utils/client-ip.util.ts:23-36`）。
- `configureApp`（共享引导接缝，`packages/core/src/bootstrap/configure-app.ts:17-58`）按部署拓扑设置 Express `trust proxy`，使 `req.ip` 由框架按可信代理正确计算；并新增配置项 `security.trustedProxy`（受信代理层数 / CIDR 网段）。**BREAKING**：既有 nginx 1-hop 部署（`nginx.conf.example:58-59`）必须显式配置 `security.trustedProxy=1`，否则所有请求被归并为 nginx 内网 IP，限流退化为单桶（DoS 面）。
- `@ClientInfo()` 装饰器（`apps/mall/src/core/decorators/client-info.decorator.ts:18`）改用该解析模块取 IP，限流 IP 来源与之一致。
- 复用 `req.ip`（框架已审计的 XFF 信任实现）作为唯一实现，删除散落的 `x-forwarded-for` 直读（`packages/core/src/logging/request-log.interceptor.ts:95-97`、`packages/core/src/core/interceptors/operation-log.interceptor.ts:89-91`）。
- 多实例限流 store（Redis）**不纳入本次范围**：见 design.md Non-Goals —— 它无法修复 XFF 伪造绕过，且 ADR 0005/0011 已列为独立后续项。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `customer`：新增 Requirement「可信客户端 IP 与登录限流边界」，约束限流 IP 来源抵抗 `X-Forwarded-For` 伪造。
- `logging`：MODIFY「访问日志」Requirement，来源 IP 必须经由单一可信解析模块，不再直接取 `x-forwarded-for`。

## Impact

- 代码：`packages/core/src/shared/utils/client-ip.util.ts`（取代 `resolveClientIp`）、`packages/core/src/bootstrap/configure-app.ts`（增 `trust proxy`）、`packages/core/src/core/`（新增 `ClientIpResolver` 模块）、`apps/mall/src/core/decorators/client-info.decorator.ts`、`packages/core/src/logging/request-log.interceptor.ts`、`packages/core/src/core/interceptors/operation-log.interceptor.ts`。
- 受影响端点：`apps/mall/src/modules/customer-auth/customer-auth.controller.ts:33,49,68,78`（`login`/`wechat-login`/`refresh`/`logout` 限流）。
- 配置：新增 `security.trustedProxy`（app config + `.env.example` + env 校验），默认 `false`（信任关闭，等价于从 socket 取真实对端，安全默认）。
- 部署：docker-compose（`docker-compose.yml`）当前**无 nginx**，应用直接暴露 3000/3001（信任关闭即正确）；`nginx.conf.example` 1-hop 部署需配 `security.trustedProxy=1`。
- 限流 store：仍为本机内存（`apps/mall/src/app.module.ts:56-60`），本次不变。
