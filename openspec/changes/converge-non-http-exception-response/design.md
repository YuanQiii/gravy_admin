## Context

- `packages/core/src/core/filters/http-exception.filter.ts` 的非 `HttpException` 分支：`status = 500`，`message = exception.message || '服务器内部错误'`。异常对象来自任何未预期的失败路径（Prisma 约束/校验、驱动、第三方 SDK）。
- 失败日志已由 `packages/core/src/logging/request-log.interceptor.ts` 的 `catchError` 分支记录（`error` + `stack`，只记一次）；filter 的类注释明确写着「此处不再记录，避免重复」，`logging/spec.md` 的「失败请求不重复记录」场景把它固化为契约。
- filter 通过 `APP_FILTER` + `useClass` 注册（`apps/admin/src/app.module.ts`、`apps/mall/src/app.module.ts`），因此**构造注入可用**。
- 环境配置：`packages/core/src/config/app.config.ts` 提供 `nodeEnv: process.env.NODE_ENV || 'development'` 与 `logRequestIdHeader: process.env.LOG_REQ_ID_HEADER || 'x-request-id'`（即 config key `app.nodeEnv` / `app.logRequestIdHeader`）。
- 请求关联 ID 由 `packages/core/src/logging/request-id.middleware.ts` 从 `LOG_REQ_ID_HEADER` 取值、缺失则生成 UUID，写入 `req.id` —— **目前只读入，不回写响应头**，因此调用方拿不到可关联的线索。
- 错误响应包络：`ResponseUtil.error(message, code, showType)` → `{ success, code, message, data: null, timestamp, showType }`。

## Goals / Non-Goals

**Goals:**

- 生产环境下，未预期异常不再把内部细节下发给调用方。
- 排查能力不退步：泛化文案 + 可关联的请求 ID，运维仍能一条线索定位到日志。
- 零日志改动——不破坏"失败只记一次"的唯一归属。

**Non-Goals:**

- **不改** `HttpException` 分支的任何行为（业务错误码与参数校验消息是对外契约）。
- **不改** `ResponseUtil` 的包络结构（新增字段会破坏所有调用方的解析；关联 ID 走响应头，不走 body）。
- **不重构**异常体系（自定义异常基类、错误码注册表等）。
- **不修** `HttpException` 分支中 `responseObj.message || responseObj.error || exception.message` 回退到 `exception.message` 那条潜在泄漏路径（见 Risks 4）。

## Decisions

### 1. 只收敛响应体，泛化文案由环境决定

非 `HttpException` 且属于 `Error` 时：

- 生产环境（`app.nodeEnv === 'production'`）→ `message = '服务器内部错误'`。
- 非生产环境 → 保留 `exception.message`（本地/测试需要它，且此时"泄漏"没有真实攻击面）。

判定通过**构造注入 `ConfigService`** 读取 `app.nodeEnv`（filter 是 `APP_FILTER` 提供者，DI 可用），与仓库既有的配置口径一致，不新读 `process.env`。

*备选（否决）*：按 `NODE_ENV` 直接读环境变量——绕过 `ConfigService` 会与 `app.config.ts` 的单一来源分叉（该文件已经做过默认值与校验）。

### 2. 谁记原始错误：`RequestLogInterceptor`，本变更不动日志

审查这条时最重要的问题是"泛化之后，细节去哪了"。答案已经在仓库里：`RequestLogInterceptor` 的失败分支记录 `error + stack`，且它被设计成全仓**唯一**的失败日志产出点（`logging/spec.md` 的「失败请求不重复记录」场景）。

因此**本变更不得在 filter 里加 logger**——那会制造重复日志并破坏唯一归属。本变更的代码改动因此收敛为"响应层的文案选择"，日志侧零改动。

### 3. 关联 ID 由 request-id middleware 回写响应头（而不是 filter）

泛化文案会让用户报障时失去线索，所以必须给出一个可关联的标识。它在仓库里已存在（`req.id`），只是没有出口。

