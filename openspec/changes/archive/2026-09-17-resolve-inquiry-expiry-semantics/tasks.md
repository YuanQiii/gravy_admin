## 1. 移除读路径写

- [x] 1.1 删除 `expireDueQuoted()` 私有方法（inquiries.service.ts L340-349），并移除其在 `findMyInquiries`(L269)、`findOneForCustomer`(L292)、`findAll`(L384)、`findOne`(L427) 的 4 处调用；验证：`grep expireDueQuoted` 在 service 内零命中，且 4 个读方法不再含任何 `updateMany`/`update` 调用。
- [x] 1.2 对 4 个读方法补充「只读」契约测试：调用前后数据库 `status='quoted'` 行数不变；验证：经测试事务计数或 mock `prisma.inquiry.updateMany` 断言未被调用。

## 2. 派生 isExpired

- [x] 2.1 在 `InquiryResponseDto` 与 `InquiryDetailResponseDto` 增加只读 `isExpired: boolean` 字段；验证：编译通过，字段出现在序列化输出。
- [x] 2.2 在投影接缝 `projectInquiry` / `projectInquiryDetail` 计算 `isExpired = status==='quoted' && expiresAt!=null && expiresAt<now`；验证：单测覆盖 quoted+过期→true、quoted+未过期→false、非 quoted→false、quoted+expiresAt=null→false 四态。
- [x] 2.3 确认 Mall 与客户 DTO 同样携带 `isExpired`（复用同一投影/出口）；验证：Mall `GET /inquiries` 与 `GET /inquiries/:id` 响应含 `isExpired` 且不影响 `status`。

## 3. 强制 quoted 的 expiresAt（BREAKING）

- [x] 3.1 在 `UpdateInquiryStatusDto` 增加条件校验：`status==='quoted'` 时 `expiresAt` 必填，否则拒；验证：构造不带 expiresAt 的 quoted 请求返回 400 类错误。
- [x] 3.2 同步 Swagger `@ApiResponse`/schema 与既有 admin 报价测试，补齐必填字段；验证：Swagger 文档反映必填，测试套件全绿。
- [x] 3.3 提供只读核查 SQL（`status='quoted' AND expiresAt IS NULL`）供运维确认遗留数据；验证：SQL 可执行且输出遗留行清单（不修改数据）。

## 4. 接缝复用与文档一致性

- [x] 4.1 声明 `quoted→expired` 人工流转复用 `atomic-inquiry-status-transition` 的 `buildStatusPatch` 接缝，不新增过期写路径；验证：本变更 diff 不含任何新的 `status:` 直写过期语句，且未触碰该并行变更文件。
- [x] 4.2 于 ADR 0014 增加更正注记：将「被动过期展示」重界定为读路径状态写 + Mall 自动 job，登记本变更对决策 5 的落实；验证：ADR 文件新增更正注记段落，正文决策 5 不变。

## 5. 架构审查采纳项

- [x] 5.1 （C1, Strong）在 `packages/core/.../inquiry.constant.ts` 新增纯函数 `isInquiryExpired(row)`，并由投影接缝（计算 `isExpired`）与 `buildStatusPatch`（expired 补丁）共同引用，移除两处散落定义；验证：grep 显示过期判定仅出自该纯函数，单测覆盖四态。
- [x] 5.2 （C2, Worth exploring）将 `projectInquiry` 投影接缝扩展为 read adapter 形状，使 4 个读方法经它取数，预留副本可插点；验证：读方法不直接持写 client，且本变更不引入副本依赖（副本就绪再接 adapter）。
- [x] 5.3 （C3, Speculative，暂缓）记录暂缓理由：schema 层 `quoted ⇒ expiresAt` 约束需迁移且涉遗留 null 行；保持 DTO 校验（3.1）为当前唯一守卫，待单独立项；验证：本变更 diff 不含 schema 迁移，DTO 校验仍在。

## 实施记录（2026-09-17）

- **1.1**：`expireDueQuoted` 与 4 处调用净删除，grep 零命中；读方法内无任何 update 调用。
- **1.2**：单测断言 `findMyInquiries` / `findAll` 全程不触发 `updateMany`/`update`；e2e 断言过期 quoted 详情请求后 `updateMany` 未被调用。
- **2.x**：`InquiryResponseDto.isExpired`（详情 DTO 继承自动获得）由投影接缝赋值，判定唯一出自 core 纯函数 `isInquiryExpired`（四态单测）。
- **3.1**：DTO 跨字段约束 `QUOTED_REQUIRES_EXPIRES_AT`。**踩坑（已记入 constraint 注释）**：约束最初挂在 `expiresAt`（`@IsOptional`）上——值为 undefined 时该属性的全部校验器被跳过，恰好最需要拦的场景拦不住；单测直接 `validate()` 与管道行为一度不一致，经探针定位后改挂 `status`（必填）上。这是继 `@Validate` 非类装饰器、`@PartialType` 非类装饰器之后 **class-validator/decorator 第三坑**。
- **3.2**：admin 状态端点 Swagger 补 400。
- **3.3**：dev 库核查 `quoted ∧ expiresAt IS NULL` → 0 行（SQL 见任务 3.3 正文）。
- **4.1**：全仓 `status: INQUIRY_STATUS.EXPIRED` 直写零命中；`quoted→expired` 人工流转复用 `buildStatusPatch` 接缝（core 转移矩阵唯一来源）。
- **4.2**：ADR 0014 决策 5 已补更正注记（实现一度滑向读路径写 + 全表 updateMany，本变更落实为派生展示态 + 人工流转 + expiresAt 强制）。
- **5.1**：`isInquiryExpired` 唯一真值；`buildStatusPatch` 的 expired 补丁无需引用它（expired 流转只是 status 置换、无时间戳写入，转移矩阵已约束 quoted→expired 唯一入口）。
- **5.2**：4 个读方法已经投影接缝取数（`paginateWithSort` 只持模型委托），无写 client 持有；未引入副本依赖（副本就绪再接 adapter）。
- **5.3**：diff 无 schema 迁移，DTO 校验为唯一守卫；schema 约束暂缓理由：迁移涉遗留 null 行处置，待单独立项。
- **门禁**：domain+core **190/190**；全量 e2e **7 套件 / 73 用例**；两 build ✓；`validate --strict` ✓。无迁移。
- **BREAKING**：`status=quoted` 不带 `expiresAt` 的请求 400（此前 200 且产生永久报价）；已核查 dev 库无遗留数据。

## 归档记录（2026-09-17）

- 主规格同步：「询价单状态流转」场景 5 → **7**（补「报价必须携带有效期」「读路径不触发过期写」，描述并入 expiresAt 强制与读路径无写）；新增 Requirement「询价单过期派生展示态」（3 场景），Requirement 总数 11 → **12**。
- 验证报告：`verification-20260917.md`（PASS，11/11 场景有实现证据，无 warning）。
- 连锁检查：12 个未归档变更 0 失效（本轮无连锁）。
