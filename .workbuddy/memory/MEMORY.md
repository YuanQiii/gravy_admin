# MEMORY.md — gvray 项目长期笔记

## openspec 变更流水线现状（2026-09-22 复核：积压已清，现有 1 个在途）

2026-09-16/17 的"业务审查问题清单逐项规划"曾产生 **17 个未归档 openspec 变更**。**2026-09-21 已全部归档**（archive 共 38 个）。

**2026-09-22 新增在途变更 `converge-constraint-docs-system`**（文档体系重构）：`openspec validate --strict` 通过，4/4 artifacts complete（proposal / specs / design / tasks）。它新建了工程类能力 **`constraint-docs`**（10 条 Requirement）——与既有 `workspace`、`schema-migrations` 同类。

**apply 进度 39/44**（2026-09-22 晚）：P0（只改错）、P1（接门禁，除推送）、P2（人向文件）、P3（拆嵌套入口）、P4（收拢 + 精简 + 结晶）、P5（改名 + 归位 + 删除 + 扩自检）全部完成；**余 5 项**——2.3/2.4/2.5（推送并观察 CI 首跑、探针验拦截、验棘轮，**阻塞于仓库权限**，见下）与 7.1/7.2（**P6 方法论进 skill，可选、仓库外、需用户单独确认**）。

⚠️ **P6 的素材位置**：`ai-engineering-playbook` / `workflow` 全文已从 `docs/` 删除，但**可取回**——删除前的 HEAD 是 `56b0d0d`，用 `git show 56b0d0d:docs/ai-engineering-playbook.md` 取。要提炼的是 playbook §3「六份资产最小模板」与 §6「棕地增量开发 + 门禁棘轮」（实测 `agent-constraint-docs` 的 5 篇 references 合计仅 361 行、且全库搜不到 `brownfield`/棕地，属该 skill 的空白）。

**推送阻塞（2026-09-22）**：本地已与远端 `main` 合并并快进就绪，但 **GCM 凭据用户 `YuanQiii` 对 `gvray/gvray-admin` 只有 `pull` 权限**（GitHub API 实测 `permissions.push=false`）→ `git push` 403。解除路径：① 授予写权限/换凭据；② fork + PR。**用户已明确选择"先不推"**，等其决定。

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

