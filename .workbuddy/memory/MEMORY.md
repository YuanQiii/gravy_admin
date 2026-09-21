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

## 仓库事实校正

- **已落地**：`AGENTS.md` 曾声称 `prisma/schema.prisma` 使用 `relationMode = "prisma"`「无外键约束」——**不实**，级联是 **DB 级**的（`prisma/migrations/0_init/migration.sql` 建了真实 `FOREIGN KEY`）。**2026-09-21 已订正**，现 `AGENTS.md:55` 写作「**未声明** `relationMode`（Prisma 默认 `foreignKeys`）」并附迁移文件证据。旧审计里把它列为「P0-1 未修」的记载已过期。

## 约束文档体系（2026-09-21 重构后，改文档前先读这一节）

- **载体三层**：`AGENTS.md`（自动加载入口，**179 行 / 11394 字符 / 8 节**）> `.agents/project/`（**唯一**语料目录，**10 篇**摘要）> 源码 / Swagger / OpenAPI（冲突时以源码为准）。根有 `CLAUDE.md`，**内容只有一行 `@AGENTS.md`**，禁止往其中复制任何内容。
- ⚠️ **语料文档不得复述根文件的规则（规范 7，见 ADR 0017 补充说明）**。分工 = 根文件「一句话规则（自动加载，必须自足）」＋ 语料「该规则的机制 / 字段 / 步骤」；只复述而无细节的条目应删除。**实证**：`.agents/project/architecture.md` 曾长期保留一条已被 `AccessGuard` 取代的守卫写法（「受保护接口显式使用 `JwtAuthGuard`」）——`AGENTS.md` 里那份同日订正了，语料那份**没跟着改**，全仓实测这样写的 controller 为 **0**。**改根文件规则时必须 grep 语料是否也写着同一句。**
- **状态描述的唯一家**＝`AGENTS.md` 的「已知缺陷与待确认」（每条必须带**复核方式**；只写结论的句子会腐烂）。`CONTEXT.md` 作为词典**不记状态与实现细节**；`hermes/` 与 `.agents/project/pitfalls.md` 只记"为什么 / 是否有意"，指回那一节而不复述状态。
- **规则与护栏要分开说**：未被机器强制的规则在根文件里显式标 **⚠️ 未机器强制**（现存 4 条：自增 `id` 不外露、权限码不硬编码、`core`→`domain` 无守卫、`$transaction` 判据）。改这类规则时别以为有 lint 会拦。
- **路由表只有一个家**：`AGENTS.md` 的「按需阅读与同步更新」（读方向 + 写方向合并成一张表）。**不允许**在语料目录或 `hermes/` 里再起第二张映射表——`hermes/README.md` 曾自带一份，已删。
- **`AGENTS.md` 有 `## 知识位置` 一节**，登记 7 处：`CONTEXT.md` / `.agents/project/` / `docs/adr/` / `docs/` / `hermes/` / `wayfinder/` / `openspec/`。新增知识目录时登记在这里，不要新建第二张表。
- **文档层术语已定死（见 `CONTEXT.md` 的 `### Documentation layers`）**：`Corpus`＝`.agents/project/`、`Experience library`＝`hermes/`、`Human docs`＝`docs/`、`Glossary`＝`CONTEXT.md`。**不要用「知识库」统称它们**。
- **本仓 markdown 不受 formatter 管辖**：`format` script 的 glob 只有 `apps/**/*.ts`、`packages/**/*.ts`、`test/**/*.ts`；对未改动的 md 跑 `prettier --check` 三个全 FAIL。→ **不要擅自格式化 md**。
- **自检已落地（2026-09-21）**：`scripts/check-docs.mjs`（**零依赖**，从 `agent-constraint-docs` skill 拷入，CONFIG 用默认值即可）+ `pnpm docs:check`。检查四类**会静默腐烂**的东西：①相对链接可达（按文件自身目录解析）②文档提到的命令真实存在 ③无指向根文件的 `§` 章节号指针 ④**语料目录不得有 `README.md` 索引**。
  - **覆盖范围**：根文件 `AGENTS.md` + 语料目录 `.agents/project/`（递归）+ 仓库内任何目录级 `AGENTS.md`。**不含** `docs/`、`hermes/`、`docs/adr/`——这三处的链接不在它的覆盖内。
  - **已做过「违规探针」验证**（2026-09-21，fixture 在 `$TEMP/cd-probe`）：4 类违规全部拦住（死链 / 不存在的命令 / `AGENTS.md §5` / 语料索引），**且 0 误报**（`playbook §4`、散文里的 `make sure`、`pnpm can`、`npm run test:*` 通配形态、`pnpm install` 内建命令全部静默）。退出码：违规=1，通过=0。
  - **未接 CI**（仓库无 `.github/`）。
  - ⚠️ **注意它的判据是窄的**：正文里的 `[<路径>](<路径>)` 这类**模板占位**在代码围栏内**不会**被它报（它对代码围栏的处理比自写脚本好）。反过来，**自己随手写的链接检查脚本会误报**这类占位——本会话用 `$TEMP/gvray-linkcheck-all.mjs` 时就误报了 7 条。**别把这些"误报"当缺陷去改**。
- **语料目录 `.agents/project/` 现为 10 篇**（`README.md` 索引已于 2026-09-21 按 ADR 0017 删除，不要再建）：`architecture` / `coding` / `configs` / **`database`** / `deployment` / `dto-swagger` / `permissions` / `pitfalls` / `response-format` / `workflow`。`database.md` 是 2026-09-21 新篇，承接原根文件的 `## 数据库约定`（schema 变更路径 / 级联是 DB 级 / 事务判据）；**容器启动时的 schema 同步仍归 `deployment.md`，两篇分工不要混**。
- **已知残留**：`docs/adr/` 的 6 条断链**已修**（2026-09-21）；`docs/specs/anonymous-filter-weighted-sort.md` 的 3 条 `file:///c:/...` 绝对路径也已改为相对链接。**`file:///` 式绝对路径是本仓的一个反复出现的缺陷形态**（ADR 0009 一处、docs/specs 三处），见到就改。
- **裁决记录**：`docs/adr/0017-constraint-docs-single-routing-table.md`（记录了为什么删语料索引、为什么放弃 2000 字符上限、路由表单一归口的代价）。

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
