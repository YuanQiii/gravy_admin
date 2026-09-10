# ADR 0014: 询价单客户提交/取消与入壁收紧

- 状态：已接受

- 日期：2026-09-10

- 关联：ADR 0009（独立 B2C Customer JWT 认证域）、ADR 0011（客户授权模型与安全取舍）、ADR 0013（客户侧事件表快照/门禁）、CONTEXT.md 词条 `Inquiry` / `InquiryLine` / `assertFilterBrowseable`

## 背景

对 Mall 询价（inquiry）业务做设计审查，暴露五类问题：

1. **状态机缺静默取消**：`INQUIRY_STATUS` 只有 `draft / submitted / quoted / expired`（[inquiry.constant.ts](../../packages/core/src/shared/constants/inquiry.constant.ts)），无 `cancelled`。客户自助创建（`createForCustomer`，见 [inquiries.service.ts](../../packages/domain/src/inquiry/inquiries/inquiries.service.ts)）固定落 `draft`，而 mall 控制器（[mall-inquiries.controller.ts](../../apps/mall/src/modules/mall/inquiries/mall-inquiries.controller.ts)）只暴露创建/列表/详情，**没有提交与取消入口** —— 客户创建的询价单永远停在 `draft`，只能靠后台 `updateStatus` 手动推 `submitted`。
2. **明细行无数量上限**：`lines` 仅 `ArrayMinSize(1)` 无上限（[create-customer-inquiry.dto.ts](../../packages/domain/src/inquiry/inquiries/dto/customer-b2c/create-customer-inquiry.dto.ts)），可在持有 advisory lock 的单事务内提交上千行、逐行 `findUnique`，构成 DoS/性能隐患。
3. **filterId 可见性只查软删**：明细行建行仅检查 `filter.deletedAt`，未校验 `enabled`，与收藏/浏览共用的"当前可用性门禁"谓词 `assertFilterBrowseable`（存在 + `status='enabled'` + 未软删）不一致。
4. **软删明细行仍回显**：详情/列表 `include inquiryLines` 未过滤 `deletedAt`，被软删的明细仍暴露给客户。
5. **价格字段无消费者**：`Inquiry.totalAmount` 无任何写入方；`unitPrice/subtotal` 仅 admin 侧 `InquiryLinesService` 写入且不聚合。

## 决策

### 1. 状态机补 `cancelled`，客户可提交/取消

- 新增状态 `CANCELLED = 'cancelled'`。流转矩阵扩展为：

  - `draft → submitted | cancelled`

  - `submitted → quoted | cancelled`

  - `quoted → expired`（**quoted/expired 不可取消**——已报价/已过期走售后另行处理）

- 补 `cancelledAt DateTime?` 列，与 `submittedAt`/`quotedAt` 对称（**需新迁移，生产经** **`migrate deploy`，禁** **`db push`**）。

- Mall 新增两个客户端点：`POST /inquiries/:id/submit`（`draft→submitted`，置 `submittedAt`）、`POST /inquiries/:id/cancel`（`draft|submitted→cancelled`，置 `cancelledAt`）。所有权校验沿用 `createForCustomer` 的 `customerId` 首参模式（非本人返回 404/400，不泄露他人询价）。

- 后台 `updateStatus` 同样允许 `draft|submitted→cancelled`；`quoted`/`expired` 不可被任何路径取消。

### 2. 明细行数量上限 + 批量查滤清器

- `lines` 增 `@ArrayMaxSize(50)`。

- 建行前将全部 `filterId` 聚为一次 `findUnique` 批量读取（`inquiryLines.filterId in [...]`），替代逐行 N+1；语义不变。

### 3. filterId 复用 `assertFilterBrowseable`

明细行引用 `filterId` 时统一走领域谓词 `assertFilterBrowseable`（存在 + enabled + 未软删），disabled 返回 400。与收藏/浏览共用同一"当前可用性门禁"，消除三处门禁分叉。

### 4. 软删明细行过滤展示

`findOneForCustomer` / `findOne` 的 `include inquiryLines` 补 `where: { deletedAt: null }`；本轮不加明细级删除端点（行删除归属 admin 编辑询价能力）。

### 5. 价格填充/汇总归 admin 报价职责

`totalAmount`/`unitPrice`/`subtotal` 的填充与聚合属 **admin 报价模块**边界，Mall 客户路径不承担（客户建询价时无价格输入，价格字段保持 `null`）。响应 DTO 的 `totalAmount?: any` 收紧为精确类型作为清理项。`quoted→expired` 的手动或自动过期机制同样记为 **admin/ops 职责**，Mall 不做自动过期 job、不做被动过期展示。

## 备选方案（已否决）

- **不加取消，维持单向 draft→submitted→quoted→expired**：客户询价管控能力缺失，误建/放弃的草稿只能永久滞留。否决。

- **DRAFT 阶段开放客户编辑**：需新增编辑路由 + 明细行增删，状态机复杂度上探；当前最小模型已满足"下单即定稿、留改则取消重建"。否决（YAGNI），产品出现反复改草稿诉求时再开。

- **明细行级客户删除**：与「一笔询价是原子业务单元」相悖，删除粒度归 admin。否决。

- **价格写入下沉 Mall**：与客户自服务「只询价不报价」语义冲突，跨端职责耦合。否决。

## 后果

正面：

- 客户获完整的自助闭环（创建 → 提交 → 取消），后台仍可控报价/过期；所有权校验沿既定首参模式一致。

- 明细行上限 + 批量查 + 统一 `assertFilterBrowseable`，消除 DoS 面与三处门禁分叉；软删明细不再泄露。

- 职责边界清晰：价格与过期都是 admin/ops 域，Mall 不复沓。

负面/风险：

- **新增迁移**：`cancelledAt` 需要一次 schema 迁移；生产经 `migrate deploy` 应用（禁 `db push`）。

- **行为变更**：`Inquiry` 状态枚举/流转矩阵扩展，后台 Query/DTO 校验与可能的前端状态展示需同步；存量明细行若含已禁用滤清器，新增门禁后提交此类询价会 400（阈值性回归，需人工处置存量数据时留意）。

- **取消不可逆**：`cancelled` 无出边，一旦取消即终态；需向调用方（前端）明示。

## 参考

- 实现（现状）：`packages/domain/src/inquiry/inquiries/inquiries.service.ts`、`packages/domain/src/inquiry/inquiry-lines/inquiry-lines.service.ts`、`packages/core/src/shared/constants/inquiry.constant.ts`、`apps/mall/src/modules/mall/inquiries/mall-inquiries.controller.ts`

- 门禁谓词：`packages/domain/src/equipment/filters/active-filter.ts`（`assertFilterBrowseable`）

- 数据结构：`prisma/schema.prisma` `model Inquiry` / `model InquiryLine`