- **载体三层（2026-09-22 文档收敛后）**：`AGENTS.md`（自动加载入口，**196 行**，红线 ≤200）> `.agents/project/`（**唯一**语料目录，**9 篇纯规范**）> 源码 / Swagger / OpenAPI（冲突时以源码为准）。根有 `CLAUDE.md`，**内容只有一行 `@AGENTS.md`**，禁止往其中复制任何内容。
- **文档收敛的量化结果（2026-09-22）**：`docs/` 顶层由 **14 篇 / 2748 行 → 5 篇 / 501 行**（`README.md` 索引 + configs + deployment + project-structure + response-format）；删除 11 篇（`features.md`、`api-testing.md`、`monorepo-migration-summary.md`、`specs/` 那篇、`ai-*` 7 篇），独有内容**先结晶进 ADR 0005/0010/0017 的补充说明**再删。常读核心 **1173 → 1071 行**。术语：经验库由 `hermes/` 改名为 **`docs/experience/`**（`docs/` 的子层，两桶 `pitfalls/` + `patterns/`，`decisions/` 已取消）。
- ⚠️ **语料文档不得复述根文件的规则（规范 7，见 ADR 0017 补充说明）**。分工 = 根文件「一句话规则（自动加载，必须自足）」＋ 语料「该规则的机制 / 字段 / 步骤」；只复述而无细节的条目应删除。**实证**：`.agents/project/architecture.md` 曾长期保留一条已被 `AccessGuard` 取代的守卫写法（「受保护接口显式使用 `JwtAuthGuard`」）——`AGENTS.md` 里那份同日订正了，语料那份**没跟着改**，全仓实测这样写的 controller 为 **0**。**改根文件规则时必须 grep 语料是否也写着同一句。**
- **状态描述的唯一家**＝`AGENTS.md` 的「已知缺陷与待确认」（每条必须带**复核方式**；只写结论的句子会腐烂）。`CONTEXT.md` 作为词典**不记状态与实现细节**；`docs/experience/` 只记"为什么 / 是否有意"，指回那一节而不复述状态。
- **规则与护栏要分开说**：未被机器强制的规则在根文件里显式标 **⚠️ 未机器强制**（现存 4 条：自增 `id` 不外露、权限码不硬编码、`core`→`domain` 无守卫、`$transaction` 判据）。改这类规则时别以为有 lint 会拦。
- **路由表只有一个家**：`AGENTS.md` 的「按需阅读与同步更新」（读方向 + 写方向合并成一张表）。**不允许**在语料目录或 `docs/experience/` 里再起第二张映射表——`hermes/README.md` 曾自带一份，已删；`docs/README.md` 是 **docs 层的 Diátaxis 索引**（另一个轴，合法），也写明"不要再建第二个"。
- **`AGENTS.md` 有 `## 知识位置` 一节**，现为 **6 处**：`CONTEXT.md` / `.agents/project/` / `docs/adr/` / `docs/`（含 `experience/` 子层）/ `wayfinder/` / `openspec/`。新增知识目录时登记在这里，不要新建第二张表。
- **文档层术语已定死（见 `CONTEXT.md` 的 `### Documentation layers`）**：`Corpus`＝`.agents/project/`、`Experience library`＝`docs/experience/`（`docs/` 的子层）、`Human docs`＝`docs/`、`Glossary`＝`CONTEXT.md`。**不要用「知识库」统称它们**；`_Avoid_` 已把 **`hermes`** 列为违禁词（改名前叫法）。
- **本仓 markdown 不受 formatter 管辖**：`format` script 的 glob 只有 `apps/**/*.ts`、`packages/**/*.ts`、`test/**/*.ts`；对未改动的 md 跑 `prettier --check` 三个全 FAIL。→ **不要擅自格式化 md**。
- **自检已落地并扩围（2026-09-21 建立 / 2026-09-22 扩围）**：`scripts/check-docs.mjs`（**零依赖**，从 `agent-constraint-docs` skill 拷入）+ `pnpm docs:check`。检查四类**会静默腐烂**的东西：①相对链接可达（按文件自身目录解析）②文档提到的命令真实存在 ③无指向根文件的 `§` 章节号指针 ④**语料目录不得有 `README.md` 索引**。
  - **覆盖范围（扩围后 = 43 文件）**：根文件 `AGENTS.md` + 语料 `.agents/project/`（递归）+ 任何目录级 `AGENTS.md` + **`extraDirs`（本仓 `['docs','wayfinder']`，递归）**。扩围前只有 13 文件，`docs/` 的链接无人看管。
  - ⚠️ **`extraDirs` 与 `CORPUS_CANDIDATES` 必须分开**：语料目录受「不得持有索引」约束，而 `docs/README.md` 正是合法索引；把 `docs/guides` 塞进候选还会凭空造出"第二个语料"（脚本自己会报）。配置的目录不存在时会发 note（配置过期 = 那些文档又没人看了）。
  - **扩围当场抓到 13 条真实死链**（`hermes/`→`docs/experience/` 改名使深度 +1，`../../` 全部指向 `docs/` 而非仓库根）。**教训：改名/移动目录后必须重算相对链接深度，且必须有覆盖那一层的自检在跑。**
  - **探针验证（2026-09-22，fixture 在 `$TEMP/cd-probe2|3`）**：4 类违规全部拦住（死链 / 不存在的脚本 / `AGENTS.md §5` / 语料索引）→ exit 1；**0 误报**（模板占位 `[<路径>](<路径>)`、散文 `make sure`/`pnpm can`、其他文档的 `§`（`playbook §4`）、`pnpm install` 内建、`pnpm test:*` 通配全部静默）→ 清空后 exit 0。
  - ✅ **已接 CI（2026-09-22）**：`.github/workflows/docs-check.yml`（独立成文：`ci.yml` 加了 `paths: ["**","!**.md"]` 后整份不跑，会连文档检查一起跳过）。另有 `ci.yml` 的 `verify`（typecheck×4 + test，均实测绿）与 `lint-ratchet`。
