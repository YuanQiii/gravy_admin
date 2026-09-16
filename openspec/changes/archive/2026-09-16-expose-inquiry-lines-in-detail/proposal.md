## Why

Mall 客户在 `GET /inquiries/:id` 上能看到 `status = "quoted"` 与 `quotedAt`，却**永远看不到自己询价了哪些滤清器、也看不到对应报价** —— 「客户查看报价」这条业务闭环在实现层断裂。

根因不是价格字段没有写入方，而是**响应投影把已经查出来的数据丢掉了**：`findOneForCustomer` / `findOne` 都执行 `include: { inquiryLines: { where: { deletedAt: null } } }`，但返回时走 `plainToInstance(InquiryResponseDto, …, { excludeExtraneousValues: true })`，而 `InquiryResponseDto` 从未声明 `inquiryLines` 字段，该键被整体剔除。结果是每次详情多付一次关联查询成本，而数据在出口被静默丢弃（`include` 成为死代码）。

这直接违反既有 Requirement：`openspec/specs/inquiry/spec.md`「客户查询本人询价单」明确要求详情 SHALL 包含明细行及其 `unitPrice`/`subtotal`。

同时需要更正一处归因：ADR 0014 决策 5 把「价格字段无消费者」定性为「职责边界不属于 Mall」。价格**写入**确实归 admin，但价格**可见性**属于 Mall 客户自助能力，当前不可见是响应投影缺陷而非边界决策。本轮只修复可见性，价格聚合口径不在范围内。

## What Changes

- **新增详情专用响应 DTO `InquiryDetailResponseDto`**：继承 `InquiryResponseDto`，额外 `@Expose()` 一个 `inquiryLines` 字段，元素复用既有 `InquiryLineResponseDto`（已含 `inquiryLineId` / `productName` / `model` / `typeName` / `quantity` / `unitPrice` / `subtotal` / `remarks` / `sortOrder`）。嵌套数组需 `@Type(() => InquiryLineResponseDto)` 才能被 `plainToInstance` 正确转换。
- **详情端点改用该 DTO**：Mall `GET /inquiries/:id`（`findOneForCustomer`）与 Admin `GET /inquiry/inquiries/:id`（`findOne`）返回 `InquiryDetailResponseDto`，使既有 `include` 真正生效。
- **列表与写路径响应结构保持不变**（`findAll` / `findMyInquiries` / `create` / `createForCustomer` / `submit` / `cancel` / `updateStatus` 继续返回 `InquiryResponseDto`）：避免列表 payload 随明细数量膨胀，也让 Admin 前端零回归。**无 BREAKING**。
- **价格字段仅在详情响应内数值化**：`unitPrice` / `subtotal` 是 Prisma `Decimal`，JSON 序列化会变成字符串（`"12.50"`）。`InquiryLineResponseDto` 同时被 Admin 的明细行端点（`/inquiry/inquiry-lines`）复用，直接收紧该 DTO 会构成对 Admin 的兼容性变更；因此改为新增**详情专用明细元素 DTO**，只在详情响应内把这两个字段转为 JSON 数值，Admin 明细行端点与所有列表/写端点维持既有字符串序列化不变。
- **价格语义显式化（不新增聚合）**：未报价时 `unitPrice` / `subtotal` / `totalAmount` 为 `null`，由 Swagger 描述写明「价格由后台报价填写，未报价为 null」。`subtotal = quantity × unitPrice`、`totalAmount = Σ subtotal` 的服务端聚合**不在本轮范围**，留待后续独立变更。
- **消除 include 死代码**：让 `include` 与响应字段一一对应；若未来某端点确实不需要明细，应显式移除该 `include` 而非让它静默丢弃。
- **同步规格与文档**：按上文 Capabilities 给出的 delta 更新 `openspec/specs/inquiry/spec.md`（`inquiry` 能力），把「详情包含明细行」从隐含期望改为可验收的显式约束，并补齐列表/详情响应结构差异；`docs/features.md` 如描述询价响应形态则同步。

## Capabilities

### New Capabilities

（无新增能力。明细行可见性是既有能力「B2C 客户自助询价」的缺陷修复，不引入新的对外能力。）

### Modified Capabilities

- `inquiry`:
  - **MODIFIED**「客户查询本人询价单」—— 把「详情含明细行」从隐含期望改为可验收的显式约束：明细行字段集、`sortOrder` 升序、排除已软删明细、未报价时价格字段为 `null`。
  - **ADDED**「询价单列表与详情的响应结构区分」—— 新增响应结构契约：详情端点（Mall / Admin）携带明细行且金额字段以 JSON 数值传输；列表与写端点不携带明细行，结构保持稳定。

## Impact

**代码**

- `packages/domain/src/inquiry/inquiries/dto/`：新增 `inquiry-detail-response.dto.ts`（`InquiryDetailResponseDto` + 详情专用明细元素 DTO）；`inquiry-response.dto.ts` 补充价格语义 Swagger 描述（行为不变）。
- `packages/domain/src/inquiry/inquiry-lines/dto/inquiry-line-response.dto.ts`：**刻意不改动** —— Admin 明细行端点维持既有 `Decimal → 字符串` 序列化，避免兼容性变更。
- `packages/domain/src/index.ts`：导出新增的 DTO（唯一公开导入面，禁止深路径 import）。
- `packages/domain/src/inquiry/inquiries/inquiries.service.ts`：`findOneForCustomer` / `findOne` 返回类型改为 `InquiryDetailResponseDto`，`include` 补 `orderBy` 与入口对齐。
- `apps/mall/src/modules/mall/inquiries/mall-inquiries.controller.ts`、`apps/admin/src/modules/inquiry/inquiries/inquiries.controller.ts`：详情端点 `ApiResponse({ type })` 换为详情 DTO；方法返回类型同步。

**接口与兼容性**

- 无新增/删除端点，无路由变更，无权限码变更。
- 两个详情端点的响应为**增量变更**（新增 `inquiryLines` 数组 + 该数组内价格字段由字符串转数字），既有消费方可忽略新字段；列表端点、写端点与 Admin 明细行端点的响应逐字节不变，无需前端同步。

**数据与运维**

- 无 schema 变更、无迁移、无 seed 变更。`relationMode = "prisma"` 与索引均不受影响。
- 详情端点单次响应体积随明细数量增长（`lines` 已由 DTO 约束 1–50 行），需确认 Admin 详情页分页/懒加载策略是否受影响。

**测试**

- 新增集成测试：已报价询价单详情返回明细行与价格（对应用户选择的最小范围闭环）。
- 新增回归测试：列表端点响应不含 `inquiryLines`（防止未来误把明细加到基础 DTO 上）。
- 既有 `inquiries.service.spec.ts` 需同步返回类型断言。
