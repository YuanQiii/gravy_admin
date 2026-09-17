## 1. 规格收口（改规格路线）

- [x] 1.1 复核 delta 文件 `specs/customer/spec.md` 的 `## MODIFIED Requirements` 已整块复制「收藏管理」Requirement 全部场景，且「重复收藏幂等」场景由「返回 200（幂等）」改为「返回 201（幂等，沿用 POST 默认状态码与统一响应约定）」；其余场景逐字不变。验证：`grep -n "返回 201（幂等" specs/customer/spec.md` 命中、`grep -n "返回 200（幂等" specs/customer/spec.md` 无命中。
- [x] 1.2 （可选，非强制）将 `apps/mall/src/modules/customer-activity/favorites.controller.ts:43-47` 的 `@ApiResponse({ status: 201, description: '收藏成功' })` 措辞调整为「收藏成功（幂等命中亦返回 201）」，使 Swagger 语义与 201 事实一致；控制器返回逻辑与 `@ApiResponse({ status: 201 })` 声明保持不变。验证：确认控制器仍 `return ResponseUtil.created(...)`，无状态码逻辑改动。
- [x] 1.3 运行 `openspec validate align-favorite-idempotent-status --strict`，确认通过（退出码 0、无 omit/校验报错）。验证：命令输出不含 error，`validate` 成功。
- [ ] 1.4 apply 阶段执行 `openspec archive align-favorite-idempotent-status`，将 delta 合并进主规格 `openspec/specs/customer/spec.md`，并复核主规格该场景已为 201。验证：`grep -n "返回 201（幂等" openspec/specs/customer/spec.md` 命中。

## 2. 架构审查处置（回写结论）

- [x] 2.1 候选 1「改规格对齐实现与约定」：**已采纳**（即本变更路线）——落地于 §1。验证：design.md 决策 1 与 tasks §1 一致。
- [x] 2.2 候选 2「改实现返回 200」：**已否决**——理由：需刺穿 `ResponseInterceptor` seam（引入 `@Res` 状态控制）+ 改动 `createFavorite` 签名为 `{ created, data }`，成本高于仅 RESTful 纯度收益，且违背本仓 POST→201 一律约定。验证：design.md Risks 记录该否决及理由。
- [x] 2.3 候选 3「扩展 `ResponseUtil`/`ResponseInterceptor` 统一携带并应用 httpStatus」：**已搁置（独立变更）**——属跨切面 seam 改造，超出本微小问题范围；若未来要求严格 REST 幂等 200，另行立项。验证：design.md 决策 2 记录该搁置与触发条件。

## 实施记录（2026-09-17）

- **1.1**：delta 核对通过——「重复收藏幂等」场景已为 201 表述，200 无残留。
- **1.2**：`@ApiResponse` 措辞改为「收藏成功（幂等命中亦返回 201）」；控制器返回逻辑零改动。
- **1.3**：`validate --strict` 通过。
- **1.4**：归档动作待做（合并进主规格后复核 201）。
- 无代码行为变更、无迁移、无测试影响面（响应状态码本就是 201）。