- **CI 棘轮的两条正确判据（写进 `.github/workflows/ci.yml`，2026-09-22）**：① **改动集**——push 时先在范围内找合并提交，取其 `^1..merge`；范围内无 merge 且文件数 >50 则退回 `sha^1..sha`。**用 `event.before..sha` 全量算会把积压的历史提交整批计入（本仓首次推送实测 828 个文件），门禁首跑必红。** ② **判据**——逐文件与基线对比：fmt 只卡「基线合规→现在不合规」+ 新文件，lint 只卡 error 数上升。比较前一律 `tr -d '\r'`（本机工作区有 CRLF，索引里全是 `i/lf`）。
- **语料目录 `.agents/project/` 现为 9 篇纯规范**（`README.md` 索引已于 2026-09-21 按 ADR 0017 删除，不要再建）：`architecture` / `coding` / `configs` / **`database`** / `deployment` / `dto-swagger` / `permissions` / `response-format` / `workflow`。**`pitfalls.md` 已于 2026-09-22 并入 `docs/experience/pitfalls/` 并分流**——那篇自述就是"教训清单而非规范"，是"经验在两层各有一个家"的根源。`database.md` 承接原根文件的 `## 数据库约定`；**容器启动时的 schema 同步仍归 `deployment.md`，两篇分工不要混**。
- **已知残留**：`docs/adr/` 的 6 条断链**已修**（2026-09-21）；`docs/specs/` 目录已随那篇专题规格删除（2026-09-22）。**`file:///` 式绝对路径是本仓的一个反复出现的缺陷形态**（ADR 0009 一处、docs/specs 三处），见到就改。
- **裁决记录**：`docs/adr/0017-constraint-docs-single-routing-table.md`（为什么删语料索引、为什么放弃 2000 字符上限、路由表单一归口的代价；**2026-09-22 补充说明**记了文档收敛的外部依据、`decisions/` 取消与语料 pitfalls 合并）。

## `docs/ai-*.md` 元层（2026-09-22 **已删除**；保留本节作为裁决档案）

> **现状**：7 篇已全部删除，独有结论结晶进 `docs/adr/0017` 补充说明（外部依据、失效条件、后续入口）、`docs/adr/0010` 补充说明（迁移执行细节）、`docs/adr/0005` 补充说明（加权排序规格的非目标与性能依据）。**playbook / workflow 全文可取回**：`git show 56b0d0d:docs/ai-engineering-playbook.md`（供 P6 提炼进 skill）。

- 7 篇 / **1978 行**，2026-09-11 一次性产出，描述与评价「文档体系本身」。**引用面（2026-09-22 订正）**：`README.md:133`（「AI 开发指南」）指向 `ai-development.md`；`docs/adr/0017:64` 提到 playbook；其余 7 篇**互相引用成一个自闭环**（workflow ↔ playbook / audit / faq，references ↔ comparison / audit）。`AGENTS.md:32` 与 `CONTEXT.md:93` 只以「AI 工程体系」泛指 `docs/`，**不按文件名指向它们**。→ **删除时四处引用已全部清理**（两份 README、ADR 0017 参考节、ADR 0005 的维护仪式、`packages/domain/.../filters.service.ts` 的两处源码注释）。
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

