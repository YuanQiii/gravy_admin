# MEMORY.md — gvray 项目长期笔记

## openspec 变更流水线现状（2026-09-22 复核：积压已清，现有 1 个在途）

2026-09-16/17 的"业务审查问题清单逐项规划"曾产生 **17 个未归档 openspec 变更**。**2026-09-21 已全部归档**（archive 共 38 个）。

**2026-09-22 新增在途变更 `converge-constraint-docs-system`**（文档体系重构，本会话产出）：`openspec validate --strict` 通过，4/4 artifacts complete（proposal / specs / design / tasks）。它新建了工程类能力 **`constraint-docs`**（10 条 Requirement）——与既有 `workspace`、`schema-migrations` 同类。**apply 前先读它的 `design.md`（D1–D12 决策含被否理由）与 `tmp/文档体系重构方案.md`（v5，含规模实测与红线）。**

明细与当年的串行约束（`inquiries.service.ts` 被 7 变更触及、P3-4 → P3-5 / P0-2 → P2-4 的归档顺序）见 `.workbuddy/memory/2026-09-16-mall-issue-sweep.md`——**那段历史记录只作档案，已不再是要执行的任务清单**。

⚠️ 归档 ≠ 实现：`openspec archive` 只把 delta 合并进 `openspec/specs/`，代码是否真落地需另行核实（勿据归档目录判断功能已上线）。

## openspec 使用要点（本项目实证）

- **完整流水线经验已沉淀为项目级 skill**：`.workbuddy/skills/openspec-issue-sweep/`（SKILL.md 流程 + references/archive-playbook.md 归档/delta 重放手册 + 8 条实证坑）。处理 openspec 变更（propose/apply/archive）前先读它；项目级 skill 无法经 Skill 工具加载，直接 Read 该 SKILL.md。

- `openspec validate <change> --strict` 会检查：`## MODIFIED Requirements` 必须承载原 Requirement 的**全部** Scenario，否则报 "MODIFIED omits scenario(s)"。因此**纠正文档里的错误主张**应优先用 `REMOVED + ADDED`（新增 Requirement 名），而不是就地改写 —— 后者要么保留"名字与断言相反"的场景，要么被校验器拒绝。RENAMED + MODIFIED 组合已尝试并放弃。
- **同一 Requirement 被多个未归档变更改写时，后归档者必须把 delta 重放到合并后的主规格上**（实证：P0-2 归档把「询价单创建」3→5 场景后，P2-4 的 MODIFIED 块立刻被 `validate --strict` 判为遗漏场景）。落地顺序见 `2026-09-16-mall-issue-sweep.md` 的串行约束表。**重放方法（2026-09-17 实证）**：以合并后主规格的 Requirement 块为基底、只叠加本变更自己的约束句/场景，而不是在旧 delta 上补场景——前者自动保住其他变更（如 201 措辞、fire-and-forget）已合并的文本不回退。`openspec archive -y` 每次只报第一个冲突的 Requirement，需循环修复直到归档成功。
- `openspec new change` 若目录已存在会失败（不会覆盖）——子代理被中断后可能留下空壳目录，需先检查 `.openspec.yaml` 是否存在再补齐。
- Change 的 delta 文件路径：`openspec/changes/<name>/specs/<capability>/spec.md`，capability 名必须是 `openspec/specs/` 下已有目录名（或新引入的 kebab-case）。

## 仓库事实校正

- **`JWT_SECRET` 生产与开发未分离（2026-09-22 实测，性质=安全高危）**：根、`apps/admin/`、`apps/mall/` **三处 `.env.production` 的 `JWT_SECRET` 都与同目录 `.env.development` 完全相同**；`POSTGRES_PASSWORD` 三处均已分离。同时 **9 个 `.env.*` 已入库**（根 3 + admin 3 + mall 3，另 `.env.example` 属有意入库）。→ 若远端仓库公开，等价于生产 JWT 密钥公开、token 可被任意伪造。**只删文件不够（git 历史仍在），需轮换密钥**。`AGENTS.md:170` 的记载（9 个）经复核**正确**；`git ls-files | grep '\.env'` 复核时注意**不要加 `^` 锚**，否则只看到根目录 3 个而误判为 4 个。

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

## `docs/ai-*.md` 元层（2026-09-21 判定：不属本仓体系，含真重复与失效指令）

