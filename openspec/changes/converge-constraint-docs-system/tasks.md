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
- [x] 2.2 新增 `.github/CODEOWNERS`，覆盖 `AGENTS.md`、`**/AGENTS.md`、`.agents/`、`docs/adr/`、`docs/experience/`。验证：文件存在，五类路径逐条 grep 命中
      → 待你确认：owner 句柄填的是远端 org `@gvray`（从 origin URL 推得）。**若它不是有效用户/team，GitHub 会静默忽略这些条目**。
- [ ] 2.3 把工作推到远端并观察首跑（**需用户确认推送**）。验证：CI 三项 job 全部绿
- [ ] 2.4 用故意违规的探针验证 CI 真会拦：提交一处死链文档改动，确认 CI 失败（`docs:check` 报错）。验证：该次运行结论为失败，且失败原因是文档自检
- [ ] 2.5 验证棘轮生效：改一个格式不合规的 `.ts` 文件 → CI 失败；只改 `.md` 文件 → 重型任务不执行。验证：两次运行的 job 列表与结论符合预期

## 3. P2 · 补根级人向文件

- [x] 3.1 新增 `CONTRIBUTING.md`，承接 `docs/api-testing.md` 的内容（Swagger 调试入口、默认测试账户、认证头格式），并写明本地启动、测试与合入前必须通过的检查。验证：`CONTRIBUTING.md` 含上述三块内容
      → 执行说明：其中提到的每条命令都已对着 `package.json` 的 `scripts` 逐条核对存在。
- [x] 3.2 新增 `SECURITY.md`，写明已入库的 `.env.*` 清单（9 个）、`JWT_SECRET` 在 prod 与 dev 未分离的实测结论、漏洞上报渠道与处理方式。验证：`git ls-files | grep "\.env"` 的结果与文中清单一致
- [ ] 3.3 删除 `docs/api-testing.md`（内容已进 `CONTRIBUTING.md`）。验证：`README.md` 与 `CONTRIBUTING.md` 中均无指向它的链接，`pnpm docs:check` 通过
      → **阻塞于用户确认**：仓规「开发硬规则」把"任何删除文件"列入需先确认的操作；且 `README.md` 的文档表仍有一行指向它，需在同一次改动内一并移除。

## 4. P3 · 拆嵌套入口

> ⏸ **实施时发现的设计问题，已暂停等待决定（2026-09-22）。**
>
> 逐项核对后：**根 `AGENTS.md` 已经写满了四个包的关键事实**（`apps/admin` 的 system 前缀与 5 个刻意守卫变体清单、`apps/mall` 的 `CustomerJwtGuard` 系列与"不产生审计写"、`packages/domain` 的 providers-only、依赖方向 DAG 与"`core`→`domain` 无守卫"），因此按"只写 delta、不复述根文件"（本变更 `constraint-docs` 规格第 2 条 + `docs/adr/0017` 补充说明的规范 7）来写，四个包级文件实际只剩：
>
> | 包 | 真正属于本包、且不在根文件的增量 | 估算篇幅 |
> | --- | --- | --- |
> | `apps/admin` | `system/` 下 13 个 controller 的前缀事实 · `src/core/` 仅剩两个文件的现状 | ~10 行 |
> | `apps/mall` | `public-routes.ts` + 契约测试的**负向契约与其自增强约束**（"要开放请新立变更，不要删断言"）· 本端不注册的三个横切清单 · 两个应用本地都默认 3000 的端口坑 | ~18 行 |
> | `packages/core` | 目录清单 · 深模块先例清单（可从源码读出） | ~12 行 |
> | `packages/domain` | providers-only 已在根文件「关键目录」写明 | ~0 行 |
>
> 三者都低于规格设定的 **30–80 行下限**，且继续写就必然复述根文件规则——那是本变更要消灭的病。**这不是"没做完"，而是任务 4.1–4.4 的前提在实施时被实证推翻。** 三条出路见本次交付说明中的提问（只建 mall 一份 / 先把根文件的按包内容下沉再建 / 放弃 P3），需你选择后再继续。

