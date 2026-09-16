## 1. 响应 DTO

- [x] 1.1 补齐询价域 3 个 `Decimal` 金额字段的 `@Type(() => Number)`（`InquiryResponseDto.totalAmount`、`InquiryLineResponseDto.unitPrice` / `subtotal`），类型收紧为 `number | null`，两个 DTO 的类注释写明该陷阱（⚠️ 无 `@Type` 时 `new Decimal(undefined)` 抛 `Invalid argument`）。验证：单测断言非空 `Decimal` → number、`null` → `null`、不再抛 `DecimalError`；`pnpm test` 通过。
- [x] 1.2 新增 `InquiryDetailResponseDto extends InquiryResponseDto`（`dto/inquiry-detail-response.dto.ts`），只额外声明 `@Expose() @Type(() => InquiryLineResponseDto) inquiryLines?: InquiryLineResponseDto[]`；明细元素**直接复用** `InquiryLineResponseDto`，不派生新类。验证：单测断言线上字段集继承自基础 DTO、唯一新增键为 `inquiryLines`。
- [x] 1.3 在 `packages/domain/src/index.ts` 的 inquiry 段导出 `InquiryDetailResponseDto`（唯一公开导入面，禁止深路径 import）。验证：`tsc -p packages/domain/tsconfig.json` 通过，`grep -n "InquiryDetail" packages/domain/src/index.ts` 命中。

## 2. 投影接缝与出口对齐

- [x] 2.1 `InquiriesService` 内新增私有投影函数 `projectInquiry(row)` / `projectInquiryDetail(row)` 与读取形状常量 `INQUIRY_DETAIL_INCLUDE`（`inquiryLines` 的 `where: { deletedAt: null }` + `orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]`）。验证：`tsc` 通过；常量内是唯一出现 `orderBy: [{ sortOrder` 的位置。
- [x] 2.2 9 个出口全部改调投影函数：`create` / `createForCustomer` / `findMyInquiries` / `findOneForCustomer` / `transitionForCustomer` / `findAll` / `findOne` / `update` / `updateStatus`；`findOne` / `findOneForCustomer` 返回类型改为 `Promise<InquiryDetailResponseDto>` 并改用 `INQUIRY_DETAIL_INCLUDE`。验证：`grep -c "plainToInstance(InquiryResponseDto"` = 1（仅投影函数内）、`plainToInstance(InquiryDetailResponseDto` = 1。
- [x] 2.3 读取形状与投影断言单测：两个详情方法都传 `INQUIRY_DETAIL_INCLUDE`；投影保留查询行序、逐行数值化金额、剔除自增 `id`；未报价金额线上为 `null`；列表出口不含 `inquiryLines`。验证：`pnpm test` 通过（新增 5 条）。
- [x] 2.4 走查 `include` 与出口一一对应：查询保留（未删）、不新增未被任何 DTO 暴露的 `include`；列表与写路径仍产出 `InquiryResponseDto`。验证：grep 结果逐处核对通过。

## 3. 控制器与 Swagger

- [x] 3.1 `apps/mall/.../mall-inquiries.controller.ts` 的 `findOne`：`@ApiResponse({ type })` 换为 `InquiryDetailResponseDto`，summary/description 更新为中文说明（含明细行、排序、金额为数值）。验证：两应用构建通过；HTTP 层由 5.1 断言字段对应。
- [x] 3.2 `apps/admin/.../inquiries.controller.ts` 的 `findOne` 同样换为详情 DTO；`@RequirePermissions(INQUIRY_PERMISSIONS.VIEW)` 与路由不变。验证：`git diff` 核对权限码未改动；admin HTTP 层由 e2e 断言。
- [x] 3.3 金额字段 Swagger 描述统一为「由后台报价填写；未报价为 null。数值类型」（`InquiryResponseDto.totalAmount`、`InquiryLineResponseDto.unitPrice` / `subtotal`、`InquiryDetailResponseDto.inquiryLines`）。验证：`git diff` 仅涉及描述文本与装饰器。

## 4. 规格与文档同步