- 7 篇 / **1978 行**，2026-09-11 一次性产出，描述与评价「文档体系本身」。**引用面（2026-09-22 订正）**：`README.md:133`（「AI 开发指南」）指向 `ai-development.md`；`docs/adr/0017:64` 提到 playbook；其余 7 篇**互相引用成一个自闭环**（workflow ↔ playbook / audit / faq，references ↔ comparison / audit）。`AGENTS.md:32` 与 `CONTEXT.md:93` 只以「AI 工程体系」泛指 `docs/`，**不按文件名指向它们**。
  - ⚠️ **纠正 2026-09-21 的「零 inbound link」结论：错的。** 错因是我用 `grep … | head -20` 而输出被 `.workbuddy/memory/` 的命中占满，README 那条被截断。**教训：用 `head` 截断搜索结果后不得下"不存在"的结论**——`head` 截断会造成假的"零命中"。
- **真重复（已实测）**：`ai-engineering-workflow.md:136-232` 的 B.1–B.5 提示词 与 `ai-engineering-playbook.md:289-384` 的 P6.1–P6.5 **近乎逐字相同**（97 行中仅 7 处措辞微差），且 workflow 自述「提示词以本文为准」——两份已开始漂移。
- **失效指令**：playbook 多处（69 / 180 / 193 / 255 / 381 / 449 / 474 / 589 / 591 / 621 / 770）与 workflow（229）仍要求创建或同步 `.agents/project/README.md`——**该文件 2026-09-21 已按 ADR 0017 删除**，照做会触发 `pnpm docs:check` 违规；今天只给 playbook 清单第 3/8 项加了 ⛔，其余未标。
- `ai-development.md`（33 行）自带**第二张路由表**（「按需阅读索引」8 行）——违反「路由表只有一个家」，且缺 `database.md` / `pitfalls.md`。
- 与本机 user-level skill `agent-constraint-docs`（Workflow / 提示词模板 / 决策规则 / 反面清单 + 5 篇 references，**持续维护**）**功能重叠**：该 skill 已覆盖 playbook 的 §1 流程 / §2 提示词 / §5 反面清单。
- 按体系分工，不可从本仓代码推导的部分（`references` / `comparison-unibest` / `faq` / `system-audit` 快照）应归 `hermes/`，`docs/` 只放「当前形态与规程」。**处置方案已提出但未执行。**

## 社区实践基线与 GVRAY 缺口（2026-09-22 调研，判断"该不该再改文档体系"时先读）

社区共识（联网复核 + 本仓 `docs/ai-engineering-references.md` 的 12 项目扫描）里，一个完整文档体系 = **根级人向文件**（README/LICENSE/CHANGELOG/CONTRIBUTING/SECURITY）→ **指令层**（`AGENTS.md` 薄入口 200–500 行，已是开放标准，多数工具原生读；Claude Code 用 `@AGENTS.md` 桥接；monorepo **嵌套 AGENTS.md，子文件只写 delta**）→ **按需层**（渐进式披露，文件互链）→ **流程层 skills**（本项目特有 SOP，不是 API 手册）→ **事实与追溯层**（规格 / ADR / 经验库）→ **门禁层**（CI + `git diff --exit-code` 让漂移当场失败）。人向文档按 **Diátaxis 四象限**（tutorial / how-to / reference / explanation）分目录，ADR 归 explanation。

三条铁律：① **不要复制 README**（叙事 vs 祈使，受众不同）② **"唯一事实源"必须靠物理手段**（import / symlink / 生成命令），靠声明的必然漂移 ③ **门禁必须服务端**（本地钩子一条 `--no-verify` 绕过），且指令文件当生产配置（CODEOWNERS、PR-only、改前实测）。

**GVRAY 的偏离项（实测，全部仍未修）**：`Glob **/AGENTS.md` = **仅根 1 个**（无嵌套）· `.github/` 不存在（无 CI、无 CODEOWNERS）· 根级缺 `CHANGELOG` / `CONTRIBUTING` / `SECURITY` / `CODE_OF_CONDUCT` · `docs/` 未按 Diátaxis 分象限且**无 `docs/README.md` 索引** · `check-docs.mjs` 未接 CI。

→ **本仓的强项在"事实与追溯层"（规格 / ADR / 经验库 / 语料路由），缺的恰是最基础、最不需要设计能力的两块：根级人向文件与门禁层。** 将来若要"完善文档体系"，**优先补这两块，不要再新增体系设计文档**（那正是 `docs/ai-*.md` 犯的错）。

## 经验（"教训型"知识）该放哪 —— 判据与分流（2026-09-22 定）

**先分流，再谈换目录。** 本仓 `docs/ai-engineering-faq.md` 的 Q2 已经回答过"hermes 装规范还是装教训"：项目知识有**三类**（规范型/状态型/教训型），前两类已有归属，教训型无处可去 → `hermes/` 专职做教训型；同处还评过目录名，结论是 **`docs/experience/` 最佳、保留 `hermes/` + 在 `CONTEXT.md` 写明含义次佳**（"hermes" 是隐喻且与 Hermes Agent 框架、unibest 的 hermes 目录**三义**）。

