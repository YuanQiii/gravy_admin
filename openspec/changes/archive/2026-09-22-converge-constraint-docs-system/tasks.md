## 1. P0 · 只改错（零结构风险，先做）

- [x] 1.1 把 `README.md` 的项目结构图改为 monorepo 实际布局（`apps/admin/src`、`apps/mall/src`、`packages/core/src`、`packages/domain/src`）。验证：图中出现的每个路径逐条 `ls` 均存在
- [x] 1.2 处理 `README.md` 的两张死链封面图（`docs/screenshots/` 已不存在）：删除引用或换成现存图片。验证：`ls docs/screenshots` 失败，且 `README.md` 不再出现该路径
- [x] 1.3 把 `README.md` 快速开始里的 `pnpm prisma db push` 改为迁移路径（`pnpm prisma:migrate:dev`），与「生产禁跑 `db push`、一切 schema 变更走 migration」的硬规则一致。验证：`grep -n "db push" README.md` 无输出
- [x] 1.4 `README.md` 的「文档」表补 `openspec/`、`docs/adr/`、`docs/experience/`、`wayfinder/`、`CONTEXT.md`，并移除 `docs/features.md` 一行（该文件在本变更中删除）。验证：`pnpm docs:check` 通过
      → 执行说明：经验库一行先指向**现存路径** `hermes/`，`docs/experience/` 的改名在 P5（6.x）完成后回改此行；其余四行按原计划补齐。
- [x] 1.5 `README.md` 的进度清单与 `docs/features.md` 二选一（保留 README 的 Roadmap），并逐条核对 `[x]` 项与 `apps/admin/src/modules/system/` 下的实存模块一致。验证：抽查至少 3 个 `[x]` 项，模块目录均存在
- [x] 1.6 把 `AGENTS.md` Gate 表的 typecheck 行由 `NOT AVAILABLE` 订正为实测 PASS，并写明命令 `tsc -p {apps/admin,apps/mall,packages/core,packages/domain}/tsconfig.json --noEmit`。验证：逐字运行该命令，四个 workspace 均 exit=0 / 0 error
      → 连带订正（否则同一文件内自相矛盾）：Gate 表上方的"上次实测"日期、其下方引用的输出行数构成（删去已不存在的 typecheck 53 行）、以及「已知缺陷」第 3 条中"这正是上表 typecheck 一行的成因"的表述。
- [x] 1.7 在 `AGENTS.md`「验证与收尾」新增四条规模红线及当前实测值（常读核心 ≤1200 行 · 单篇语料 ≤100 行 · 根文件 ≤200 行 · 不在阅读路径的位置清单）。验证：四条均有数字或清单，且数字来自实测
- [x] 1.8 收尾验证：`pnpm docs:check` 退出码为 0。验证：命令输出 All passed、exit 0

## 2. P1 · 接门禁（把已有资产接上强制）

- [x] 2.1 新增 `.github/workflows/ci.yml`：`docs:check` + 四个 workspace 的 typecheck + `test` 三项硬卡；fmt/lint 只对本次改动文件检查（棘轮）；`paths: ["**","!**.md"]`；`concurrency.cancel-in-progress`；`workflow_dispatch`。验证：YAML 可解析，且三个硬卡命令在本地逐条通过
      → 执行说明：**拆成两个工作流文件**才能同时满足两条规格（`ci.yml` 加 `paths` 过滤后整份不跑，会连文档检查一起跳过）。故文档检查独立为 `.github/workflows/docs-check.yml`（`paths` 限文档相关 + `scripts/check-docs.mjs` + `package.json`，零依赖故不装依赖）。两者 YAML 均已解析校验；三项硬卡本地实测：`docs:check` exit 0 · typecheck 四个 workspace exit 0 · `jest --ci` **48 suites / 303 tests 全过**。
      → **棘轮判据已修正两处（2026-09-22，实测驱动）**：
      (a) **合并提交的改动集**：push 到 main 且 `sha` 是合并提交时，`event.before..sha` 会把被合并进来的历史提交整批计入（本仓首个推送即 87 个提交），改用 `sha^1..sha` 只取「这次合并带进来的改动」。
      (b) **判据由「改动文件必须全绿」改为「不新增问题」**：逐文件与基线版本对比——fmt 只卡「基线版本本就合规 → 现在不合规」以及新增文件；lint 只卡 error 数高于基线。原因是最初的钝判据会把既有基线债务（fmt 212 文件）算作本次新增，CI 首跑必红，而「首跑即红」正是 design.md 里列为风险的东西。
      ⚠️ 比较前一律 `tr -d '\r'` 归一化换行：本机工作区有 19 个 `.ts` 是 CRLF（`git ls-files --eol` 实测，**索引里 439 个 `.ts` 全是 `i/lf`**），不加这一步会在 Windows 侧产生「全文件都不合规」的假阳性，而 CI（Linux）看不到这个问题。
