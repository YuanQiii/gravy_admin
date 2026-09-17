## Context

当前 `POST /favorites` 的两条返回路径（真正新建、P2002 回查命中既存）在 `favorites.controller.ts:49-58` 统一经 `ResponseUtil.created` 返回，HTTP 状态码为框架默认的 201（见 `response.interceptor.ts:43-65`：拦截器仅包装响应体、从不设状态码）。而 `openspec/specs/customer/spec.md`「收藏管理 / 重复收藏幂等」明确要求幂等命中「返回 200（幂等）」。规格与实现对不齐。

本变更只解决这一处不一致，不扩展为全端点状态码审计。已核实：无前端/测试/文档依赖收藏的 200 或 201；`ResponseUtil` 无报告所称的 `ok` 方法（等价者为 `found`/`success`，code 200）；`b2c/spec.md` 不存在，收藏端点仅定义于 `customer/spec.md`；全仓仅 `createFavorite` 属「幂等 POST + P2002 回查」模式，同型端点无此问题。

## Goals / Non-Goals

**Goals:**

- 收口 `POST /favorites` 幂等命中响应的「规格 vs 实现」不一致，使其单一、明确、可执行 `validate --strict`。
- 维持与全站「POST 默认 201 + 拦截器仅包装体」约定的一致性。

**Non-Goals:**

- 不引入按响应分支设置 HTTP 状态码的新机制（不新增 `@Res` 状态控制、不改造 `ResponseInterceptor`）。
- 不改 `createFavorite` 签名、不改业务流程（命中仍返回原记录、并发仍 P2002 回查）。
- 不做全端点状态码审计，亦不处理 customer-auth 登录端点的 P2002 回查（合同面不同，不属本问题）。

## Decisions

**决策 1：路线选「改规格（接受 201）」，否决「改实现（201→200）」。**

- 依据：实现遵循强且一致的代码约定——所有 POST 由框架默认 201，`ResponseInterceptor` 从不设状态码，仓内无任何控制器手动设状态。让 favorites 单独返回 200 需同时满足：①`createFavorite` 返回类型由 `FavoriteResponseDto` 改为 `{ created: boolean; data: FavoriteResponseDto }`（签名变更，波及控制器与既有测试）；②控制器注入 `@Res({ passthrough: true })` 并按分支 `response.status(201/200)`（在唯一一处刺穿「拦截器包体、框架定状态」的 seam，引入一次性例外）。
- 收益对比：「改规格」零代码改动、零风险、与全站约定对齐；「改实现」仅为 RESTful 纯度（本仓其它创建端点均不强制 200），却付出 seam 刺穿 + 签名变更的成本。故采纳改规格。
- 备选否决：「改实现」——理由见上，成本高于收益，且违背本仓 POST→201 一律约定。

**决策 2（架构审查回写，详见 Risks 末「架构审查结论」）：**

- 候选 1「改规格对齐实现与约定」：**采纳**（即决策 1 路线）。
- 候选 2「改实现返回 200」：**否决**——刺穿 `ResponseInterceptor` seam、改动 `createFavorite` 签名，收益仅为本仓未强制的 REST 纯度。
- 候选 3「扩展 `ResponseUtil`/`ResponseInterceptor` 统一携带并应用 httpStatus」：**否决/搁置**——属跨切面的 seam 改造，远超本微小问题范围，应作为独立变更处理（若未来团队要求严格 REST 幂等 200，再单独评估）。

## Risks / Trade-offs

- [R1 反转既有意图] → 本变更将「重复收藏幂等」由 200 改为 201，反转了已归档变更 `2026-09-10-close-mall-customer-activity-loop` 当初刻意写下的 200 要求。缓解：已在 proposal.md / 本文件记录反转理由（对齐实现与全站约定、零风险、无消费方），属有意且文档化的决策，非疏漏。
- [R2 未来若要求严格 REST 幂等 200] → 届时需改实现（签名 + 状态机制），成本高于现在一次性做。缓解：当前不预支该成本；如确有需求，按候选 3 单独立项扩展响应 seam，勿并入本变更。
- [R3 同型不一致外溢] → 核查后全仓仅 `createFavorite` 属此模式；`POST /addresses` 非幂等、`recordView` 为内部调用、customer-auth 的 P2002 回查为登录端点（合同面不同）。故无同型端点共享该问题，范围安全；若后续新增幂等 POST，应在 design 中独立评估，不纳入本次。
- [R4 Swagger 文档一致性] → `@ApiResponse({ status: 201 })` 已与 201 事实相符，仅建议将 `description` 措辞为「收藏成功（幂等命中亦返回 201）」以降低读者误解，非强制。

### 架构审查结论（回写）

对四份规划件做架构审查（候选见独立 HTML 报告）。结论：**采纳候选 1（改规格对齐）**，否决候选 2（改实现）、搁置候选 3（扩展响应 seam，独立变更）。理由同决策 1/2：以 codebase-design 术语衡量，改规格的 **locality**（仅一处 spec 文本）、**leverage**（复用既有 POST→201 约定，不新增机制）、**seam** 完整性（不刺穿 `ResponseInterceptor` 边界）均优于改实现。用户的「同意推荐」预授权已对三个候选分别采纳其推荐处置（采纳/否决/搁置）。
