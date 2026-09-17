## Why

`POST /favorites` 在幂等命中（已收藏记录）与真正新建时走同一返回路径，控制器统一 `ResponseUtil.created` → HTTP 201；但 `openspec/specs/customer/spec.md` 的「收藏管理」Requirement 明确规定幂等命中应「返回 200（幂等）」，规格与实现长期不一致。本变更择一路收口该不一致。

经核实的事实（非照搬审查报告）：

- 控制器两路径不可区分：`apps/mall/src/modules/customer-activity/favorites.controller.ts:49-58` 始终 `return ResponseUtil.created(data, '收藏成功')`，命中既有记录与新建均返回 201。
- Service 无法表达「新建/命中」：`apps/mall/src/modules/customer-activity/customer-activity.service.ts:89-117` 的 `createFavorite` 在普通 `create` 与 P2002 回查两条分支都 `plainToInstance(FavoriteResponseDto, ...)` 后返回，返回类型 `Promise<FavoriteResponseDto>`，**未暴露 `created` 标志**，控制器无从区分。
- HTTP 状态码来源：`packages/core/src/core/interceptors/response.interceptor.ts:43-65` 仅包装响应体、从不设置 HTTP 状态码；POST 由 NestJS 框架默认给 201。因此当前两路径 HTTP 均为 201（与响应体 `code: 201` 一致）。
- 工具方法纠错：报告建议「`ResponseUtil.ok`」——实际 `packages/core/src/shared/utils/response.util.ts` **不存在 `ok` 方法**；等价的是 `found`（code 200）或 `success`（code 200）。
- 规格位置纠错：报告称 `openspec/specs/b2c/spec.md` 描述该端点——该文件**不存在**（仅有 `openspec/specs/b2c/browse/spec.md`，与收藏端点无关）。收藏端点响应仅定义于 `openspec/specs/customer/spec.md` 的「收藏管理」Requirement。
- 消费方依赖核查：`grep -rn "201" apps packages docs openspec | grep -i favorite`（含大小写）仅命中控制器自身 `@ApiResponse({ status: 201 })` 与 `response.interface.ts` 的 `CREATED = 201` 枚举；e2e 中 `test/inquiry-detail-lines.e2e-spec.ts:195 .expect(201)` 属询价单、非收藏。**无任何前端/测试/文档断言收藏返回 201**。
- 同型不一致核查：全仓仅 `createFavorite` 是「幂等 POST + P2002 回查返回原记录」模式；`POST /addresses` 非幂等（重复创建两条），history 写路径 `recordView` 为内部调用无对外端点，customer-auth 的 P2002 回查属登录端点（返回令牌，合同面不同）。**无同型端点共享该不一致**，无需扩大为「全端点状态码审计」（见 design.md Risks）。

## What Changes

- 选用**改规格（接受 201）**路线：将 `openspec/specs/customer/spec.md`「收藏管理」Requirement 的「重复收藏幂等」场景由「返回 200（幂等）」调整为「返回 201（幂等，沿用 POST 默认状态码与统一响应约定）」。
- 实施层**不改动** `favorites.controller.ts` 与 `customer-activity.service.ts`：现有 `@ApiResponse({ status: 201 })` 声明本就与 201 事实一致，仅 Swagger `description` 可顺带措辞为「收藏成功（幂等命中亦返回 201）」以便阅读（非强制）。
- 此变更属**对外行为合同变更**（规格由「要求 200」改为「要求 201」），但因当前实现与全站 POST 默认码均为 201、且无任何消费方依赖 200，**风险极低，不标 BREAKING**，仅在 design.md / 迁移说明中记录该收口方向。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `customer`: 「收藏管理」Requirement 的「重复收藏幂等」场景，将幂等命中响应由 200 调整为 201，与实现及全站 POST 默认状态码对齐（见 `specs/customer/spec.md` 的 `## MODIFIED Requirements`）。

## Impact

- `openspec/specs/customer/spec.md`：仅「收藏管理 / 重复收藏幂等」场景一行语义调整（200→201），其余场景与 Requirement 描述整块保持不变。
- `apps/mall/src/modules/customer-activity/favorites.controller.ts`：默认无需改动；`@ApiResponse({ status: 201 })` 已符合事实。
- `apps/mall/src/modules/customer-activity/customer-activity.service.ts`：无需改动；`createFavorite` 命中返回原记录的实现维持不变。
- `packages/core/src/shared/utils/response.util.ts` / `response.interceptor.ts`：不触及（保留「POST 默认 201 + 拦截器仅包装体」的现有约定）。
- 文档/前端：本仓无前端代码；无消费方受影响。
