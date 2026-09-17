# 验证报告 — resolve-inquiry-expiry-semantics（P1-3）

- 日期：2026-09-17
- 验证方式：逐 Scenario 对照实现证据 + 门禁复跑 + 只读数据核查
- 结论：**PASS**。任务 13/13；delta 11/11 场景均有实现证据；无 warning，2 条 suggestion（不阻塞）。

## 场景 → 实现证据

| Scenario | 证据 |
|---|---|
| 提交询价单 | `transitionForCustomer` → `applyStatusTransition` 接缝（P0-3 已验证） |
| 非法逆向流转 | `isValidStatusTransition` 快校验 409（既有，保持） |
| 并发流转只有一个成功 | 条件写 `updateMany { where: { status: expectedStatus } }`（P0-3） |
| 失效更新不写入任何字段 | 接缝 count!==1 → 归因重读 → 409（P0-3） |
| 重复提交被拒 | e2e `inquiry-status-transition`「重复 submit」用例 |
| 报价必须携带有效期 | `QuotedRequiresExpiresAtConstraint` 挂必填 `status` 字段；e2e「quoted 缺 expiresAt → 400」+ DTO 单测 4 例 |
| 读路径不触发过期写 | `expireDueQuoted` 及 4 处调用 grep 零命中；单测断言 `findMyInquiries`/`findAll` 全程不触发 `updateMany`/`update`；e2e 断言过期 quoted 详情请求后 `updateMany` 未被调用 |
| 管理员见派生过期标记 | `projectInquiry`/`projectInquiryDetail` 赋值 `dto.isExpired = isInquiryExpired(row)`；e2e 过期 quoted → `isExpired: true` 且 `status` 不变 |
| 未过期报价标记为假 | e2e `isExpired: false` 分支 |
| 非 quoted 状态标记恒为假 | core 纯函数四态单测（draft/submitted/expired/cancelled + quoted∧expiresAt=null） |

## 验证中确认的事实

1. **判定唯一真值**：`isInquiryExpired` 全仓唯一（core 常量文件，与 `INQUIRY_STATUS_TRANSITIONS`/`buildStatusPatch` 同 module）；投影接缝与 e2e 均引用它，无散落第二实现。
2. **无自动过期写路径**：全仓 `status: INQUIRY_STATUS.EXPIRED` 直写零命中；`quoted→expired` 唯一入口是转移矩阵约束下的人工流转。
3. **ADR 0014**：决策 5 更正注记已补（`docs/adr/0014-*.md`），正文未改。
4. **数据核查（dev 库，只读）**：`status='quoted' AND expiresAt IS NULL AND deletedAt IS NULL` → 0 行，BREAKING（quoted 必填 expiresAt）无存量冲突。
5. **门禁复跑**：domain+core 190/190；全量 e2e 7 套件 / 73 用例；mall/admin build ✓；`validate --strict` ✓。

## 实施偏离（已在 tasks 记录）

- 任务 3.1 的约束落点：原计划只说"DTO 条件校验"，未指定挂在哪个字段。实际实现发现挂 `@IsOptional()` 字段（expiresAt）会被 class-validator 整体跳过（undefined 时），必须挂必填字段 `status`。这是本变更最有价值的发现，已写入 constraint 注释与工作日志。

## Suggestions（不阻塞）

- **S1**：`isExpired` 的"过期"时间基准用服务端时钟，响应里未带生成时间戳；若客户端要做倒计时，可考虑未来在响应里附 `serverTime`（独立小变更，勿夹带）。
- **S2**：任务 5.2（read adapter 形状）当前以"读方法经投影接缝 + `paginateWithSort` 只持模型委托"满足，未做结构性改造。若未来接只读副本，建议届时把 4 个读方法的 client 解析也收进接缝，形成真正的 read adapter。

## 主规格同步（归档时执行）

- 「询价单状态流转」：描述更新（quoted 必填 expiresAt、expired 仅人工、读路径无过期写），场景 5 → 7。
- 新增 Requirement「询价单过期派生展示态」（3 场景），主规格 Requirement 总数 11 → 12。
- 连锁检查：12 个未归档变更 `validate --strict` 全部有效（本轮 **无** 连锁失效——「询价单状态流转」当前无其他变更 MODIFIED）。
