## Why

文档体系已从"约束"退化为"文本堆积"，而**没有任何机制阻止它继续退化**：

- **核心里混着杂质**：全仓 188 个 markdown / 约 13100 行，其中 `docs/` 顶层 14 篇 2748 行里 **2085 行（76%）不属于项目文档**——`ai-*.md` 7 篇（1978 行）是「体系自述 + 外部调研」，即"怎么从零建一套体系"的**方法论**，与本仓日常无关（形态应是 skill）；`docs/features.md`（107 行）是**已被实测证伪**的进度清单：`:44` 标「数据权限控制」未实现、`:60` 标「岗位权限模板」未实现、`:67` 标「系统通知公告」未实现、`:71` 标「系统运行日志」未实现，而 `apps/admin/src/modules/system/{positions,notices,operation-logs}` 三个模块实际存在。
- **同一知识多处并存且已漂移**：`AGENTS.md` 的 Gate 表把 typecheck 写成 `NOT AVAILABLE`，实测 `tsc -p {apps/admin,apps/mall,packages/core,packages/domain}/tsconfig.json --noEmit` **四个 workspace 全部 exit=0 / 0 error**；`README.md:74-86` 的项目结构图仍是**单应用时代**的 `src/core/`、`src/modules/`；`README.md:7,9` 的两张封面图指向已删除的 `docs/screenshots/`（GitHub 首页是坏图）；`README.md` 的 Roadmap 与 `docs/features.md` 是**两份**互相漂移的进度清单；`README.md:52` 教新人跑 `pnpm prisma db push`，与「一切 schema 变更走 migration」的硬规则相悖。
- **经验层在腐烂**：`hermes/decisions/README.md:9-26` 的 ADR 索引**停在 0016、漏了 0017**（`docs/adr/` 实际 17 篇）；「最近变更决策摘要」只回填 **2 条**，而 `openspec/changes/archive/` 有 **38** 个归档变更。这不是偶然——它是"同一份映射存在第二个副本"的必然结果，`docs/adr/0017` 自己论证过这一点，却被自己漏掉。
- **门禁缺位**：`scripts/check-docs.mjs` 已实现且当前 0 违规，但**未接入任何 CI**（仓库无 `.github/`），任何人改动都可绕过；Gate 五维度里只有 `test` 与 fmt 基线被实测记录，其余靠人工。
- **安全面没有声明渠道**：9 个 `.env.*` 已入库（根 3 + `apps/admin` 3 + `apps/mall` 3），且根 / `apps/admin` / `apps/mall` **三处 `.env.production` 的 `JWT_SECRET` 与各自的 `.env.development` 完全相同**，而仓库没有 `SECURITY.md` 声明上报渠道与处理方式。

问题不在于"某几篇文档写得不好"，而在于**文档体系没有被当作可验证的契约来管**：规则散落在 `AGENTS.md`、ADR 与散文里，副本无人拦截，规模无人设限。本变更把"怎么组织文档"从散文升级为**可被机器检查的规格 + 强制门禁**。

## What Changes

