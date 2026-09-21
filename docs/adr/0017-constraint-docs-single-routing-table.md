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

## 参考

- `scripts/check-docs.mjs`（自检实现，含 CONFIG 常量）
- `AGENTS.md` →「知识位置」「按需阅读与同步更新」「验证与收尾」
- `CONTEXT.md` →「Documentation layers」
- `docs/ai-engineering-playbook.md`（被推翻的两条规范已就地标注）
- 关联：ADR 0010（Monorepo 双应用）