- **防膨胀红线（2026-09-22 落地，已写进 `AGENTS.md`「验证与收尾」）**：常读核心总量 **≤ 1200 行** · 单篇语料 **≤ 100 行** · 根文件 **≤ 200 行** · 包级 `AGENTS.md` **20–80 行**。实测校准说明：单篇语料原拟 ≤80，但 `dto-swagger.md` 本就 90 行，定 80 等于宣布违规 → **红线必须落在现实里**；包级下限原拟 30 行，实测真实增量只有 23–33 行（admin 33 / mall 23 / core 23），撑到 30 只能靠复述根文件 → 改为 20。**不在阅读路径**（不算文档）：`openspec/changes/archive/`（119 文件 / 6223 行，占全仓 47%）· `reports/` · `dist/` · `openapi/` · `logs/`。
- **⚠️ 精简的反直觉点**：`.agents/project/` 那 9–10 篇**不要再合并**。把横切篇（coding / dto-swagger / permissions / response-format）合成一篇看似精简，但改权限时要读一篇 200 行的混合文档 → **按需层的"多"是特性不是缺陷**。真正的精简指标不是文件数，而是**每次任务要读的行数**。
- **真正该瘦的只有 `docs/` 顶层**（2748 行 → 目标约 480，−83%）：移走 `ai-*` 7 篇（1978 行）· 删 `features.md`（107）· 移走 `monorepo-migration-summary`（142）· 合并 `deployment.md`/`response-format.md` 与其语料同名篇（真重复，顺带消掉两个漂移对）。**不可删**：`docs/adr/`（决策唯一家）· `openspec/specs/`（行为契约）· `archive`（追溯）· `CONTEXT.md`（术语）。

- **⚠️ 形态先于位置（2026-09-22 定，方案原则 7）**：同一内容可以落在**文档 / skill / 测试 / 代码注释 / 配置 / 生成物**上，**选错形态的代价大于选错位置**。活例：`docs/ai-engineering-workflow.md` + `playbook.md`（1102 行）是"从零建体系"的**方法论**——与本仓日常无关，形态本该是 skill，写成仓库 `docs/` 就长期与环境错位。**判据**：只对"下一个项目/下一个会话"有用的内容 → skill；只对本仓当前形态有用的 → 文档；能机器检查的 → 配置/测试。

## git / 凭据 / 换行（2026-09-22 实测，比导文档时先读这一节）

- 🚨 **本工作区的 `git rm` 会清空该文件所在的整个目录**（2026-09-22 用受控探针复现三次 + 一次对照实验）：在 `docs/` 内建 `docs/probe/a/b/f.md` → `git add` → `git rm -f` → **`docs/` 变为空**（不只是那一个文件）。**这在本次会话造成 3 次 `docs/` 整目录被删**（第二次连未提交的 ADR 编辑一起丢了，只能重做）。
  → **对策：本仓一律不要用 `git rm`。用 `rm <file>`（或 `rm -rf <dir>`）+ `git add -A <dir>`** —— 已实测安全（同样在 `docs/` 内做对照，目录完好）。
  → 恢复手段：`git checkout -- <dir>`（未提交的改动会丢，所以**改完立刻 commit**）。另在 `$TEMP/gvray-docs-backup/` 留有一份仓库外备份。
  → 与既有已知问题同源：本工作区 `.git` 本身有异常（`switch -c` 造未出生分支、曾整体变空）。**在这台机器上做批量文件操作时，先小步验证再全量执行。**
- **远端仓库是 public，且本机凭据只读**：GCM 里的凭据是 GitHub 用户 **`YuanQiii`**（OAuth `gho_*`），对 `gvray/gvray-admin` 的权限实测为 `{admin:false, maintain:false, push:false, triage:false, pull:true}` → **`git push` 一律 403**（`Permission to gvray/gvray-admin.git denied to YuanQiii`）。
  查法：`git credential fill` 取 token → `curl -H "Authorization: Bearer $T" https://api.github.com/repos/gvray/gvray-admin` 看 `permissions`。
- **推送目标 = 用户自己的仓库 `YuanQiii/gravy_admin`，已接通（2026-09-22）**：注意名字是 **gravy_admin**（`YuanQiii/gvray-admin` / `gvray_admin` 都 404）。它是当天新建的空 public 仓库（非 fork），凭据对它 **admin 全权限**。
  **remote 配置现状**：`origin` 的 **fetch 仍指 `https://github.com/gvray/gvray-admin.git`**，**push 指向 `https://github.com/YuanQiii/gravy_admin.git`**（`git remote set-url --push`）。所以 `git push` 直接生效、`git fetch` 仍能取上游。查：`git remote -v`。
  ⚠️ 用户给的是 SSH 地址，但**本机没有 SSH 密钥**（`~/.ssh` 只有 `known_hosts`，`ssh -T git@github.com` → `Permission denied (publickey)`）→ **只能走 HTTPS**；要用 SSH 得先生成 key 并把公钥加到 GitHub。
  ⚠️ 推送到这个仓库时要走代理 `127.0.0.1:7897`（环境变量里的 `https_proxy=127.0.0.1:3390` 已失效）；**git 经代理偶尔会 SSL 握手失败/连接被断，重试一两次即可成功**。
