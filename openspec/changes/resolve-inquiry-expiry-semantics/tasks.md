## 1. 移除读路径写

- [ ] 1.1 删除 `expireDueQuoted()` 私有方法（inquiries.service.ts L340-349），并移除其在 `findMyInquiries`(L269)、`findOneForCustomer`(L292)、`findAll`(L384)、`findOne`(L427) 的 4 处调用；验证：`grep expireDueQuoted` 在 service 内零命中，且 4 个读方法不再含任何 `updateMany`/`update` 调用。
- [ ] 1.2 对 4 个读方法补充「只读」契约测试：调用前后数据库 `status='quoted'` 行数不变；验证：经测试事务计数或 mock `prisma.inquiry.updateMany` 断言未被调用。

## 2. 派生 isExpired

- [ ] 2.1 在 `InquiryResponseDto` 与 `InquiryDetailResponseDto` 增加只读 `isExpired: boolean` 字段；验证：编译通过，字段出现在序列化输出。
- [ ] 2.2 在投影接缝 `projectInquiry` / `projectInquiryDetail` 计算 `isExpired = status==='quoted' && expiresAt!=null && expiresAt<now`；验证：单测覆盖 quoted+过期→true、quoted+未过期→false、非 quoted→false、quoted+expiresAt=null→false 四态。
- [ ] 2.3 确认 Mall 与客户 DTO 同样携带 `isExpired`（复用同一投影/出口）；验证：Mall `GET /inquiries` 与 `GET /inquiries/:id` 响应含 `isExpired` 且不影响 `status`。

## 3. 强制 quoted 的 expiresAt（BREAKING）

- [ ] 3.1 在 `UpdateInquiryStatusDto` 增加条件校验：`status==='quoted'` 时 `expiresAt` 必填，否则拒；验证：构造不带 expiresAt 的 quoted 请求返回 400 类错误。
- [ ] 3.2 同步 Swagger `@ApiResponse`/schema 与既有 admin 报价测试，补齐必填字段；验证：Swagger 文档反映必填，测试套件全绿。
- [ ] 3.3 提供只读核查 SQL（`status='quoted' AND expiresAt IS NULL`）供运维确认遗留数据；验证：SQL 可执行且输出遗留行清单（不修改数据）。

## 4. 接缝复用与文档一致性

- [ ] 4.1 声明 `quoted→expired` 人工流转复用 `atomic-inquiry-status-transition` 的 `buildStatusPatch` 接缝，不新增过期写路径；验证：本变更 diff 不含任何新的 `status:` 直写过期语句，且未触碰该并行变更文件。
- [ ] 4.2 于 ADR 0014 增加更正注记：将「被动过期展示」重界定为读路径状态写 + Mall 自动 job，登记本变更对决策 5 的落实；验证：ADR 文件新增更正注记段落，正文决策 5 不变。

## 5. 架构审查采纳项

- [ ] 5.1 （C1, Strong）在 `packages/core/.../inquiry.constant.ts` 新增纯函数 `isInquiryExpired(row)`，并由投影接缝（计算 `isExpired`）与 `buildStatusPatch`（expired 补丁）共同引用，移除两处散落定义；验证：grep 显示过期判定仅出自该纯函数，单测覆盖四态。
- [ ] 5.2 （C2, Worth exploring）将 `projectInquiry` 投影接缝扩展为 read adapter 形状，使 4 个读方法经它取数，预留副本可插点；验证：读方法不直接持写 client，且本变更不引入副本依赖（副本就绪再接 adapter）。
- [ ] 5.3 （C3, Speculative，暂缓）记录暂缓理由：schema 层 `quoted ⇒ expiresAt` 约束需迁移且涉遗留 null 行；保持 DTO 校验（3.1）为当前唯一守卫，待单独立项；验证：本变更 diff 不含 schema 迁移，DTO 校验仍在。