归属上，**ID 的所有者是 `request-id.middleware.ts`**（它负责取值/生成/挂载），因此由它在响应上回写该头（键名复用 `app.logRequestIdHeader`）最合位置——顺带让成功响应也可关联，运营价值更高且成本为零。filter **不**设置响应头。

*备选（否决）*：在 filter 里 `response.setHeader(...)` 只给错误响应加——把 id 的发布逻辑从它的所有者那里拆出来，且成功响应依旧不可关联。

### 4. 边界：`HttpException` 分支逐字不变

`INQUIRY_NOT_FOUND`、`CUSTOMER_USERNAME_DUPLICATED_SOFT_DELETED`、`请求参数错误: ...` 这些都是调用方据以分支的契约，规格里也有对应场景（如 409 错误码）。本变更**不触碰**该分支的任何一行。

## Risks / Trade-offs

1. **[既有测试可能断言 500 带原始 message]** → 实现前先 grep 测试与 e2e（tasks 2.1）；若有，改为"断言泛化文案" + "断言日志含细节"（这才是有意义的断言对）。这是本变更最可能踩的坑，必须先量化。
2. **[调试体验下降]** → 非生产环境保留原始 message；生产环境靠关联 ID + 日志。若某类异常在线上反复出现且日志不便查阅，那是可观测性建设问题，不是应该把 message 放回响应体的理由。
3. **[泛化文案让调用方无法分支]** → 500 本就不应被调用方用于业务分支；需要分支的场景应返回 `HttpException` + 业务错误码（决策 4）。这条要写进 Swagger/文档说明。
4. **[`HttpException` 分支的潜在泄漏未修]** → `responseObj.message || responseObj.error || exception.message`：当 `getResponse()` 返回的对象既无 `message` 也无 `error` 时会回退到 `exception.message`。该路径只在异常自定义了响应对象时走到，风险低于非 HttpException 分支，但**仍是同类问题**。记录为后续项（建议独立变更 `converge-http-exception-message-fallback`），不在本次夹带。
5. **[响应头回写的兼容性]** → 新增一个响应头（`x-request-id`）对客户端是增量、无破坏；若反向代理/网关已有同名头，需确认不冲突（部署侧核对，tasks 3.3）。

### 5. 把「异常 → 展示」抽成纯函数（架构审查候选 A，采纳）

当前 filter 的 `catch` 一个方法里混了四件事：异常分类、message 提取与收敛、`showType` 映射、业务码 → HTTP 状态映射。本次要在其中再加一条环境分支，只会让它更宽，而它只能通过发 HTTP 请求才能验证。

采纳：抽出纯函数

```ts
resolveErrorPresentation(exception: unknown, ctx: { isProduction: boolean }):
  { status: number; message: string; showType: ErrorShowType }
```

`HttpExceptionFilter.catch` 退化为「取展示 → `response.status(...).json(ResponseUtil.error(...))`」，四类规则各有单测且**不需要起 HTTP 服务**；环境判定成为可注入入参，而非读全局状态。这也让决策 4 的"业务错误码逐字不变"获得一个廉价的验证点：对一组代表性 `HttpException` 断言展示结果与改动前一致。

### 记录的后续项（不在本变更实现）

- 审查候选 B：请求上下文访问器 `requestContext(req) → { id, ip }`。`req.id` 的读取约定正在扩散（interceptor、本变更要加的出口），而 `client-ip.util` 是另一条从请求取上下文的路径且已知有 3 处直读 XFF。**本变更只做 id 半边**（回写响应头，决策 3），ip 半边留给 `harden-client-ip-trust-boundary`，避免两个未归档变更抢同一文件。
- 审查候选 C：错误码常量表（把"对外契约"从字符串字面量变成可枚举清单）。全仓重构，与"收敛一个分支"不成比例；本变更用 tasks 2.1 的 grep 清单临时替代。
