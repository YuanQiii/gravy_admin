## Context

当前应用只有 NestJS 内置 `Logger`（[src/main.ts](file:///c:/Project/gvray/src/main.ts) 根据 `NODE_ENV` 设置输出级别），无任何结构化日志库；日志事实散落在 [http-exception.filter.ts](file:///c:/Project/gvray/src/core/filters/http-exception.filter.ts)（5xx/4xx）与数据库导向的 [operation-log.interceptor.ts](file:///c:/Project/gvray/src/core/interceptors/operation-log.interceptor.ts)。`.env.example` 已有 `LOG_LEVEL`、`OPLOG_ENABLED`、`OPLOG_MASK_FIELDS`。生产 Docker 仅将 stdout 交给容器运行时，无日志采集基础设施。动机见 [proposal.md](file:///c:/Project/gvray/openspec/changes/add-structured-logging-collection/proposal.md) - Why。

约束：AGENTS.md 要求响应/日志不得出现 `password`/token/secret；DTO/Swagger 由 controller 处理、业务在 service；路径用 `@/*` 别名；改动涉及配置/部署需同步文档。**架构深化决策**（经 codebase-design 评审）：把「记录这次请求」收敛为**单一深 module**，不再拆散到 middleware/interceptor/filter 三处协调。

## Goals / Non-Goals

**Goals:**

- 引入一个**深** **`src/logging/`** **module**：对外一个极薄接口（对齐 Nest `Logger` 最小签名），背后藏日志初始化、corr-id、redact、与「成功/慢/失败只打一次」的访问日志策略。

- 单一全局请求日志拦截器（最外层 APP\_INTERCEPTOR，经 `catchError`）同时拥有成功/慢/失败三分支；`HttpExceptionFilter` 退回只管响应整形、**不再记日志**，消除跨模块去重不变量。

- 关闭 `pinoHttp.autologging`，pino 只做 transport + redact；访问日志由自定义拦截器统一产出。dev pretty / prod JSON，级别映射 `LOG_LEVEL`。

- 请求关联 ID 贯通：`x-request-id` → 拦截器内 `req.id`，由 logging module 暴露稳定读取口（`@RequestId()`）供 operation-log 读取，不触碰 pino 内部。写入上收敛为 pinoHttp `genReqId`（读 `LOG_REQ_ID_HEADER`，缺失生成 UUID），`RequestIdMiddleware` 作为守卫兜底——避免 pino-http 默认数字自增 id 覆盖关联 ID，保证 `req.id` 即关联 ID。

- 提供独立、可选的 Loki + promtail/Alloy + Grafana 采集栈。

**Non-Goals:**

- 不改动 operation-log 的业务语义（仍是落库审计），仅扩展一个关联列 `requestId`。

- 不引入抽象 `ILogger` 接口 + pino adapter —— 日志内核只有一个真实 adapter（pino），one-adapter 原则下那是假 seam（YAGNI）；将来若真出现第二个内核，再在该时点记录 ADR。

- 不做日志级联讯/告警规则、不做 trace 采样、不做 metrics、不为外部 SaaS 集成。

- 不把采集栈并入主 `docker-compose.yml`。

## Module shape — `src/logging/`

把原本散在三处的浅 module 收敛成一个深 module：

```
┌─────────────────────────────────────────────┐
│  src/logging/ （对外接口 = Logger 薄签名）     │
│  log / debug / verbose / warn / error        │
│  @RequestId()（访问器 seam，非 adapter seam）  │
├─────────────────────────────────────────────┤
│  内部（单一 seam，单一 owner，深实现）             │
│  · LoggerModule(pino) 初始化 + LOG_LEVEL 映射 │
│  · pino redact（LOG_REDACT，stdout 掩码）       │
│  · request#id 写入与稳定命名                   │
│  · 最外层 RequestLogInterceptor:
│      catchError 三分支：成功/慢(>LOG_SLOW_MS)/失败 │
└─────────────────────────────────────────────┘
```

外部调用方基本零迁移：业务日志仍走 Nest `Logger` 风格签名；访问日志与失败策略不暴露给 call site。
删除测试：删除该 module → 成功/慢/失败分支、corr-id、redact 会摊回所有调用点 ⇒ 值得养（locality）。符合 ADR 0006。

## Candidate outcomes (3/4/5)

- **候选 3（ADR 0006）**：无抽象 `ILogger` 接口。pino 是唯一真实 adapter（one-adapter 原则 → 假 seam，YAGNI）。`@RequestId()` 是**访问器 seam** 而非 adapter seam。已录 ADR 0006，未来评审不再重提。
- **候选 4（corr-id 读取）**：operation-log 从**自己的 ctx** 读稳定 `request.id` 属性（logging module 写入并定义命名），**不用 AsyncLocalStorage**——它本身是拦截器、拿得到 ctx，全局 ALS 是过度。无 HTTP 上下文时 `requestId = null`，operation-log 判空不写。
- **候选 5（敏感字段名单单一来源）**：`src/shared/constants` 建单一来源 `SENSITIVE_KEYS`；pino redact.paths 与 operation-log mask 都从它派生各自表示；`LOG_REDACT` 只追加「仅日志生效」路径、`OPLOG_MASK_FIELDS` 只追加「仅DB生效」字段。**两个 sink 的脱敏逻辑保持分开**，只是字段名单单一来源。

## Decisions

**D1 — 日志内核：`nestjs-pino`（pino）**
选择 pino 而非 winston/自研 formatter：JSON 原生、吞吐高、与 Nest 集成、`redact` 零开销字段掩码。接入 `LoggerModule.forRootAsync` 于 `app.module`，仅替换日志输出来源，不影响既有 `Logger.log` 调用点。`winston` 更重、自研需自维护 level/ctx/masking 一致性。

**D2 — 输出形态与级别**
`isProduction` 时纯 JSON（默认 pino），否则 `pino-pretty`。级别映射 `LOG_LEVEL` → pino `level`，延续现有语义，不与 AGENTS.md"生产只输出 warn/error"冲突。冒烟验证启动日志为 JSON。

**D3 — pino 退化为 transport+redact，请求日志单一拦截器**
`pinoHttp: { autoLogging: false }`，避免与自定义拦截器双重记录。pino 的 `redact` 对最终 JSON 对象生效，自定义拦截器产的字段同样被掩码（缺省覆盖 `authorization`/`*.password`/`*.token`/`*.secret` + `LOG_REDACT` 追加），无需重复脱敏。`oLogMaskFields` 仍服务 operation-log 落库，二者职责分层（可观测 vs 审计），不合并。

**D4 — 最外层 RequestLogInterceptor（候选 2）**
注册为**第一个**全局 APP\_INTERCEPTOR（在 ResponseInterceptor / OperationLogInterceptor 之前），度量完整调用链耗时并捕获所有异常。用 `tap` 拿成功结果、`tap(()=>..., err => ...)`/`catchError` 拿异常：正常 → `info` 访问日志（含 userId、method、route、path、status、duration、`req.id`、IP、UA、脱敏 query）；超 `LOG_SLOW_MS`（默认 1000）→ 附加 `req.body`（bodyParser 已解析，慢分支直接引用，无需额外 buffering）；抛错 → `error` + stack，只打一次。跳过 `OPTIONS` 预检；健康/docs 默认记录。去重不变量收敛为 module 内部一处 if。

**D5 —** **`HttpExceptionFilter`** **只管响应整形**
移除其日志职责；失败细节统一由 D4 的错误分支产出（结构化 error + stack，以 `req.id` 关联）。这消除了原「interceptor 猜 filter 会不会打」的跨模块协调。

**D6 — corr-id 经 logging module 暴露**
由 logging module 持有 `@RequestId()` 装饰器/当前请求读取口作为唯一读取 seam；operation-log 依赖它写 `requestId`，不追 pino 内部。外部 `x-request-id` 头仅作字符串关联用，不做鉴权/跳过。

**D7 — 集中采集栈独立分发**
新增 `docker-compose.observability.yml`（不并入主 compose）：`loki`（自带保留策略）、`promtail` 或 `alloy`（贴 app 容器，从 stdout 按 label 采 JSON）、`grafana`（loki 数据源）。需要时 `-f docker-compose.yml -f docker-compose.observability.yml` 叠加或单独启停。promtail 解析 JSON 后按 `env`/`service`/`level` 打 label。

## Risks / Trade-offs

- **性能**：全量请求访问日志对日志量与 Loki 存储有负担 → `info` 级 + 慢请求才附 body + `LOG_LEVEL` 可调高；后续可加采样。

- **去重回归**：若误在 filter 重打会重复 → D4/D5 单 owner、断言「同一失败只产出一条 error」。

- **脱敏遗漏**：新增字段可能漏掩码 → 默认覆盖通用敏感字段 + `LOG_REDACT` 扩展 + `oLogMaskFields` 双保险。

- **外部** **`x-request-id`** **不可信**：仅作关联字符串，不做鉴权/跳过，避免安全问题。

- **拦截器最外层**：若异常在 interceptor 装入前抛出（如全局管道校验失败）可能不入访问日志 → 校验失败属 4xx，由错误分支覆盖的路径为准；边界在集成测试确认。

## Migration Plan

1. 增加依赖 `nestjs-pino`、`pino-http`、`pino-pretty`(dev)；新建 `src/logging/`，接入 `LoggerModule`，冒烟验证 JSON 输出。
2. 实现 module 内部：RequestId seam、最外层 RequestLogInterceptor（成功/慢/失败三分支）、redact；移除 filter 日志职责。
3. operation-log：经 `@RequestId()` 写 `requestId`（可空列）。
4. 配置项入 app.config + `.env.example`（`LOG_LEVEL`、`LOG_REDACT`、`LOG_SLOW_MS`、`LOG_REQ_ID_HEADER`）。
5. 提交 `docker-compose.observability.yml` + 部署文档；同步 AGENTS.md 与 CONTEXT.md 术语。
6. 回滚：移除 `LoggingModule` 注册与拦截器即回内置 Logger；operation-log 新列为可空，无破坏。

## Open Questions

- 慢请求阈值是否需按路由/接口差异化覆盖（全局之外）——不阻塞，后续可加。

- access log 是否需采样率（高流量抽样）——不阻塞，后续增强。

- 校验失败（400）在拦截器最外层之前抛出时是否入访问日志——边界行为，集成测试阶段确认，不改变 spec。