- **CI 已在远端跑起来并验证通过（2026-09-22）**：`YuanQiii/gravy_admin` 的两个 workflow 均 active，实测矩阵——
  | 推送内容 | `CI`（重活） | `Docs check` |
  | --- | --- | --- |
  | 首次推送（空仓库→main，`2ec5be7`） | ✅ success（`pnpm install --frozen-lockfile` 也通） | ⏭️ **未触发**（首个推送 + paths 过滤，后续正常） |
  | 纯 `.md` 含死链（`8ade55f`） | ⏭️ 未触发 | ❌ failure（失败步骤＝文档自检） |
  | 纯 `.md` 回退（`07a5f73`） | ⏭️ 未触发 | ✅ success |
  | `.ts` 格式变脏（`955404e`） | ❌ failure（`fmt 棘轮`，报 `::error 不符合 prettier 格式`） | ⏭️ 未触发 |
  | 回退 + CI 调整（`3da861a`） | ✅ success | ⏭️ 未触发 |
  → 结论：**该拦的拦得住、该跳的跳得掉**（4 类行为全部符合设计）。另记：`event.before` 在首次推送时是全 0 SHA，不特判会让 `git rev-list` 崩掉（已修）；`lint 棘轮` 加了 `!cancelled()`，使两个棘轮在一次运行里都报出来。
- **⚠️ 仓库 public + 三处 `.env.production` 的 `JWT_SECRET` 与各自 dev 相同**（根 / `apps/admin` / `apps/mall`；`POSTGRES_PASSWORD` 三处已分离）→ 任何人可签出合法 token。这是 SECURITY.md 的第一条，**尚未修**（修复=轮换密钥 + env 移出仓库，删当前文件不够，git 历史仍在）。
- **远端长期停在单应用布局**：远端 `main`（`12c39a0`）仍是迁移前的 `src/`，本地已迁到 `apps/*`+`packages/*`。**合并时必须按「把远端语义改动搬到新位置」解决**，直接接受远端整文件 = 回退迁移。已实证：远端 2026-09-19 的国际化提交顺带回退了 5 类事实（PostgreSQL→MySQL、`AGENTS.md`→`CLAUDE.md`、`.agents/project/`→`.claude/project/`、`prisma:migrate:dev`→`prisma migrate dev`、单应用目录树）。
- **换行判定只用 `git ls-files --eol`**：实测 **439 个 `.ts` 的索引全是 `i/lf`**，仅 19 个工作区文件是 `w/crlf`（`core.autocrlf=true` 造成）。→ `prettier --check <工作区文件>` 在 Windows 会报「全文件不合规」，**是假阳性，CI（Linux）看不到**。
  **⚠️ 不要用 `git cat-file -p :path` 判断**——本机实测它给出的 `:path` 结果是带 CR 的，会误导（与 `--eol` 的结论相反）。任何换行无关的对比都先 `tr -d '\r'`。
- **CI 棘轮的两条正确判据（已写进 `.github/workflows/ci.yml`）**：① push 到 main 时若 `sha` 是**合并提交**，改动集必须用 `sha^1..sha`，用 `event.before..sha` 会把被合并进来的历史提交整批计入；② 棘轮语义是**逐文件与基线对比**——fmt 只卡「基线合规→现在不合规」+ 新增文件，lint 只卡 error 数上升。**钝判据（改动文件必须全绿）会让 CI 首跑必红**，因为全仓有 212 个 fmt 脏文件。
- **本机没有 `find` 可用**（Git-Bash 里 `find` 报错）→ 用 shell 通配统计；`sort -u`/`sort -n` 会调到 Windows `sort.exe`，用 `awk "!seen[$0]++"` 代替。

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
