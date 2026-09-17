## Context

限流的客户端 IP 目前由 `resolveClientIp`（`packages/core/src/shared/utils/client-ip.util.ts:23-36`）从请求头链首段直取，且应用未启用 `trust proxy`（`packages/core/src/bootstrap/configure-app.ts:17-58`）。同一「从请求取 IP」逻辑还散落在 `request-log.interceptor.ts:95-97` 与 `operation-log.interceptor.ts:89-91`，三处各自直读 `x-forwarded-for` 首段，行为漂移且都易被伪造。登录端点（`customer-auth.controller.ts:33,49,68,78`）的 `@Throttle` 以该 IP 计数，故伪造头即可绕过 ADR 0011 决策 5 的爆破收敛。

部署拓扑决定「谁是客户端 IP」的正确答案：`docker-compose.yml` 中应用**直接暴露** 3000/3001（无 nginx），而 `nginx.conf.example:58-59` 是单跳手动部署（nginx 追加 XFF）。因此信任策略必须配置化，不能硬编码。

## Goals / Non-Goals

**Goals:**

- 收敛「客户端 IP 归因」到单一可信模块（可信代理边界），限流 / 访问日志 / 审计日志同源。
- 客户端 IP 抵抗 `X-Forwarded-For` 伪造，使登录限流真实生效。
- 信任策略按部署拓扑可配置（`security.trustedProxy`）。

**Non-Goals:**

- 不修改限流预算数值（login/wechat 10、refresh/logout 30，沿用 ADR 0011）。
- 不引入账户级失败锁定（ADR 0011 已决，留待未来）。
- **不将多实例限流 store 切 Redis**（见决策 D4，列为 Non-Goal）。
- 不改 RBAC / 会话模型 / JWT 语义。
- 不在应用内实现 nginx 层 XFF 覆盖（部署侧 Defense-in-depth，仅备注）。

## Decisions

**D1：单一所有者 = `ClientIpResolver` 模块（interface + Express 实现）**

理由：当前 3 处各读 `x-forwarded-for` 首段，易漂移且都受伪造；收敛到框架 `req.ip`（Express 已据 `trust proxy` 审计实现的 XFF 信任逻辑）作唯一实现。备选否决：保留各点直读 headers——无法统一信任策略，伪造面复现。

**D2：信任策略由配置 `security.trustedProxy` 驱动，`configureApp` 设 `app.set('trust proxy', cfg)`**

理由：部署拓扑决定答案——docker 直连（无代理）需 `false`，nginx 1-hop 需 `1`，云 LB 可能需 CIDR 列表。`configureApp` 是 admin/mall 共享引导接缝（ADR 0010 D9），在此统一设信任边界。备选否决：硬编码 `trust proxy = 1`——不通用，docker 直连下会把对端误判为代理写入口。

**D3：实现复用 `req.ip`，不自写 XFF 链尾解析**

理由：`req.ip` 已是框架维护、经审计的信任实现，避免重造轮子与维护白名单的出错面。备选否决：自写「只取链尾段」解析——与框架重复、易错、需同步维护可信代理列表。

**D4：多实例限流 store（Redis）不纳入本次范围**

理由：① 本缺陷根因是「信任边界」而非 store；即便切 Redis，若仍信任伪造 XFF，store 仍按攻击者 IP 计数，绕过未被修复。② ADR 0005 已将 Redis throttler 明确列为独立后续，ADR 0011 风险项亦同。③ 纳入会跨到 Redis/部署配置，超出「可信代理边界」主题。故列为 Non-Goal，留独立变更。

**D5：三处 IP 读取点全部改用 `ClientIpResolver`**

理由：`request-log.interceptor` 与 `operation-log.interceptor` 同样应抵抗伪造且需与限流同源，避免行为漂移。

**D6（架构审查采纳）：删除 `resolveClientIp` 纯函数副本，module 的 interface 即唯一测试面**

理由：规划初稿曾保留 `resolveClientIp` 作「无 `req` 测试回退」，但那是一条独立 IP 解析路径，信任语义可能再次漂移（shallow 副本）。采纳候选 1：彻底删除该副本，`ClientIpResolver` 成为 deep module；测试以内存 adapter 或 mock request 喂入，interface 即测试面。备选否决：保留纯函数副本——与「单一所有者」根因相悖，会复活行为漂移。

**D7（架构审查采纳）：信任答案收进 `trust-boundary` config module，紧贴 resolver 的构造点**

理由：采纳候选 2，`security.trustedProxy` 平铺在 app.config 时，「谁该信任」与「resolver 如何构造」跨文件分离，部署语义易漏配。抽 `trust-boundary` config module 集中校验（非负整数层数 / CIDR / false / true）并产出 trustProxy，`ClientIpResolver` 直接由其构造——locality 提升，误配在启动期暴露。备选否决：维持平铺配置——消费点与配置分离，难保证配置被 resolver 实际消费。

## Rejected Candidates（架构审查，留档避免重复建议）

**候选 3：把多实例 Redis 限流 store 纳入本次** — **否决**。理由：① 本缺陷根因是「信任 seam」而非 store；即便切 Redis，store 仍以（可被伪造的）IP 为键，绕过未被修复。② ADR 0005 已明确将 Redis throttler 作为独立后续，ADR 0011 风险项亦同。③ 纳入会跨到 Redis / 部署配置，超出「可信代理边界」主题。故维持 design.md D4 的 Non-Goal 状态，留给独立变更。

## Risks / Trade-offs

- [风险] 部署遗漏 `trust proxy` 配置 → nginx 下所有请求归并为 nginx 内网 IP，限流退化为单桶（DoS）。→ 缓解：默认 `false`（信任关闭、从 socket 取对端，安全默认）；`.env.example` 与文档标注 nginx 1-hop 需 `=1`；e2e 增加「受信代理拓扑下正确归因」用例。
- [风险] `security.trustedProxy` 配置过宽（如 `true` 信任全部跃点）反而引入新伪造面。→ 缓解：env 校验仅接受非负整数层数、CIDR 列表或 `false`/`true`；示例禁止无脑 `true`。
- [风险] 测试工厂 mock 请求无 socket/headers，致 `req.ip` 为 `undefined`。→ 缓解：`ClientIpResolver` 在 `req.ip` 缺失时回退到安全值（socket remote / `127.0.0.1`），单测覆盖。

## Migration Plan

1. 新增 `security.trustedProxy` 配置（default `false`）+ env 校验 + `.env.example`。
2. `configureApp` 读取配置并 `app.set('trust proxy', cfg)`。
3. 新增 `ClientIpResolver`（interface + Express 实现），`@ClientIpResolver()` 装饰器与两拦截器改用之。
4. 取代 `resolveClientIp` 的安全边界语义；保留纯函数回退供测试。
5. 回归：单元测试覆盖伪造头被忽略；e2e 覆盖 nginx 1-hop 正确归因与 429 触发。
6. 回滚：配置回退 `false` 即恢复「从 socket 取对端」语义（docker 直连场景本就正确）。
