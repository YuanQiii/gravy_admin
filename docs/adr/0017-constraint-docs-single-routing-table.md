# ADR 0017: 约束体系重构 —— 路由表单一归口、语料目录不带索引

- 状态：已接受
- 日期：2026-09-21
- 关联：ADR 0010（Monorepo 双应用，本次大量修正为迁移前的路径漂移）

## 背景

仓库里同时存在**两套针对同一件事**的约束体系设计：

1. `AGENTS.md` + `.agents/project/`（10 篇摘要）—— 已落地运行；
2. `docs/ai-engineering-*.md`（7 篇，2026-09-11）—— 设计文档，其中自行规定了根文件的规格（六节骨架、**总长 ≤2000 字符**），并要求在语料目录里创建 `README.md` 作为「任务 → 先读哪几篇」映射表。

现实与第 2 套规范已经背离：`AGENTS.md` 长到 **6961 字符**（超 3.5 倍）、**7 节**（多出「数据库约定」「验证与收尾」，缺「需先问的变更」）；而它要求的 `.agents/project/README.md` 的映射表已经**漂出 3 条死链**（指向三个早已删除的根文档）。

同日审计还实测出：`hermes/patterns/` 与 `hermes/pitfalls/` 有 **14 处** monorepo 迁移前的断链；`hermes/decisions/README.md` 的 ADR 索引**停在 0009**（实际 16 条）；`hermes/README.md` **自带第二份路由表**。

## 决策

1. **采信 `agent-constraint-docs` 的规则，推翻旧 playbook 的两条**：
   - **删除 `.agents/project/README.md`** —— 语料目录不得持有索引；索引就是根文件的路由表。
   - **放弃根文件 ≤2000 字符上限**（节数也不锁死）。
2. **路由表单一归口**：只在 `AGENTS.md` 的「按需阅读与同步更新」维护，该表同时承载**读方向**（先读哪篇）与**写方向**（改完同步哪篇）。`hermes/README.md` 自带的第二份映射表已删，只保留「这库存什么 + 维护约定」。
3. `AGENTS.md` 增设 **`## 知识位置`** 一节，登记 6 处：`CONTEXT.md` / `.agents/project/` / `docs/adr/` / `docs/` / `hermes/` / `wayfinder/`。
4. **文档层术语在 `CONTEXT.md` 定死**：`Corpus`（语料目录）、`Experience library`（经验库）、`Human docs`（正式文档）、`Glossary`（领域词典）—— 禁止用「知识库」统称。
5. **`CLAUDE.md` 只做一行 `@AGENTS.md` 导入**，不复制任何内容。
6. **落地自检**：`scripts/check-docs.mjs` + `pnpm docs:check`，检查四类会静默腐烂的东西（相对链接可达 · 文档提到的命令真实存在 · 无指向根文件的章节号指针 · 语料目录无索引）。

## 理由（为什么推翻旧 playbook 的两条）

- **判据是强制力，不是新旧**。新规范带**可执行的自检**——`check-docs.mjs` 的 `forbidCorpusIndex` 会直接把 `.agents/project/README.md` 判为违规；旧规范纯靠人自觉。而旧规范**自己的 2000 字符上限被突破到 6961**，正是「无强制的规范必然腐化」的本仓实证。
- **索引是同一份映射的第二个副本**。语料索引与根文件路由表覆盖同一批文档：改一篇文档要改两张表，而 `.agents/project/README.md` 已经率先漂出 3 条死链、并且其中一条映射表与根文件高度雷同。
- **写明代价**：删掉语料索引后 `AGENTS.md` 是唯一路由入口，它必然继续变长（本次 6961 → 8264 字符）。这笔交易是「**用根文件的长度换单一真相**」，不是免费的。

## 后果

- `AGENTS.md` 现为 154 行 / 8 节 / 8264 字符。
- **新增场景文档时必须改 `AGENTS.md` 路由表一行**，不得再新建索引文件（自检会拦）。
- `docs/ai-engineering-*-.md` 的**正文保留**作为历史设计文档；被本 ADR 推翻的两条已就地标注，避免后来者照旧规范施工。
- `check-docs.mjs` **未接入 CI**（仓库无 `.github/`），目前只有本地 `pnpm docs:check`。将来接 CI 时放进**独立 workflow 文件**并加 `workflow_dispatch`，不要放在仓库初始化脚本会删除的位置。
- `docs/adr/` 里仍有 6 条断链（`0005:80`、`0005:81`、`0009:13`，属 ADR 0005/0009 的历史路径）——本次**已修**，另注：`0005:81` 原本指向的 `ThrottlerModule + Redis` TODO **已不存在**，已改写为「TODO 已完成」并指向 `apps/*/src/app.module.ts`。

## 补充说明（2026-09-21，同日二次修订）

同日一轮六维度审计发现了上面未覆盖的一类腐化，一并确立为规范：

7. **语料文档不得复述根文件的规则。** 分工是「根文件 ＝ 一句话规则（自动加载，必须自足）＋ 语料 ＝ 该规则的机制 / 字段 / 步骤」。语料里只复述、不提供细节的条目应删除；能提供细节的，不得把规则原句再写一遍。

