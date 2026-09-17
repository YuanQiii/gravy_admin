## Context

Mall 自助域三端点（地址 / 收藏 / 历史）的列表查询 DTO 当前声明了不被消费的字段（已逐文件核实）：`findMyAddresses`（`apps/mall/src/modules/mall/addresses/customer-addresses.service.ts:72-87`）的 where 仅 `{ deletedAt: null, customerId }`，customerId 来自方法参数而非 DTO，DTO 仅被 `paginateWithSort` 用于分页/排序，故 `QueryAddressDto` 的 `customerId`/`receiver`/`phone` 全为死字段；`findFavorites`/`findHistory`（`apps/mall/.../customer-activity.service.ts:127-151`、`246-296`）的 where 读 `query.customerId`，但 `favorites.controller.ts:68` 与 `history.controller.ts:44` 无条件覆写为当前客户，故客户端传入的 `customerId` 恒为 no-op，而 `filterId` 被实际消费。`PaginationSortDto`（`packages/core/src/shared/dtos/pagination.dto.ts:78`）仅提供分页/排序字段。全局 `ValidationPipe` 已开启 `whitelist + forbidNonWhitelisted`（`packages/core/src/bootstrap/configure-app.ts:54-56`），故删除 DTO 字段将改变客户端失败模式（由静默忽略转为 400）。

## Goals / Non-Goals

**Goals:**
- 契约与实现对齐：自助查询 DTO 仅声明被消费的字段，Swagger 如实反映。
- 身份唯一来源：`@CurrentCustomer()`，DTO 层不表达身份。
- 诚实失败：未知查询字段 → 400，而非静默忽略。

**Non-Goals:**
- 不为 `receiver` / `phone` 实现模糊搜索（PII 新功能，超出本变更范围）。
- 不改 admin 地址 DTO/Service（独立本地文件，行为不变）。
- 不改 `PaginationSortDto` 基类。

## Decisions

1. **删除自助地址 DTO 的 `receiver` / `phone`（而非在 Service 实现筛选）**
   - 理由：二者为死字段，导致静默契约失真；本变更目标是「契约 = 实现」，而非「新增搜索特性」。`receiver`/`phone` 属 PII（收货人姓名、电话），实现 `contains` 模糊匹配会：① 在查询串/日志中暴露 PII；② 触发全表 `LIKE` 扫描（即使 customerId 绑定也失去索引友好性）；③ 引入未经安全评审的新攻击面。项目地址模块既有哲学即「身份/参数最小化、契约诚实」（`mall-addresses.controller.ts:26` 注释「请求体不含 customerId（forbidNonWhitelisted 拒绝）」）。
   - 备选否决：在 Service 中真正实现 `receiver`/`phone` 模糊筛选 —— 否决，属新功能，需独立变更与安全评审，与本变更「对齐」目标相悖。

2. **拆分出 `*SelfQueryDto`（无 `customerId`），`filterId` 保留**
   - 理由：地址查询无任何内容筛选需求，故 `QueryAddressSelfDto` 仅继承 `PaginationSortDto`；收藏/历史查询的 `filterId` 被 `findFavorites`/`findHistory` 实际消费，故保留。删除被覆写的 `customerId` 并移除 Controller 覆写行，使「身份仅来自 `@CurrentCustomer()`」在 DTO 层可见、可静态检查。
   - 备选否决：保留 `customerId` 字段并继续覆写 —— 否决，该字段误导客户端以为可指定他人，且违反模块既有身份哲学。

3. **标记 BREAKING 并依赖 `forbidNonWhitelisted`**
   - 理由：删除字段后，旧客户端发送这些参数由「静默忽略」转为 400，是契约纠正性的对外行为变更，须如实标注并通知客户端去除这些参数。
   - 备选否决：保留字段但仅文档标注「忽略」 —— 否决，无法消除契约失真根因，客户端仍会按文档误用。

## Risks / Trade-offs

- [删除字段 → 400] 现有客户端若仍发送 `customerId`/`receiver`/`phone` 将立即 400。→ 缓解：变更说明要求客户端移除这些参数；属 fail-fast 合理代价，且比静默错误结果更可取。
- [`filterId` 误删] 若将 `filterId` 一并删除会破坏收藏/历史按滤清器筛选功能。→ 缓解：仅删 `customerId`，保留 `filterId`（已由 Service where 消费，已核实）。
- [admin 误伤] 报告担忧 admin 复用同一 DTO。→ 已核实 admin 使用独立本地 `QueryAddressDto` 文件（`apps/admin/src/modules/addresses/dto/query-address.dto.ts`），其 `AddressesService.findAll`（`apps/admin/src/modules/addresses/addresses.service.ts:54-61`）仍消费 `customerId`/`receiver`/`phone`，本变更零影响。

## Migration Plan

- 客户端：停止在 `GET /addresses`、`GET /favorites`、`GET /history` 查询串中发送 `customerId`/`receiver`/`phone`。
- 回滚：恢复三处 DTO 字段即回退；若已发布客户端已去除这些参数，回滚亦安全。

## Open Questions

（无）

## 架构审查回写（grilling 采纳项）

审查对象为本变更的 4 份规划件。用户已预授权「同意推荐」，故对候选一律采纳其推荐项，否决项写明理由。术语沿用 codebase-design 词汇（module / interface / implementation / depth / seam / adapter / leverage / locality）。

- **候选 1（Strong）· 合并自助查询 DTO 为单一深模块 —— 采纳。** 当前 `QueryAddressSelfDto` / `QueryFavoriteSelfDto` / `QueryHistorySelfDto` 三处各写一遍「分页 +（filterId）」契约，重复且易漂移。深化：在 `@gvray/core` 或 mall-shared 抽出 `SelfPagedQueryDto`（仅分页/排序）与 `SelfFilterableQueryDto extends SelfPagedQueryDto`（增添 `filterId`）；三处 DTO 改为继承，仅声明差异。删除测试通过（删去三处重复声明会把契约复杂度集中到一处，满足 deletion test）。收益：`locality`（契约集中）、`leverage`（一接口三调用点）、`depth`（基类深、子类浅）。**不改任何对外行为**。
- **候选 2（Worth exploring）· 「查询不含身份」不变式变为受测 seam —— 采纳（轻量）。** 不变式目前仅靠文档与全局 `forbidNonWhitelisted` 隐式保证，无自动护栏。深化：新增一处共享测试适配器，断言 self DTO 不声明身份字段且未知字段→400，复用至三端点，防回归。收益：`locality`（不变式集中）、`leverage`（一处断言覆盖三端点）。
- **候选 3（Speculative）· 抽出 query→where 映射适配器 —— 否决。** `findFavorites` / `findHistory` 仅两处、映射为单行 `if (query.filterId) where.filterId = query.filterId`；抽适配器是为微小收益新增模块，与本次「契约对齐」窄范围及不过度工程原则冲突，且并行变更 `align-mall-self-query-dtos` 不引入新运行时依赖。维持手写，不记入 tasks。