- [ ] 4.1 新增 `apps/admin/AGENTS.md`（30–80 行 delta：`system/...` 前缀、权限码与权限扫描端点、`OperationLogInterceptor` 仅本端挂载、5 个刻意差异化守卫变体不迁移）。验证：行数落在 30–80，且逐句 grep 确认不含根文件已有规则句
- [ ] 4.2 新增 `apps/mall/AGENTS.md`（`CustomerJwtGuard` / `OptionalCustomerGuard` / `@CurrentCustomer()`、可见性三分流、不产生审计写、负向契约由 `public-routes.ts` + 契约测试强制）。验证：同上
- [ ] 4.3 新增 `packages/core/AGENTS.md`（深模块与薄适配器、只暴露 barrel、不得 import domain）。验证：同上
- [ ] 4.4 新增 `packages/domain/AGENTS.md`（providers-only 无 controller、equipment 五件套与 inquiry Service/DTO、事务与金额派生指向 `database.md`）。验证：同上；**若该包 delta 撑不起 30 行则不建**，并在本任务记录不建的理由
- [ ] 4.5 根 `AGENTS.md` 相应减重至 ≤200 行（把已下沉到包级的内容改为指针）。验证：`wc -l AGENTS.md` ≤200，且 `Glob **/AGENTS.md` 计数为 5（或 4，若 4.4 判定不建）

## 5. P4 · 收拢 + 精简 + 结晶

- [ ] 5.1 把 `docs/monorepo-migration-summary.md` 的独有内容（§5 Mall 路由映射、§8 回滚与后续）摘成 ≤15 行写进 `docs/adr/0010` 的补充说明。验证：ADR 0010 新增补充说明段，且含路由映射表
- [ ] 5.2 把 `docs/specs/anonymous-filter-weighted-sort.md` 的独有内容（决策来源 grilling 三轮 15 题、Out of Scope、后续演进）摘成 ≤15 行写进 `docs/adr/0005` 的补充说明。验证：ADR 0005 新增补充说明段
- [ ] 5.3 把 `docs/ai-engineering-references.md`、`comparison-unibest.md`、`faq.md` 的结论摘成「体系设计依据」≤15 行写进 `docs/adr/0017` 的补充说明。验证：ADR 0017 新增补充说明段，含外部调研的数据来源与失效条件
- [ ] 5.4 新增 `docs/README.md` 索引，按 Diátaxis 四象限（tutorial / how-to / reference / explanation）分组现有文档，并把 `experience/` 归入 explanation。验证：`docs/` 下每篇文档在索引里出现且只出现一次
- [ ] 5.5 删除 `docs/features.md` 并清理引用（`README.md` 相关行）。验证：`grep -rn "features\.md"` 无残留，`pnpm docs:check` 通过
- [ ] 5.6 按 D8 对 `docs/deployment.md` ↔ `.agents/project/deployment.md`、`docs/response-format.md` ↔ `.agents/project/response-format.md` 各删自己那半重复内容，并加互链。验证：两对互链均可达；两文件的重复段落已不存在（逐段比对后记录结论）
- [ ] 5.7 精简 `docs/project-structure.md`：删除会腐烂的 ASCII 目录树，只保留"每个目录为什么这么挂"的说明。验证：文件 ≤65 行且不含 ASCII 树
- [ ] 5.8 验证：`docs/` 顶层为 5 篇（`README.md`、`configs.md`、`deployment.md`、`response-format.md`、`project-structure.md`）且合计 ≤550 行。验证：`ls docs/*.md | wc -l` = 5，`wc -l docs/*.md` 合计 ≤550

## 6. P5 · 改名 + 归位 + 删除 + 扩自检