**实证**：`.agents/project/architecture.md` 原写「受保护接口显式使用 `JwtAuthGuard`」，并要求系统管理 Controller 统一挂四件套守卫——那是被 `AccessGuard` 取代的旧模式。同一条错误在 `AGENTS.md` 中已于同日订正，但**语料里那份没跟着改**，而实测全仓这样写的 controller 为 **0 个**。根因正是复述：复述的那份不会随原始规则一起更新。该文件已缩减为只保留架构层内容（模块结构 / 关键目录 / 双应用边界 / 分页），其余改为指针。

同批处理：
- 根文件 `## 数据库约定` 整节下沉为新语料篇 `.agents/project/database.md`（根文件只留「生产禁跑 `prisma db push`」一条硬规则 + 指针，路由表相应改行）——该节违反「根文件不留只有某类任务才用的段落」。
- `coding.md` / `workflow.md` 中复述根文件规则、以及重复「需确认清单」的条目改为指针（同一份清单写两处必然漂移）。
- **状态描述收拢到 `AGENTS.md` 的「已知缺陷与待确认」作为唯一家**：`CONTEXT.md` 撤掉 `Permission-cache invalidation` 词条里的实现与 TODO（词典只定义术语），`.agents/project/pitfalls.md` 只记"这是有意的"并指回那一节。
- 修正两处过期陈述：根文件 Gate 表下方的输出行数（1700 → 实测 2532）与 `dto-swagger.md` 中「openapi 产物当前未加入 `.gitignore`」（已于同日加入）。

**代价（延续决策 1 的记账）**：语料增至 10 篇 / 451 行；`AGENTS.md` 增至 179 行 / **11394 字符**（本次 8264 → 11394）。涨幅主要来自「已知缺陷与待确认」一节——它是状态而非规则，若继续增长，下一次取舍应是把该节整体下沉为语料篇。

## 补充说明（2026-09-22，体系设计的外部依据留存）

原三篇调研文档已删除：`docs/ai-engineering-references.md`（12 个项目扫描，2026-09-11，用 `GET /repos/{owner}/{repo}/contents/` 逐一核对标志文件 + 3 个重点项目拉全文）、`docs/ai-engineering-comparison-unibest.md`（与 `feige996/unibest` 逐项对照）、`docs/ai-engineering-faq.md`（五问答疑）。它们记录的是**外部世界当时的样子**，不可从本仓代码推导，故把结论与失效条件留存于此，原始数据交给 git 历史。

**可复核的扫描事实**：12 个候选里**同时具备「AI 上下文层」与「CI 门禁」的只有 5 个**，其中 3 个还是方法论/AI 工具自身（spec-kit、codex、BMAD）。halo 与本仓同类，但**有 CI、无 ADR、无经验库**；本仓恰好相反（有 openspec + ADR + 经验库，无 `.github/`）。→ 结论是本仓**欠的是「把已有规则接上 CI」**，而不是再设计一层文档。

**两条穿透性结论（本补充说明的重点）**：① **没有 CI，门禁就是建议**——unibest 装齐 husky/commitlint/lint-staged 仍可 `git commit --no-verify` 绕过；② **没有物理约束，「唯一事实源」就会长出副本并漂移**——unibest 的 `AGENTS.md` 声明事实源在 `hermes/`，而 `.cursor/rules/` 下已复述并漂成泛化文本（错误四分类 → "可以用 http 或者 alova 或者 vue-query"）；本仓同样存在 `deployment` / `configs` / `response-format` 三对同名双写。这正是决策 1「能机器检查的才叫规范」的外部依据。

**失效条件**：数据采集于 2026-09-11，对**外部项目**的结论会随其仓库演进失效；本仓的对照数字（12 中 5 有 CI 等）也只在当次快照下成立。后续查「某个 agent 约定该放哪、有没有人用」的入口是 `ItamarZand88/awesome-agent-conventions`（22 类约定，每条带 Read by / Location / Spec / Evidence / Last verified）——本次研究认为它是最值得收藏的单一索引。

**当时提出、尚未做的两条后续建议**：① 建项目级 `.agents/skills/`，但只装**本仓自己的流程**（新增 admin 模块、加权限码、Prisma 迁移），判据是「这个技能换到别的项目还能用吗」——能则放全局 `~/.agents/skills/`，不能才放项目级；② 「教训型记忆」在公开项目里几乎没有实践，本仓的 pitfalls 已是较好样本——FAQ Q2 据此把 `docs/experience/` 列为经验库目录名的**最佳选择**（理由：与 `docs/adr/` 同族、自解释、不依赖隐喻），本变更 P5 采用 `hermes/` → `docs/experience/` 改名即以此条为据。

## 参考

- `scripts/check-docs.mjs`（自检实现，含 CONFIG 常量）
- `AGENTS.md` →「知识位置」「按需阅读与同步更新」「验证与收尾」
- `CONTEXT.md` →「Documentation layers」
- `docs/ai-engineering-playbook.md`（**已删除**，2026-09-22 文档收敛；其被推翻的两条规范与结论见上方「补充说明」，全文在 git 历史中可取回）
- 关联：ADR 0010（Monorepo 双应用）
