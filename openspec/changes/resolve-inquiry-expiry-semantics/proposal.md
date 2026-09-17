## Why

`expireDueQuoted()` 在 4 个读路径（admin 列表/详情、客户列表/详情）前置执行 `updateMany { status:'quoted', expiresAt <= now }`，把写操作塞进只读端点，并对全表做无视 `customerId`/权限的扫描式更新；这与 ADR 0014 决策 5「Mall 不做自动过期 job、不做被动过期展示、过期归 admin/ops 职责」直接冲突，且使读端点无法走只读副本、每次列表查询携带写事务（行锁 + WAL），与真实写入争锁。文档（ADR）与实现（读路径写）各说各话，维护者无从判断真值。

## What Changes

- 移除 `expireDueQuoted()` 私有方法及其在 4 个读路径的全部调用（`findMyInquiries`、`findOneForCustomer`、`findAll`、`findOne`），使查询端点恢复只读。
- 将「quoted 且 expiresAt 已过」表达为**派生只读展示态** `isExpired`（响应计算，不落库、不改 `status`），Admin 与 Mall 响应均携带。
- **BREAKING**：`submitted → quoted` 强制要求 `expiresAt`（不可为空），未提供则拒绝，避免「永久报价」。
- 物理 `expired` 状态仅由后台**人工**状态流转（`updateStatus` quoted→expired）抵达，复用 `atomic-inquiry-status-transition` 引入的 `buildStatusPatch` 接缝。
- 文档一致性：以「派生展示态 + 人工过期」为准，ADR 0014 决策 5 的「被动过期展示」由更正注记重新界定。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `inquiry`：修改「询价单状态流转」（过期机制改为仅人工、移除读路径写、强制 `expiresAt`）；新增「询价单过期派生展示态」Requirement。

## Impact

- 代码：`packages/domain/src/inquiry/inquiries/inquiries.service.ts`（`expireDueQuoted` 实现 L340-349；调用点 L269、L292、L384、L427）。
- DTO：`InquiryResponseDto` / `InquiryDetailResponseDto`（新增只读 `isExpired` 字段，含 Mall 端）。
- 约束：`packages/core/src/shared/constants/inquiry.constant.ts`（`INQUIRY_STATUS_TRANSITIONS` 不变；`quoted→expired` 仍合法）。
- 接口：**BREAKING** admin 报价接口（`updateStatus` 至 `quoted`）现要求 `expiresAt`；`UpdateInquiryStatusDto` 校验需随之收紧。
- 依赖：无新增；不引入 `@nestjs/schedule` 等调度基础设施。
- 并行变更：`atomic-inquiry-status-transition`（未归档）负责把 `updateStatus` 改造为条件写 + `buildStatusPatch`；本变更不修改其文件，仅声明 `expired` 人工流转复用该接缝。
