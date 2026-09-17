# ADR 0013: 浏览历史保留策略与快照投影对齐

- 状态：已接受
- 日期：2026-09-10
- 关联：ADR 0009（独立 B2C Customer JWT 认证域）、ADR 0011（客户授权模型与安全取舍）、CONTEXT.md 词条 `CustomerHistory` / `CustomerFavorite` / `Event-type table`

## 背景

对 Mall 浏览历史功能（[spec.md](../../openspec/specs/customer/spec.md) 的「浏览历史管理」）做设计审查，暴露四类问题：

1. **无界增长**：`CustomerHistory` 以 `(customerId, filterId)` 唯一去重，但每条不同滤清器永久落一行，随浏览扩张线性累积，且仅当 Customer/Filter 硬删才级联清理（`onDelete: Cascade`）。
2. **投影口径不一致**：收藏快照派生 `filterAvailable`（status+deletedAt），历史快照只回 model/gencode/typeName，两类列表在前端需两套失效判断；且两者均缺图片字段，无法撑起卡片 UI。
3. **只支持单条删除**：无「清空历史」，不符合浏览历史的产品习惯。
4. **过期注释**：Service 类注释写「历史用软删除 update set deletedAt」，与 spec「无软删除、硬删」及实现相悖，且 schema 根本无该列。

## 决策

### 1. 每客户保留上限 + 写入事务内淘汰

浏览历史本质是「最近浏览」而非永久收藏，因此给每个客户设**上限 `HISTORY_LIMIT = 100`**，超出淘汰最旧。

- 在 `recordView` 的 upsert **同一事务内**完成淘汰：取该客户按 `visitedAt desc` 跳过前 100 的 `historyId`，`deleteMany` 掉，一次查询 + 一次删除，无定时任务、无异步一致性风险。
- 为让「取该客户按 visitedAt 排序」走索引，`CustomerHistory` 需补 `@@index([customerId, visitedAt])`（**新迁移**）。
- 上限为**客户维度软上限**（当前客户本人），不跨客户；`Customer`/`Filter` 的 `onDelete: Cascade` 级联不变。

### 2. 快照投影对齐：收藏 / 历史共用同一字段集

两者快照统一为 `model / gencode / typeName / photoUuid`，并派生 `filterAvailable`（`filter.status === 'enabled' && deletedAt == null`）。

- `photoUuid` 取自 `Filter`（[schema](../../prisma/schema.prisma) 既有列），前端以 uuid 拼资产 URL。
- 「已失效/已软删滤清器」历史记录仍按最后快照返回、不静默丢失（沿用 spec 语义），仅以 `filterAvailable` 供前端置灰。

### 3. 新增「清空历史」

`DELETE /history`（仅当前登录客户本人）清空其全部历史；返回 `{ deleted: count }`，空历史返回 `{ deleted: 0 }` 且**不抛 404**。`DELETE /history/:id` 单条硬删保留。

### 4. `recordView` 保持不自校验，仅声明不变量

`recordView` 不重复做滤清器可用性校验（当前唯一调用点已被 `findOne` + `MALL_OPTS` 前置门禁，失败已 404），避免冗余 DB 查询（对齐 `createFavorite` 的防御是审慎，但历史写路径已有更强前置门禁）。在其 javadoc 写明**调用不变量**：「仅允许在滤清器可见性校验成功后调用」。

### 5. 每次浏览即写库为既定行为

登录客户每次访问详情即 upsert 更新 `visitedAt`，不加防抖。该接口带限流（60 req/min/IP）且仅登录态写，写放大有限；作为既定行为写入 spec，不再视为噪声。

## 备选方案（已否决）

- **不定上限，依赖清理任务**：需引入定时任务/索引/运维成本，且历史列表会随浏览无限膨胀，违背「最近浏览」语义。否决。
- **上限设为 Infinity（无上限）**：存储与查询随历史线性恶化，否决。
- **`recordView` 内自行 `assertFilterBrowseable`**：白费一次 DB 往返，前置门禁已更强覆盖；仅在无前置门禁的未来调用点出现时才需要。否决（YAGNI），保留 NotBefore 不变量的 javaDoc 声明。
- **历史快照不派生 `filterAvailable`**：使收藏/历史两列表失效判断分叉，前端需两套逻辑。否决。

## 后果

正面：

- 历史存储有界（每客户 ≤100），查询/排序走 `(customerId, visitedAt)` 索引，写路径无额外一致性复杂度。
- 收藏/历史两张列表共享同一快照字段集与失效语义，前端一套卡片组件；UX 一致性提升。
- 清空历史补齐常见产品操作，成本极低。

负面/风险：

- **新增迁移与索引**：`@@index([customerId, visitedAt])` 需要一次 schema 迁移；生产需经 `migrate deploy` 应用（禁 `db push`）。
- **每客户淘汰是全量 ordered 扫描裁剪**：极端情况下单客户历史恰为上限时每次浏览多一次 `findMany(skip:100)` + `deleteMany`。缓解：`(customerId, visitedAt)` 索引使有序取 `skip 100` 高效；该扫描仅在写路径发生。
- **`DELETE /history` 幂等语义**：空历史返回 `{"deleted":0}` 而非 404，需前端与调用方按「0 即无」处理。

## 参考

- spec：[openspec/specs/customer/spec.md 浏览历史管理](../../openspec/specs/customer/spec.md)
- 数据结构：`prisma/schema.prisma` `model CustomerHistory`
- 实现：`apps/mall/src/modules/customer-activity/`（`CustomerActivityService.recordView/findHistory/removeHistory`、`HistoryController`）、`apps/mall/src/modules/mall/browse/filter-detail.flow.ts`
- **更正注记（2026-09-17，变更 `take-history-write-off-request-path`）**：本 ADR 决策 3（D3）中 `recordView` 以 `await` 进入详情响应链的实现已反转为 **fire-and-forget**：写入经 `HistorySideEffectService.record()` 脱离响应链（响应不再被 upsert + 淘汰事务拖累，登录/匿名客户详情路径一致性恢复），失败以 \`record_view_failed\` warn 记录并凭 \`x-request-id\` 关联，不再静默吞掉。依据：公开详情端点（匿名可打）的 P95 不应被登录客户的副作用拖累，且写失败与浏览成功本身无关（无事务边界依赖）。淘汰上限（100 条）与快照策略不变。