**但主要矛盾不是换名字，是很多条目压根不该写成文档。** 分流判据（新踩一个坑时按顺序问）：

| 判据 | 去向 | 本仓先例 |
| --- | --- | --- |
| 违反它，机器能查出来 | 配置 / lint / `.gitattributes`，**不写文档** | `*.sh text eol=lf` 已让 P1（entrypoint CRLF）**退休** |
| 是不变量 / 顺序断言 | 测试名、契约测试 + 清单常量 | `access.guard.spec.ts` 的 "calls all 4 guards in order"；`customer-auth.routes.spec.ts` + `public-routes.ts` |
| 是"为什么这样 / 刻意如此" | 代码注释 | `access.guard.ts:35`「5 个刻意差异化的变体」 |
| 是被否决的方案 + 触发条件 | `docs/adr/` | ADR 0011（无状态 AT）、0016（真软删 vs 删列） |
| 只在人操作时有用（部署 / 排查顺序） | `docs/` 的 how-to（troubleshooting 节） | P2/P3/P5 属 `deployment.md`；P19/P21 属排查树 |
| 以上都不是 | `hermes/`（真教训） | P18 的隐式 realm 边界 |

**实测收据（2026-09-22）**：`hermes/pitfalls/` 21 条里，P6（禁 `db push`）／P13（sensitive-keys 单一来源）／P15（access log 只由 `RequestLogInterceptor` 产出）**与 `AGENTS.md` 硬规则重复**；P17 与 `.agents/project/pitfalls.md` 重复；P1 已被机制取代。→ **坑清单必须能"退休"**（被机制取代就删并记一行"已由 X 取代"），否则只增不减，最后没人读。

**改名已定（2026-09-22，用户拍板，⚠️ 尚未执行）**：`hermes/` → **`docs/experience/`**（内部三桶不变）。**副作用必须一起处理（方案 D6）**：`CONTEXT.md` 的 `### Documentation layers` 原把 `Human docs`(`docs/`) 与 `Experience library`(`hermes/`) 列为**两个并列层**，改名后经验层成为 `docs/` 的**子层** → 需同步 ① `CONTEXT.md` 词条与 `_Avoid_` 清单 ② `AGENTS.md`「知识位置」表（7 处→6 处） ③ `docs/README.md` 索引把它列进 explanation 象限 ④ `docs/experience/README.md` 顶部写一行"曾名 `hermes/`"（防止旧记忆与旧链接直接失效）。

**结构性建议**：hermes 现在 171 行 / 三桶，**这个规模不该拆成一坑一文件**（44 个小文件比一个 README 难导航）；改按"读的时机"分组（部署前 / 改 schema 前 / 新增端点前 / 排查失败时），单桶超 ~60 行再拆。每条必须链源码或 ADR。

- **防膨胀红线（2026-09-22 实测后定，建议写进 `AGENTS.md`「验证与收尾」）**：常读核心总量 **≤ 1200 行**（现状约 1070 = 全仓 13100 行的 8%）· 单篇语料 **≤ 80 行** · 根文件 **≤ 200 行**（现 179）。**不在阅读路径**（不算文档）：`openspec/changes/archive/`（119 文件 / 6223 行，占全仓 47%）· `reports/` · `dist/` · `openapi/` · `logs/`。
- **⚠️ 精简的反直觉点**：`.agents/project/` 那 9–10 篇**不要再合并**。把横切篇（coding / dto-swagger / permissions / response-format）合成一篇看似精简，但改权限时要读一篇 200 行的混合文档 → **按需层的"多"是特性不是缺陷**。真正的精简指标不是文件数，而是**每次任务要读的行数**。
- **真正该瘦的只有 `docs/` 顶层**（2748 行 → 目标约 480，−83%）：移走 `ai-*` 7 篇（1978 行）· 删 `features.md`（107）· 移走 `monorepo-migration-summary`（142）· 合并 `deployment.md`/`response-format.md` 与其语料同名篇（真重复，顺带消掉两个漂移对）。**不可删**：`docs/adr/`（决策唯一家）· `openspec/specs/`（行为契约）· `archive`（追溯）· `CONTEXT.md`（术语）。

- **⚠️ 形态先于位置（2026-09-22 定，方案原则 7）**：同一内容可以落在**文档 / skill / 测试 / 代码注释 / 配置 / 生成物**上，**选错形态的代价大于选错位置**。活例：`docs/ai-engineering-workflow.md` + `playbook.md`（1102 行）是"从零建体系"的**方法论**——与本仓日常无关，形态本该是 skill，写成仓库 `docs/` 就长期与环境错位。**判据**：只对"下一个项目/下一个会话"有用的内容 → skill；只对本仓当前形态有用的 → 文档；能机器检查的 → 配置/测试。

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