- 新增 `.github/workflows/ci.yml`：`docs:check` + typecheck（4 个 workspace）+ `test` **三项硬卡**；fmt / lint 改为"只查本次改动文件"的棘轮（既有基线 fmt 212 文件、lint 1718 条，**不做一次性大改**）；`paths: ["**","!**.md"]` 使纯文档改动不跑重活；加 `concurrency.cancel-in-progress` 与 `workflow_dispatch`。
- 新增 `.github/CODEOWNERS`：`AGENTS.md`、`**/AGENTS.md`、`.agents/`、`docs/adr/`、`docs/experience/` 归负责人；指令文件只经 PR 修改。
- 扩大 `scripts/check-docs.mjs` 覆盖范围：由「根文件 + 语料目录」另含 `docs/`、`docs/experience/`、`wayfinder/`（新增 `extraDirs` 配置项；**不修改** `CORPUS_CANDIDATES`，否则会造出"两个语料目录"）。扩围后须用故意违规的探针复验"能拦且不误报"。
- **BREAKING**：`hermes/` 更名为 `docs/experience/`，其内部 `decisions/` 桶取消（ADR 结论索引弃用——`docs/adr/` 目录本身即权威；变更决策摘要交回 `openspec/changes/archive/*/{proposal,design}.md`）。最终形态为三文件：`README.md` + `pitfalls/` + `patterns/`。
- **BREAKING**：删除 `docs/` 顶层 11 篇 —— `features.md`、`api-testing.md`（内容并入 `CONTRIBUTING.md`）、`monorepo-migration-summary.md`、`specs/anonymous-filter-weighted-sort.md`、`ai-*.md` ×7。其中独有结论**必须先结晶**：`monorepo-migration-summary` 的「Mall 路由映射」进 `docs/adr/0010` 补充说明；`docs/specs/` 的「决策来源 / Out of Scope」进 `docs/adr/0005` 补充说明；`references`/`comparison-unibest`/`faq` 的「体系设计依据」进 `docs/adr/0017` 补充说明。
- **BREAKING**：`.agents/project/pitfalls.md` 移出语料目录（按内容类型它是"经验"而非"规范"），其 9 个反模式主题并入 `docs/experience/pitfalls/` 并逐条去重；语料目录变为 9 篇纯规范。
- 新增 4 份包级 `AGENTS.md`（`apps/admin`、`apps/mall`、`packages/core`、`packages/domain`），**只写 delta、不复述根文件**，各 30–80 行；根文件相应减重。
- `AGENTS.md`：typecheck Gate 行订正为实测 PASS（附命令）· 新增「验证与收尾」四条规模红线 · 「知识位置」表随改名同步（7 处 → 6 处，`docs/` 行注明含 experience 子层）· 总量控制在 ≤200 行。
- 新增根级 `CONTRIBUTING.md`（含 `api-testing.md` 承接内容）与 `SECURITY.md`（写明 `.env.*` 入库现状、`JWT_SECRET` 未分离、上报渠道）。（`CHANGELOG.md` 不加：本仓不发布版本，conventional commits 的 `git log` 即变更史。）
- 修正 `README.md` 的事实错误：结构图改 monorepo 版 · 删两张死链封面 · `prisma db push` 改走迁移路径 · 进度清单只留一份 · 文档表补 `openspec/`、`docs/adr/`、`docs/experience/`、`wayfinder/`、`CONTEXT.md` · 修 `:133` 的失效指向。
- `docs/` 顶层由 14 篇 / 2748 行收敛到 **5 篇 / ≤550 行**（`README.md` 索引 · `configs.md` · `deployment.md` · `response-format.md` · `project-structure.md`）；新增 `docs/README.md` 索引按 Diátaxis 四象限分组。**本期不动文件名**：`check-docs` 尚未覆盖 `docs/`，先做索引分组以降低链接风险。
- 同名双写（`deployment.md`、`response-format.md` 的 `docs/` 版与语料版）**去重 + 互链**，而不是合并成一篇：两者轴不同（`docs/` 版是给人操作的 how-to，语料版是给 agent 改代码时的机制与约束）。

## Capabilities

### New Capabilities

- `constraint-docs`: 约束文档体系的可验证契约 —— 单一事实源与单一路由表、语料目录的形态与规模、`docs/` 的读者轴、规模红线、文档自检的覆盖范围与 CI 强制等级、状态描述的唯一家。

### Modified Capabilities

（无。`workspace` 定义的是双应用工作区的**运行时与结构**契约，`schema-migrations` 定义的是 schema 变更路径契约，本变更均不改其 Requirement。）

## Impact

- **受影响**：`AGENTS.md` · `CONTEXT.md` · `README.md` · `.agents/project/`（10 → 9 篇）· `docs/`（14 → 5 篇，另新增 `README.md` 与 `experience/`）· `hermes/` → `docs/experience/`（路径变更）· `scripts/check-docs.mjs` · `.github/`（新建）· `docs/adr/0005`、`0010`、`0017`（各加补充说明）
- **不受影响**：`apps/**`、`packages/**`、`prisma/**`、`test/**`、`openspec/specs/**`（能力规格本体不变）
- **引用者需同步**：`README.md:133`（原指向将被删除的 `docs/ai-development.md`）· `docs/adr/0017:64`（原指向将被删除的 playbook）
- **不纳入本变更**：`pnpm build` 是否进 CI（需先单独测量，属"需先确认"操作）· JWT 密钥轮换与 `.env.*` 出库（另立事项）· 把方法论提炼进 `agent-constraint-docs` skill（仓库外动作，需单独确认）