- [x] 4.1 归档时用本变更的 delta 更新 `openspec/specs/inquiry/spec.md`（MODIFIED「客户查询本人询价单」+ ADDED「询价单列表与详情的响应结构区分」）。**已随归档同步执行（2026-09-16）**：MODIFIED 整体替换、原有场景全部保留，ADDED 追加至 `## Requirements` 末尾，主规格无 delta 操作头残留。验证：`openspec validate --specs` → 10 passed / 0 failed。
- [x] 4.2 同步描述询价响应形态的文档。验证：`grep -rn "明细行\|inquiryLines" docs/` 仅命中 ADR 0014，且无「详情不含明细」类过时表述；`docs/features.md` 无询价内容，无可同步项。
- [x] 4.3 在 `docs/adr/0014-...-state-harden.md` 决策 5 补更正注记：边界判断成立，但「价格字段无消费者」的真实原因含两层实现缺陷（`inquiryLines` 被出口 DTO 静默剔除；3 个 `Decimal` 字段漏用 `@Type` 导致录报价 500）。验证：ADR 含注记，决策 5 原文未被删除。
- [x] 4.4 复核本变更与 `openspec/specs/inquiry/spec.md`「询价单状态只读约束」的关系：该 Requirement 与 ADR 0014 实现的客户 `submit`/`cancel` 相悖，属独立文档漂移，**不在本变更内修改**。验证：`grep "状态只读约束"` 在本变更 delta 中无命中。
- [x] 4.5 移除 CONTEXT.md「Inquiry response projection」词条的 ⚠️ 落地标记，并核对词条与实现一致（常量/函数名、明细元素复用、Admin 不并入）。验证：该词条所在行不含 ⚠️。

## 5. 测试与验收

- [x] 5.1 E2E：已报价询价单的 Mall 详情响应包含 `inquiryLines`，每行 `unitPrice`/`subtotal` 为 JSON number（同时是「非空 Decimal 不再 500」的回归护栏）。验证：`test/inquiry-detail-lines.e2e-spec.ts` 通过。
- [x] 5.2 E2E：未报价询价单详情仍返回明细行（`productName`/`quantity` 有值），`unitPrice`/`subtotal` 为 `null`（断言非 `0`、字段存在）。验证：同上通过。
- [x] 5.3 E2E：投影不重排行（顺序即查询顺序），自增 `id` 不出现在线上。说明：软删过滤与排序由读取形状在 SQL 侧完成，harness 无真实 Postgres，故其结构断言在 2.3、行序断言在此处。验证：同上通过。
- [x] 5.4 E2E：列表端点（`GET /inquiries`）与写端点（`POST /inquiries/:id/submit`）响应不含 `inquiryLines`。验证：同上通过。
- [x] 5.5 E2E：Admin 明细行端点（`GET /inquiry/inquiry-lines`）的 `unitPrice`/`subtotal` 为 number（与全仓 `Decimal` 规则一致）。验证：同上通过。
- [x] 5.6 同步既有断言：`inquiries.service.spec.ts` 的详情用例改为断言新投影行为。验证：`pnpm test` 全绿（38 用例）。
- [ ] 5.7 端到端抽查（真实环境 curl 核对原始响应体）。**未执行** —— 需运行中的 Mall + 真实 Postgres + 一条已报价询价单，本次环境不具备；HTTP 层已由 5.1–5.5 经完整 app（guard + ValidationPipe + 投影 + ResponseInterceptor）覆盖，仅数据层为 mock。留待部署前人工核对。
- [ ] 5.8 全量门禁 `pnpm lint && pnpm build && pnpm test && pnpm test:e2e`。**build / test / e2e 已全绿（归档后补修）**：`test/equipment-anonymous.e2e-spec.ts` 的 `signAdminToken` 补上 `realm: 'user'` 后，`pnpm test:e2e` → 4 套件 / 50 用例全通过；`tsc`（core + domain）+ 两应用 `nest build` 通过；domain 38 用例通过。**lint 未通过，且属仓库既有状态**：按脚本范围（`apps/**` + `test/**`）实测 750 个问题（673 errors / 77 warnings，主体是既有测试代码与既有 app 代码的 `no-unsafe-*`），本次新增文件贡献约 51 个、与既有规则同类；拉平需独立变更。

## 6. 提交

- [ ] 6.1 以 conventional commits 提交（默认中文描述），示例：`fix(inquiry): 详情响应暴露明细行并修复金额序列化`。**未执行** —— 工作区存在与本次改动无关的未提交变更（`package.json`、若干 `docs/` 删除与新增、`.workbuddy/`），提交范围需由你决定。