- [ ] 6.1 用 `git mv` 把 `hermes/` 整体改名为 `docs/experience/`（内部 `pitfalls/`、`patterns/` 结构不变）。验证：`ls docs/experience` 显示三个条目；`git status` 中改动被识别为 rename
- [ ] 6.2 更新 `docs/experience/README.md`：顶部加一行"曾名 `hermes/`"，并把「内容」列表改为实际存在的两个子库。验证：文件首段含"曾名 `hermes/`"且不含已取消的子库
- [ ] 6.3 取消 `docs/experience/decisions/` 桶（ADR 结论索引与变更摘要删除，结论已由 5.3 与 `docs/adr/` 承载）。验证：`ls docs/experience` 不再含 `decisions`
- [ ] 6.4 更新 `CONTEXT.md`：`Experience library` 词条指向 `docs/experience/`（并注明它现为 `docs/` 的子层）、更新 `_Avoid_` 清单。验证：`grep -n "hermes" CONTEXT.md` 无残留（除"曾名"说明外）
- [ ] 6.5 更新根 `AGENTS.md`「知识位置」表：由 7 处改为 6 处，`docs/` 行注明含 `experience/` 子层。验证：表格行数与名称核对一致
- [ ] 6.6 把 `.agents/project/pitfalls.md` 的内容并入 `docs/experience/pitfalls/` 并逐条去重（已知重复：权限缓存失效）。验证：`.agents/project/` 为 9 篇纯规范；经验层无重复条目（按规则签名 grep 核对）
- [ ] 6.7 按经验分流判据处理既有条目：P1（已被 `.gitattributes` 覆盖）退休 · P6 / P13 / P15（与根文件重复）删除 · P17（与语料重复）合并 · P2/P3/P5 与 P19/P21 迁往 `docs/` 的 how-to 排查节。验证：逐条处置均有记录，经验层条目数下降且无重复
- [ ] 6.8 删除 §2.7 分档内的 9 篇：`docs/ai-development.md`、`docs/ai-engineering-system-audit-2026-09-11.md`、`docs/specs/anonymous-filter-weighted-sort.md`、`docs/monorepo-migration-summary.md`、`docs/ai-engineering-{references,comparison-unibest,faq,workflow,playbook}.md`。验证：9 个路径均不存在
- [ ] 6.9 清理受影响的引用：`README.md` 中指向 `docs/ai-development.md` 的链接、`docs/adr/0017` 中指向 playbook 的引用。验证：`grep -rn "ai-development\|ai-engineering"` 在文档中无残留（新增的补充说明除外，需逐条确认）
- [ ] 6.10 给 `scripts/check-docs.mjs` 增加 `extraDirs` 配置项，覆盖 `docs/`、`docs/experience/`、`wayfinder/`（**不修改** `CORPUS_CANDIDATES`）。验证：运行后输出里列出新增的覆盖目录与文件数
- [ ] 6.11 处置扩围后新出现的发现：逐条判断"修"或"进白名单"，不为了让检查通过而放宽判据。验证：`pnpm docs:check` exit 0，且每条被白名单放行的项都有理由记录
- [ ] 6.12 用故意违规的探针复验扩围后的自检：能拦住四类违规，且对模板占位、散文短语、其他文档的 `§` 指针保持静默。验证：探针运行时 exit≠0，移除探针后 exit=0
- [ ] 6.13 最终验证：常读核心（根 `AGENTS.md` + `CONTEXT.md` + `.agents/project/` + `docs/experience/` + `README.md`）合计 ≤1200 行；`grep` 确认无指向已删文件的引用。验证：`wc -l` 合计数字与 grep 结果均符合

## 7. P6 · 方法论进 skill（可选，仓库外动作，需单独确认后执行）

- [ ] 7.1 把 `docs/ai-engineering-playbook.md` §3「资产最小模板」与 §6「棕地增量开发 + 门禁棘轮」提炼进 `agent-constraint-docs` 的 references（或按设计文档的 Open Question 另建 skill）。验证：skill 内新增文件存在，且内容不含任何 GVRAY 专有事实
- [ ] 7.2 运行该 skill 的自测脚本，确认未破坏既有行为。验证：自测通过；若涉及判断逻辑改动，另跑归一化对比
