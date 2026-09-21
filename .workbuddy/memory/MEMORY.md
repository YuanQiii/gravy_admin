# MEMORY.md — gvray 项目长期笔记

## 未归档变更积压（2026-09-17 建立）

2026-09-16/17 的一轮"业务审查问题清单逐项规划"产生 **17 个未归档 openspec 变更**（对应 Mall 业务审查报告 18 项问题中的 17 项；P0-1 已归档）。全部通过 `openspec validate --strict`，**均未实现、未提交**。

明细、每项的方案/审查采纳/事实修正、以及**必须遵守的串行约束**见 `.workbuddy/memory/2026-09-16-mall-issue-sweep.md`（含 `inquiries.service.ts` 的 7 变更重叠顺序、两处 Requirement 被多变更改写的先后关系）。

落地前的关键提醒：
- 多个变更改同一文件（`packages/domain/src/inquiry/inquiries/inquiries.service.ts` 被 7 个变更触及），实施必须串行。
- 归档有顺序要求（P3-4 → P3-5；P0-2 → P2-4）。

## openspec 使用要点（本项目实证）

- **完整流水线经验已沉淀为项目级 skill**：`.workbuddy/skills/openspec-issue-sweep/`（SKILL.md 流程 + references/archive-playbook.md 归档/delta 重放手册 + 8 条实证坑）。处理 openspec 变更（propose/apply/archive）前先读它；项目级 skill 无法经 Skill 工具加载，直接 Read 该 SKILL.md。

- `openspec validate <change> --strict` 会检查：`## MODIFIED Requirements` 必须承载原 Requirement 的**全部** Scenario，否则报 "MODIFIED omits scenario(s)"。因此**纠正文档里的错误主张**应优先用 `REMOVED + ADDED`（新增 Requirement 名），而不是就地改写 —— 后者要么保留"名字与断言相反"的场景，要么被校验器拒绝。RENAMED + MODIFIED 组合已尝试并放弃。
- **同一 Requirement 被多个未归档变更改写时，后归档者必须把 delta 重放到合并后的主规格上**（实证：P0-2 归档把「询价单创建」3→5 场景后，P2-4 的 MODIFIED 块立刻被 `validate --strict` 判为遗漏场景）。落地顺序见 `2026-09-16-mall-issue-sweep.md` 的串行约束表。**重放方法（2026-09-17 实证）**：以合并后主规格的 Requirement 块为基底、只叠加本变更自己的约束句/场景，而不是在旧 delta 上补场景——前者自动保住其他变更（如 201 措辞、fire-and-forget）已合并的文本不回退。`openspec archive -y` 每次只报第一个冲突的 Requirement，需循环修复直到归档成功。
- `openspec new change` 若目录已存在会失败（不会覆盖）——子代理被中断后可能留下空壳目录，需先检查 `.openspec.yaml` 是否存在再补齐。
- Change 的 delta 文件路径：`openspec/changes/<name>/specs/<capability>/spec.md`，capability 名必须是 `openspec/specs/` 下已有目录名（或新引入的 kebab-case）。

## 仓库事实校正（与 `AGENTS.md` 不一致处）

- `AGENTS.md` 声称 `prisma/schema.prisma` 使用 `relationMode = "prisma"`「无外键约束」：**不实**。`datasource` 块未声明该选项，`prisma/migrations/0_init/migration.sql` 建立了真实外键（如 `inquiries_shippingAddressId_fkey ... ON DELETE SET NULL`），即级联行为是 **DB 级**的。`snapshot-inquiry-shipping-address` 的 tasks 4.2 已列入订正项。

## 项目级 skill 的加载方式

`{workspace}/.workbuddy/skills/<name>/SKILL.md` 无法通过 Skill 工具加载（返回 `Can not find skill`）。以 `@skill:<name>` 附加时，直接 `Read` 该 `SKILL.md` 并按其步骤执行即可。

## 业务领域（2026-09-18 厘清，用于回答业务类问题）

GVRAY 的真实业务是**滤清器（Filter）选型 + 询价（RFQ）平台**，不是常规"商品→购物车→下单支付"的电商。

- 业务主线：`Equipment`（工程机械/发动机设备：品牌+型号+发动机品牌/型号+功率+生产日期区间）↔ `Filter`（滤清器：model/gencode/容积/重量/尺寸 D1·D2·D3·D7·D8·H1·H2·H3/兼容性 JSON/图片图纸）通过 `EquipmentFilter` 多对多建立**适配兼容矩阵**。客户按设备找到适配滤清器 → 收藏/浏览 → **发起询价单** → 提交 → 后台销售/客服跟进报价（`draft → submitted → quoted → expired`）。
- `FilterType`（滤清器类型）、`EquipmentCatalog`（设备类目）、`EquipmentBrand`（品牌，含 `isHot`/`hotOrder` 供首页热门品牌墙）是选型的分类维度。
- 客户域 `Customer` 与后台 `User` 是**两套独立身份**（硬边界）。账号来源只有两类：后台 `apps/admin` customers 模块创建、微信静默登录自动建号；**Mall 不提供自助注册、不提供改密端点**（负向契约由 `apps/mall/src/modules/customer-auth/customer-auth.routes.spec.ts` 表驱动强制：`/auth` 已注册路由必须恰好等于 `public-routes.ts` 清单）。
- **无购物车/订单/支付/物流模型**（schema 中无 Order/Cart/Payment）。
- 可见性三分流（`packages/core/src/shared/services/base.service.ts` 的 `isB2cVisibility` / `B2C_VISIBILITIES`）：`anonymous`（匿名，强制 `status='enabled'` + 加权排序）、`b2c`（预留，行为同 anonymous）、`admin`（不强制 status）；非 enabled 记录对 B2C 抛 404 而非 403，**不暴露存在性**。
- `apps/mall` 是**纯后端 API 服务**（无前端页面），客户侧界面在本仓之外（微信生态为主，故有 `access_token`/`refresh_token` 与 code2session）。

## 业务闭环状态（2026-09-18 评估结论，回答"是否完善/闭环"类问题时直接用）

主干闭环成立，但**闭环止于「报价」**——定位是 RFQ 线索撮合，不是交易系统：

- 已闭环：选型浏览（适配矩阵）→ 登录 → 收藏·地址 → 询价创建→提交 → 后台报价（填行 `unitPrice`，服务端派生 `subtotal`/`totalAmount`；`PATCH /inquiry/inquiries/:id/status` 置 `quoted`+可选 `expiresAt`）→ 客户 `GET /inquiries/:id` 可见价与 `isExpired`。
- **P0 断裂**：① 报价后无出口（`quoted → expired` 是唯一后继；schema **无** Order/Payment/Shipment）；② **全链路零通知**（无 mail/SMS/微信模板消息；`Notice`/`UserNoticeRead` 是后台 User 内部公告）→ 提交/报价/过期三方都不被通知。
- **P1**：③ 客户草稿不可改（`CreateCustomerInquiryDto` 强制 1–50 条明细，无 PATCH 端点）→ draft 只能取消重建；④ 客户无注册/改密/资料维护，重置密码唯一路径是 admin `PATCH /customer/customers/:id`；⑤ 微信仅 openid，unionid 待接入；⑥ 可用性门控 TTL 内不校验（ADR 0011 决策 3）→ 封禁延迟一个 access TTL。
- **P2**：⑦ 报价无版本、`expiresAt` 选填（不填=永久）；⑧ 过期仅派生展示态，**全仓无调度**（无 `ScheduleModule`/`@Cron`）→ 需人工置 `expired`。