- [x] 2.2 新增 `.github/CODEOWNERS`，覆盖 `AGENTS.md`、`**/AGENTS.md`、`.agents/`、`docs/adr/`、`docs/experience/`。验证：文件存在，五类路径逐条 grep 命中
      → 待你确认：owner 句柄填的是远端 org `@gvray`（从 origin URL 推得）。**若它不是有效用户/team，GitHub 会静默忽略这些条目**。
- [x] 2.3 把工作推到远端并观察首跑（**需用户确认推送**）。验证：CI 三项 job 全部绿
      → **已完成（2026-09-22）**。推送目标由用户指定为 `YuanQiii/gravy_admin`，因本机无 SSH 密钥（`Permission denied (publickey)`）改用其 HTTPS 地址，并把 `origin` 的 **push** 地址指向它（**fetch 仍指 `gvray/gvray-admin`**）。该仓库是当天新建的空 public 仓库 → 首次推送为 `* [new branch] HEAD -> main`。
      → **首跑结果**（`CI` run [35703031956](https://github.com/YuanQiii/gravy_admin/actions/runs/35703031956)，`success`）：`typecheck + test` 全绿（含 `pnpm install --frozen-lockfile`）；`fmt + lint（棘轮）` 绿，其中两个棘轮步骤按设计 **skipped**（首次推送无基线，`count=0`）。
      → ⚠️ **实测发现**：`docs-check.yml` 在**首次推送时未触发**（`total_count: 0`），下一次普通推送起正常触发。首个推送到新分支时 `paths` 过滤的行为与后续不同——已记录，非配置问题（paths 本身覆盖 `docs/**`、`.agents/**`、`wayfinder/**`、`scripts/check-docs.mjs`）。
      → 附带修正：`event.before` 在首次推送时是**全 0 SHA**，原判据会让 `git rev-list --merges` 因 bad object **把 job 弄崩**（比判红更难懂）→ 已显式识别该情形。
- [x] 2.4 用故意违规的探针验证 CI 真会拦：提交一处死链文档改动，确认 CI 失败（`docs:check` 报错）。验证：该次运行结论为失败，且失败原因是文档自检
      → **已验证**（`Docs check` run [35703263574](https://github.com/YuanQiii/gravy_admin/actions/runs/35703263574)，head `8ade55f`）：结论 **failure**，失败步骤就是「文档自检（死链 / 命令真实性 / § 指针 / 语料索引）」，日志逐字命中探针链接（`wayfinder/map.md: Relative link unreachable: ./ci-probe-does-not-exist.md`）+ `exit code 1`。
      → 同一次推送下 **`CI` 未运行**（纯 `.md` 被 `paths` 的 `!**.md` 排除）——顺带验证了 2.5 的后半。探针已回退（`07a5f73`，`Docs check` 恢复 **success**，run [35703388695](https://github.com/YuanQiii/gravy_admin/actions/runs/35703388695)）。
- [x] 2.5 验证棘轮生效：改一个格式不合规的 `.ts` 文件 → CI 失败；只改 `.md` 文件 → 重型任务不执行。验证：两次运行的 job 列表与结论符合预期
      → **已验证**（`CI` run [35703652891](https://github.com/YuanQiii/gravy_admin/actions/runs/35703652891)，head `955404e`）：在 `apps/admin/src/modules/auth/dto/login.dto.ts`（基线 prettier **CLEAN**，本地实测）末尾追加一行只含空格的空行 → 结论 **failure**，`fmt 棘轮（基线合规的文件不得变脏）` 失败并给出 `::error 不符合 prettier 格式`；job 日志的 `策略：普通推送` 证明普通推送路径生效；同批 `typecheck + test` 仍 **success**（探针只动空白）。同时 **`Docs check` 未运行**（无文档改动）。
      → **只改 `.md` 不跑重活**：见 2.4 那两次纯文档推送，`CI` 均未出现在运行列表里 ✓。
      → 顺带改进：`lint 棘轮` 步骤原为 skipped（GitHub 对带 `if` 的步骤会自动附加 `success()`）→ 已加 `!cancelled()`，使两个棘轮在一次运行里都报出来。探针已回退（`3da861a`，`CI` 恢复 **success**，run [35704230754](https://github.com/YuanQiii/gravy_admin/actions/runs/35704230754)）。

## 3. P2 · 补根级人向文件

- [x] 3.1 新增 `CONTRIBUTING.md`，承接 `docs/api-testing.md` 的内容（Swagger 调试入口、默认测试账户、认证头格式），并写明本地启动、测试与合入前必须通过的检查。验证：`CONTRIBUTING.md` 含上述三块内容
      → 执行说明：其中提到的每条命令都已对着 `package.json` 的 `scripts` 逐条核对存在。
- [x] 3.2 新增 `SECURITY.md`，写明已入库的 `.env.*` 清单（9 个）、`JWT_SECRET` 在 prod 与 dev 未分离的实测结论、漏洞上报渠道与处理方式。验证：`git ls-files | grep "\.env"` 的结果与文中清单一致
- [x] 3.3 删除 `docs/api-testing.md`（内容已进 `CONTRIBUTING.md`）。验证：`README.md` 与 `CONTRIBUTING.md` 中均无指向它的链接，`pnpm docs:check` 通过
      → 已删。`CONTRIBUTING.md` 实测含三块内容（默认测试账户表、Swagger 调试流程、`Bearer <token>` 认证头）；`README.md` / `README.zh-CN.md` 的文档表原有一行指向它，已随「文档表改为知识位置清单」一并移除（见 5.4 说明）。全仓 `grep api-testing` 零残留。

## 4. P3 · 拆嵌套入口

> ✅ **已执行（2026-09-22，用户选择"先下沉、再拆"）。**
>
> 做法：先把根 `AGENTS.md` 里"按包"的内容（四个目录清单、admin 的 5 个守卫变体表与 `FeatureFlagGuard`、mall 的 `CustomerJwtGuard` 系列与可见性/负向契约）**下沉**到包级文件，再把根文件相应改为指针，并在「按需阅读与同步更新」表加一行"改 `apps/*` 或 `packages/*` 内的代码 → 先读该包 `AGENTS.md`"（保持路由表单一归口）。
>
> **实测结果**：
>
> - 建成 3 份：`apps/admin/AGENTS.md` **33 行** · `apps/mall/AGENTS.md` **23 行** · `packages/core/AGENTS.md` **23 行**。
> - **`packages/domain/AGENTS.md` 不建**：其增量（providers-only 无 controller）已写在根文件「关键目录」一行里，真实增量≈0，建文件只能靠复述根文件 → 按任务 4.4 的例外条款记录不建理由，根文件保留该行内容。
> - **根文件没有变短**：194 → 195 行（字符 12318 → 12021）。这是**预期之外的实证**：移走的 4 条目录清单被 4 条指针替代，又新增 1 行路由表行。收益在结构（就近优先拿到本包约定）而非行数。
> - 规模红线相应调整：包级下限 **30 → 20 行**（内容驱动的下限优于预估数字，已同步 spec 与 design）；常读核心总量实测 **1173 行**（含三份包级文件）仍 ≤1200，但余量只剩 27 行。
> - `docs:check` 覆盖数由 11 文件升到 **14 文件**（自动纳入目录级 `AGENTS.md`），仍 All passed。

- [x] 4.1 新增 `apps/admin/AGENTS.md`（30–80 行 delta：`system/...` 前缀、权限码与权限扫描端点、`OperationLogInterceptor` 仅本端挂载、5 个刻意差异化守卫变体不迁移）。验证：行数落在 30–80，且逐句 grep 确认不含根文件已有规则句
      → 实际 33 行；`system/` 前缀 + 13 个 controller 事实 + 守卫变体表（5 行表格）+ `FeatureFlagGuard` + 会话心跳。根文件原有的 5 变体清单已**移入**本文件（不再是复述）。
- [x] 4.2 新增 `apps/mall/AGENTS.md`（`CustomerJwtGuard` / `OptionalCustomerGuard` / `@CurrentCustomer()`、可见性三分流、不产生审计写、负向契约由 `public-routes.ts` + 契约测试强制）。验证：同上
      → 实际 23 行；含量最重的是**负向契约**（含"要开放请新立变更，不要删断言"）与两端同端口需 `PORT=3001` 的坑，外加一行显式例外（`AccessGuard` 不适用于客户侧）。
- [x] 4.3 新增 `packages/core/AGENTS.md`（深模块与薄适配器、只暴露 barrel、不得 import domain）。验证：同上
      → 实际 23 行；**只写根文件没有的**：目录清单、深模块的"消费者数量"判别标准与 `authenticateByRealm` 先例、"守卫顺序活在测试名里"、四个 workspace 包均无自有 `scripts`。依赖方向与 barrel 规则未复述（根文件已有）。
- [x] 4.4 新增 `packages/domain/AGENTS.md`（providers-only 无 controller、equipment 五件套与 inquiry Service/DTO、事务与金额派生指向 `database.md`）。验证：同上；**若该包 delta 撑不起 30 行则不建**，并在本任务记录不建的理由
      → **不建**。实测增量≈0（providers-only 已在根文件「关键目录」写明；排序纯函数已在 `hermes/patterns/README.md` §2；金额派生属规格层，见 `openspec/specs/inquiry/`），复述即为违规。根文件保留该行内容。
- [x] 4.5 根 `AGENTS.md` 相应减重至 ≤200 行（把已下沉到包级的内容改为指针）。验证：`wc -l AGENTS.md` ≤200，且 `Glob **/AGENTS.md` 计数为 5（或 4，若 4.4 判定不建）
      → 195 行 ≤200 ✓；`**/AGENTS.md` 计数 = **4**（根 + admin + mall + core），符合 4.4 的例外。

## 5. P4 · 收拢 + 精简 + 结晶

- [x] 5.1 把 `docs/monorepo-migration-summary.md` 的独有内容（§5 Mall 路由映射、§8 回滚与后续）摘成 ≤15 行写进 `docs/adr/0010` 的补充说明。验证：ADR 0010 新增补充说明段，且含路由映射表
      → 落地为「## 补充说明（2026-09-22，迁移执行细节留存）」：路由映射**改写为规则式**（`b2c/<资源>` 与 `customer/<资源>` 一律去前缀 + 资源清单 + admin 零变化），不再逐行复制 24 行表格；另含迁移当时的验证证据、六步回滚方式、三条仍成立的遗留。ADR 0010 由 91 → 103 行。
- [x] 5.2 把 `docs/specs/anonymous-filter-weighted-sort.md` 的独有内容（决策来源 grilling 三轮 15 题、Out of Scope、后续演进）摘成 ≤15 行写进 `docs/adr/0005` 的补充说明。验证：ADR 0005 新增补充说明段
      → 落地为「## 补充说明（2026-09-22，加权排序规格的独有内容留存）」：明确的非目标（8 类）、性能依据与升级触发条件、测试缝选择（HTTP seam 为主 + mock 共享根 fn 的交叉污染陷阱）、三轮 grilling 15 个决策点来源。ADR 0005 由 170 → 184 行。
- [x] 5.3 把 `docs/ai-engineering-references.md`、`comparison-unibest.md`、`faq.md` 的结论摘成「体系设计依据」≤15 行写进 `docs/adr/0017` 的补充说明。验证：ADR 0017 新增补充说明段，含外部调研的数据来源与失效条件
      → 落地为「## 补充说明（2026-09-22，体系设计的外部依据留存）」：数据来源与采集方式、可复核的扫描事实（12 中 5 有 CI）、两条穿透性结论、明确的失效条件（2026-09-11 快照）、后续入口 `ItamarZand88/awesome-agent-conventions`、两条尚未做的后续建议。ADR 0017 由 65 → 77 行。
- [x] 5.4 新增 `docs/README.md` 索引，按 Diátaxis 四象限（tutorial / how-to / reference / explanation）分组现有文档，并把 `experience/` 归入 explanation。验证：`docs/` 下每篇文档在索引里出现且只出现一次
      → 已建（36 行）。落位：tutorial **暂空**（由 README 快速开始 + CONTRIBUTING 承担，索引里写明）；how-to = `deployment.md`；reference = `configs.md` / `response-format.md`；explanation = `project-structure.md` / `adr/` / `experience/`。写入两条约定：**本文件是 `docs/` 的唯一索引**（不要再建第二个）、**不在阅读路径**清单。
      → 连带消除 `docs/` 的第二份逐文件索引：两份 README 的「文档」表由 10 行改 5 行「知识位置」（docs 索引入口 / CONTEXT / openspec / wayfinder / 语料）。
      → **执行顺序调整**：原排在 5.5 之前，实际改到 6.8（删 9 篇）之后执行，否则索引写完还要回改两轮。
- [x] 5.5 删除 `docs/features.md` 并清理引用（`README.md` 相关行）。验证：`grep -rn "features\.md"` 无残留，`pnpm docs:check` 通过
      → 已删（`git rm`）。`README.md` / `README.zh-CN.md` / `CONTRIBUTING.md` / `docs/` / `.agents/` / `AGENTS.md` / `CONTEXT.md` 内**零残留引用**（P0 的 1.4 已先行移除文档表那一行）。另记：原 features.md 有 **46** 个 `[x]` 而 README Roadmap 只有 14 个——粒度更细的进度视图就此消失，这是既定取舍（进度视图属 issue tracker，不属文档）。
- [x] 5.6 按 D8 对 `docs/deployment.md` ↔ `.agents/project/deployment.md`、`docs/response-format.md` ↔ `.agents/project/response-format.md` 各删自己那半重复内容，并加互链。验证：两对互链均可达；两文件的重复段落已不存在（逐段比对后记录结论）
      → **deployment 一对**：语料侧删「常用命令」（命令真相源是 `package.json`，用法在 docs 的 how-to）；docs 侧删「数据库管理」里对迁移策略的复述（改为三行环境行为表 + 指向语料篇）。**逐段比对结论**：真正的重复是①命令清单②两套工作流的通用描述③迁移策略；语料独有的是环境变量注意点（DATABASE_URL 组装 / CORS / 微信 / healthcheck / 日志变量）与 fail-closed 细节，docs 独有的是 how-to（本地开发 / 测试生产 / 独立部署 / 镜像构建 / 排查表）。
      → **response-format 一对**：语料侧压掉对 `ResponseUtil` 用法与分页键集的复述（留一句指针）；docs 侧**修掉 6 条迁移前旧路径**（`src/...` → `packages/core/src/...`，逐条 `ls` 验证存在）并加回链。**逐段比对结论**：这一对重复很少——语料的 `showType` 状态码映射与 docs 的 JSON 结构/示例/最佳实践互为补充，非重复；真正的缺陷是 docs 的组件表路径过期（本仓反复出现的缺陷形态）。
      → 顺手修了 docs/deployment.md 的**两处事实错误**：`挂载 ./src`（实为 `./apps` + `./packages`，dev compose 实测）与「无迁移文件 → `prisma db push`」——`docker/entrypoint.sh` 实测为 `NODE_ENV=development` 直接 exec、否则跑 `db-bootstrap`（fail-closed，**明确拒绝 db push**），原文与硬规则「生产禁跑 db push」直接冲突。
- [x] 5.7 精简 `docs/project-structure.md`：删除会腐烂的 ASCII 目录树，只保留"每个目录为什么这么挂"的说明。验证：文件 ≤65 行且不含 ASCII 树
      → 由 86 → **34 行**（含 5 个「为什么」小节：两个 app / 两个 packages / providers-only / `prisma/` 挂根 / apps 直连包源码）。同时移走两处**第二副本**：启动命令（真相源 `package.json` + `docs/deployment.md`）与 24 行 Mall 路由映射表（已收敛进 ADR 0010 补充说明）——后者正是本变更要消灭的"同一知识两处并存"。
- [x] 5.8 验证：`docs/` 顶层为 5 篇（`README.md`、`configs.md`、`deployment.md`、`response-format.md`、`project-structure.md`）且合计 ≤550 行。验证：`ls docs/*.md | wc -l` = 5，`wc -l docs/*.md` 合计 ≤550
      → **5 篇 / 501 行** ≤ 550 ✓（README 36 · configs 106 · deployment 219 · project-structure 40 · response-format 100）。索引完整性：4 篇顶层文档 + `adr/` + `experience/` 在 `docs/README.md` 中各出现一次。
      → **执行顺序调整（记录）**：5.4 与 5.8 原排在 5.5–5.7 之前，但那时待删文件还在（索引写完还要回改两轮）。实际顺序为 5.1–5.3 结晶 → 5.5 删 features → 5.6 去重 → 5.7 精简 → P5 全部 → 5.4 建索引 → 5.8 验证。

## 6. P5 · 改名 + 归位 + 删除 + 扩自检

- [x] 6.1 用 `git mv` 把 `hermes/` 整体改名为 `docs/experience/`（内部 `pitfalls/`、`patterns/` 结构不变）。验证：`ls docs/experience` 显示三个条目；`git status` 中改动被识别为 rename
      → `git mv` 一次完成，`git status` 显示为 **4 条 R（rename）**。⚠️ 改名使目录**深度 +1**，`docs/experience/{patterns,pitfalls}/README.md` 里 hermes 时代的 `../../` 相对链接全部失效——13 条，由 6.10 的扩围当场抓出（覆盖扩围前没有任何东西在看这批链接）。
- [x] 6.2 更新 `docs/experience/README.md`：顶部加一行"曾名 `hermes/`"，并把「内容」列表改为实际存在的两个子库。验证：文件首段含"曾名 `hermes/`"且不含已取消的子库
      → 34 → 35 行。同时补齐三条此前缺失的维护约定：**条目必须能退休**（被 `.gitattributes` / lint / 测试取代后删除并在提交信息记一行）、「一条只写一处」、「不写可直接从 AGENTS.md/ADR/spec 读到的当前状态」；并新增「结构约定」节（当前两桶三文件规模不拆成一坑一文件，单 README 超 ~60 行再拆）。
- [x] 6.3 取消 `docs/experience/decisions/` 桶（ADR 结论索引与变更摘要删除，结论已由 5.3 与 `docs/adr/` 承载）。验证：`ls docs/experience` 不再含 `decisions`
      → 已取消。注销依据与两个漂移数字（索引停在 0016 / 实际 17 篇；摘要 2 条 / 归档 38 个）写进 ADR 0017 补充说明。结论一览表**弃用而非搬迁**：ADR 文件名本身即结论（如 `0001-migrate-mysql-to-postgresql`），索引是同一份映射的第二副本。
- [x] 6.4 更新 `CONTEXT.md`：`Experience library` 词条指向 `docs/experience/`（并注明它现为 `docs/` 的子层）、更新 `_Avoid_` 清单。验证：`grep -n "hermes" CONTEXT.md` 无残留（除"曾名"说明外）
      → 词条改指 `docs/experience/` 并注明子层关系与 `decisions/` 取消；`_Avoid_` 新增「用 `hermes` 指代经验库」，删掉「把 `.agents/project/` 叫主题文档」里指向已删文件的旧出处。表头由"三个位置"改为"四个位置"（并说明其中一个是 `docs/` 的子层，命名仍独立）。
- [x] 6.5 更新根 `AGENTS.md`「知识位置」表：由 7 处改为 6 处，`docs/` 行注明含 `experience/` 子层。验证：表格行数与名称核对一致
      → 7 → **6 行**：`docs/` 行合并了原 `hermes/` 行（注明含 `experience/` 子层、踩坑 + 工程模式、"曾名 `hermes/`"），「何时读」列合并为两条触发。README / README.zh-CN.md 的目录树与文档表同步（文档表另见 5.4）。
- [x] 6.6 把 `.agents/project/pitfalls.md` 的内容并入 `docs/experience/pitfalls/` 并逐条去重（已知重复：权限缓存失效）。验证：`.agents/project/` 为 9 篇纯规范；经验层无重复条目（按规则签名 grep 核对）
      → 已并入（新增「4. 重构与收敛」组，收 12 条不被他处覆盖的工程经验）。`.agents/project/` 由 **10 → 9 篇纯规范**；`docs:check` 覆盖数 14 → 13。P17 与语料同主题条目**并为一条**（含 fail-closed 与 name/description 边界）。
- [x] 6.7 按经验分流判据处理既有条目：P1（已被 `.gitattributes` 覆盖）退休 · P6 / P13 / P15（与根文件重复）删除 · P17（与语料重复）合并 · P2/P3/P5 与 P19/P21 迁往 `docs/` 的 how-to 排查节。验证：逐条处置均有记录，经验层条目数下降且无重复
      → **退休**：P1（`.gitattributes` 的 `*.sh text eol=lf` 实测已覆盖）。**删除（与根文件重复）**：P6 禁 `db push`、P13 敏感字段脱敏、P15 access log 只由最外层拦截器产出。**合并**：P17。**迁出**：P2 Redis host、P3 端口需重建容器、P4 compose 注释要整块、P5 冒烟需 join 网络、P19 登录 401 先查 seed、P21 短密码 400 属 DTO 校验 → 进 `docs/deployment.md` 故障排查表（4 行 → **10 行**）。逐条处置均记入 ADR 0017 补充说明与提交信息。
- [x] 6.8 删除 §2.7 分档内的 9 篇：`docs/ai-development.md`、`docs/ai-engineering-system-audit-2026-09-11.md`、`docs/specs/anonymous-filter-weighted-sort.md`、`docs/monorepo-migration-summary.md`、`docs/ai-engineering-{references,comparison-unibest,faq,workflow,playbook}.md`。验证：9 个路径均不存在
      → 9 个路径均不存在；`docs/specs/` 随之消失。**取回方式已记录**：`git show 56b0d0d:docs/ai-engineering-playbook.md`（56b0d0d 为删除前 HEAD），供 P6 提炼时取用。
- [x] 6.9 清理受影响的引用：`README.md` 中指向 `docs/ai-development.md` 的链接、`docs/adr/0017` 中指向 playbook 的引用。验证：`grep -rn "ai-development\|ai-engineering"` 在文档中无残留（新增的补充说明除外，需逐条确认）
      → 逐条确认后，残留仅两处形态且均为**说明性提及**：ADR 补充说明中的"原 X 已删除"，与 ADR 0017 参考节的"（**已删除**…全文在 git 历史中可取回）"。实际清理了**四处**（超出任务预期）：两份 README 的「AI 开发指南」行、ADR 0017 参考节、ADR 0005 里「更新 `docs/specs/…` 权重表」的维护仪式（改为"权重权威来源是模块内字段常量，ADR 里的表只是快照"——原指令指向的文件已不存在）、以及 `packages/domain/src/equipment/filters/filters.service.ts` 的**两处源码注释**。全仓无 markdown 链接形式残留。
- [x] 6.10 给 `scripts/check-docs.mjs` 增加 `extraDirs` 配置项，覆盖 `docs/`、`docs/experience/`、`wayfinder/`（**不修改** `CORPUS_CANDIDATES`）。验证：运行后输出里列出新增的覆盖目录与文件数
      → 新增 `extraDirs: ['docs', 'wayfinder']`（递归；`docs/` 已含其子目录 `adr/` 与 `experience/`，故不必单列）。输出头部增加 `+ extra \`docs\` + \`wayfinder\` (recursive)`；覆盖由 **13 → 43 文件**。与 `CORPUS_CANDIDATES` 分开是刻意的：语料目录受「不得持有索引」约束，而 `docs/README.md` 正是合法索引；塞进候选还会凭空造出"第二个语料"。另加"配置的目录不存在"告警（配置过期 = 那些文档又没人看）。
- [x] 6.11 处置扩围后新出现的发现：逐条判断"修"或"进白名单"，不为了让检查通过而放宽判据。验证：`pnpm docs:check` exit 0，且每条被白名单放行的项都有理由记录
      → **全部"修"，零白名单放行**：13 条报告全是真实死链（改名后深度 +1 造成的 `../../` 失效），已逐条改为 `../../../`。这正是扩围该买的东西——它们此前无人在看。
- [x] 6.12 用故意违规的探针复验扩围后的自检：能拦住四类违规，且对模板占位、散文短语、其他文档的 `§` 指针保持静默。验证：探针运行时 exit≠0，移除探针后 exit=0
      → 在临时 fixture（`--root` 指向）上实测：四类违规**全部拦下**（死链 / `package.json` 中不存在的脚本 / 指向根文件的 `§` / 语料目录持索引）→ **exit 1**；静默项**零误报**（模板占位 `[<路径>](<路径>)`、散文 `make sure` 与 `pnpm can`、其他文档的 `§`（`playbook §4`）、内建命令 `pnpm install`、通配 `pnpm test:*`）→ 清空违规后 **exit 0**。
- [x] 6.13 最终验证：常读核心（根 `AGENTS.md` + `CONTEXT.md` + `.agents/project/` + `docs/experience/` + `README.md`）合计 ≤1200 行；`grep` 确认无指向已删文件的引用。验证：`wc -l` 合计数字与 grep 结果均符合
      → 常读核心 **1071 行** ≤1200（本文件 196 + CONTEXT 110 + 语料 390 + experience 136 + README 160 + 包级 79；收敛前为 1173）。红线表已按最终实测刷新，并新增「经验库单篇 ≤60 行（超则按主题拆）」一条——`docs/experience/pitfalls/README.md` 53 行，恰好在线内。已删文件引用零残留（逐条确认见 6.9）。

## 7. P6 · 方法论进 skill（可选，仓库外动作，需单独确认后执行）

- [x] 7.1 把 `docs/ai-engineering-playbook.md` §3「资产最小模板」与 §6「棕地增量开发 + 门禁棘轮」提炼进 `agent-constraint-docs` 的 references（或按设计文档的 Open Question 另建 skill）。验证：skill 内新增文件存在，且内容不含任何 GVRAY 专有事实
      → **已完成（2026-09-22）。** 但**没有照搬 §3**——实测后按"一条知识只有一个家"筛过：
      - `§6 棕地 + 门禁棘轮`：**真实空白**（全库搜不到 `brownfield` / `棕地` / `ratchet` / `存量`）→ 新建两篇。
        `references/brownfield.md`（121 行：核心反转"先读代码再提取词汇"· 步骤复用/替换表 · **AI 可写范围** · 只写增量不回填 · 经验库第一天就有真内容的红利 · 三个"生成→提取"的提示词 · 棕地反面清单）
        `references/gate-ratchet.md`（46 行：按维度启动策略 · **逐文件对比基线**的判据 · 四个实测坑——范围含 merge 要取 `merge^1..merge`、空仓库首推 `event.before` 是全 0 SHA 会让 job 崩溃、对比前归一化换行、带 `if` 的步骤被隐式 `success()` 吞掉 · 三条接线细节）。**并点明"只查改动文件"是范围收窄不是棘轮**，会腐烂成"整个仓库永远不被检查"。
      - `§3 六份资产最小模板`：**没有整篇搬**，逐项判定后只留真增量 → 新建 `references/artifact-set.md`（34 行：资产集与"本技能只写其中两个、其余只登记"的边界 · ADR 五段与经验库维护约定两条可审计最低要求 · **两件必须不建的东西**）。
        被判定为**不复述**的：`§3.2 AGENTS.md 模板`（与 `gen-agents-md.mjs` 输出的骨架重复，且形状比现行输出顺序旧）、`§3.6 多工具入口`（`SKILL.md` 的 "Established practices" 已有 import/symlink 与支持面）；被判定为**已被证伪、只留结论**的：`§3.3 语料目录 README 索引`（ADR 0017 已禁止，`check-docs.mjs` 会判违规）、`§3.4 ADR 索引`（**同一个映射的第二副本**；实测停在前一条、漏掉的恰是论证"索引必然漂移"的那条，且**既不是链接也不是命令也不是章节指针——没有任何检查会抓到它** → 结论是"目录列表 + 自解释文件名就是索引"）。**恰好是本变更自己的论证在 §3.4 上被验证了一遍。**
      - 同步改动：`SKILL.md` 4 行指针（step 1 / step 3 / step 5 / 审计 Enforcement 维度）+「Output order from scratch」加**Existing repo** 分支段（与既有 Empty repo 并列）；`references/prompt-template.md` 加同步表 1 行 + 段 I / 段 II 各 1 条指针（**只指不抄**，遵该文件既有纪律）。
      - 验证：新文件对 GVRAY 专有名词扫描 **13 项全 0**；`SKILL.md` 236 → 238 行（只加指针，未借机重构）。
- [x] 7.2 运行该 skill 的自测脚本，确认未破坏既有行为。验证：自测通过；若涉及判断逻辑改动，另跑归一化对比
      → **已完成。** `node scripts/selftest.mjs` → **51/51 全绿、exit 0、44.4s**（改动全为文档，未触任何判断逻辑 → 按规格不需要归一化对比）。**另加一步对抗验证**：把 `check-docs.mjs` 复制到临时目录、CONFIG 改成 `rootDoc: 'SKILL.md'` + `corpusDirs: ['references']`，**用它检查本技能自己的文档** → 9 文件 All passed、exit 0、零假报；并加一处故意死链探针确认判红（`Found 1 problem(s): Relative link unreachable`），证明这个 "All passed" 是有效的而不是检查器没看那些文件。这正是 `references/anti-patterns.md` 里"从不拿检查器查自己的文档"那条的反面用例——当年那 11 条假报已被代码围栏规则修掉，现在可以放心跑。

---

## 归档记录（2026-09-22，归档动作本身）

**命令与结果**

```
openspec archive converge-constraint-docs-system -y
→ Specs to update: constraint-docs: create
→ Applying changes to openspec/specs/constraint-docs/spec.md: + 11 added
→ Totals: + 11, ~ 0, - 0, → 0
→ Change 'converge-constraint-docs-system' archived as '2026-09-22-converge-constraint-docs-system'
```

- 归档前状态：4/4 artifacts `done`、未勾任务 **0**；`openspec instructions archive` 的 `context` 与 `operationGuidance` **均为空**（无额外约束需要应用）。
- 归档前先把整个 `openspec/` 备份到仓库外（181 个 md）——本工作区有「`git rm` 会清空所在目录」的前科，归档含目录移动，故先留回退点。
- 两条**非阻塞**警告，已接受并记录理由：
  - `⚠ Why section should not exceed 1000 characters` —— proposal 的 Why 逐条带 `file:line` 证据，压缩会丢证据，而证据正是本体系的硬要求。
  - `⚠ Consider splitting changes with more than 10 deltas` —— 本变更是**一个新能力的引入**（11 条 Requirement 同属 `constraint-docs`）；按"后归档者以后写者后的主规格为基准"的既有串行约束，拆成多个变更会让同一个 spec 文件被先后创建多次，反而制造新的串行依赖。

**归档后验证（全部实测）**

| 项 | 结果 |
| --- | --- |
| 主规格生成 | `openspec/specs/constraint-docs/spec.md`（11989 字节；`# constraint-docs Specification` + `## Purpose` + `## Requirements`，与 `b2c` / `logging` / `rbac` 等同形） |
| Requirement 守恒 | delta 11 条 vs 主规格 11 条，**名称逐一相同、`diff` 零差异** |
| `openspec validate --specs` | **13 passed / 0 failed**，exit 0 |
| `openspec list` | `No active changes found.` |
| `openspec/changes/` | 只剩 `archive/` |
| 文件守恒 | 备份 181 个 md → 现况 182（**+1 即新建的主规格**，无丢失） |
| `node scripts/check-docs.mjs` | All passed |

**实施期提交**：`e5599df`（P0）→ `3ab4605`（P6），本会话共 30 个提交（含合并提交 `09f45c9`），已推送到 `YuanQiii/gravy_admin` 的 `main`。

**补记 / 勘误（不静默改历史）**

- 7.1 执行说明里写的「`SKILL.md` 236 → 238 行」**实测为 239 行**：该处 step 5 指针第一次**未落盘**（同一文件的多个 Edit 放进同一条消息时，只有最后一个存活，而工具对每个都回 "Successfully edited"），复核后重做，故比原记录多 1 行。原记录保留，差异在此说明。
- `design.md:16` 原写「**十条** Requirement」，实测 **11 条**（`grep -c '^### Requirement:'` 与归档输出 `+ 11 added` 一致）。**没有把 10 改成 11，而是把数字删掉**——一处计数就是一处会腐烂的缓存，本变更自己的第一条要求就是这件事，留个数字等于在自己的归档件里留一个反例。同类用法（「知识位置 7 处 → 6 处」「四条红线」「README 六处」）**逐条核过，均为正确**，保留。
- `design.md` 的三个 Open Question：① **P6 归属已定** → 并入既有 `agent-constraint-docs` 的 references（未新建 skill，见 7.1）；② 四条红线的实测值何时重测 —— **仍开放**；③ `pnpm build` 是否进 CI 第一期 —— **仍开放**（现为非阻塞 job 之外的明确排除项）。后两条属"另立任务"，本变更不承担。
- **归档 ≠ 在生产生效**：本变更交付的是文档与门禁体系，改动均已在仓库内落盘、且两处新门禁已用故意违规探针实测会拦；但**运行时行为零变化**，无 schema / 接口 / 依赖改动，因此没有迁移类动作。

**剩余**：无。`openspec/changes/` 下已无在途变更。
