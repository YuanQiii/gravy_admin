## Context

动机见 `proposal.md`。这里只记影响做法的现状与约束：

- **载体与规模（实测）**：全仓 188 个 markdown / 约 13100 行。`openspec/changes/archive/` 6223 行（47%，流程产物）、`docs/` 顶层 14 篇 2748 行、`openspec/specs/` 1297 行、`docs/adr/` 17 篇 1186 行、`.agents/project/` 10 篇 451 行、`hermes/` 4 文件 171 行。常读核心约 1068 行。
- **已生效的约束**：本仓 markdown **不受 formatter 管辖**（`package.json` 的 `format` script glob 只含 `apps/**`、`packages/**`、`test/**` 的 `.ts`；对既有 md 跑 prettier 会全量 FAIL）——因此本变更产生的 md **不擅自格式化**。
- **既有决策必须遵守**：`docs/adr/0017`（路由表单一归口、语料目录不得有索引、状态描述唯一家）、`docs/adr/0010`（monorepo 双应用与共享内核的依赖方向）。
- **自检工具已存在**：`scripts/check-docs.mjs`（零依赖，覆盖根文件 + 语料目录递归 + 仓库内目录级 `AGENTS.md`；当前 11 文件 0 违规），但**未接入 CI**（仓库无 `.github/`）。
- **Gate 现状（实测）**：fmt FAIL 212 文件、lint FAIL 1718 条、`test` PASS、typecheck **可用且四个 workspace 全绿**（`tsc -p <ws>/tsconfig.json --noEmit`）、`pnpm build` 状态未测（属"需先确认"操作）。
- **门禁工具链**：仓库无 CI、无 husky、无 CODEOWNERS。

## Goals / Non-Goals

**Goals:**

- 让 `specs/constraint-docs/spec.md` 的 Requirement 全部落地并被机器检查，而不是仅存在于散文里。
- 常读核心从 1068 行降到 ≤1200 行以内（目标约 950），`docs/` 顶层由 14 篇 2748 行收敛到 5 篇 ≤550 行。
- 建立"改文档也走流程"的闭环：自检进 CI、指令文件有 owner、删除/改名有引用完整性检查。

**Non-Goals（设计层面的边界，不含 proposal 已列的非目标）:**

- **不真动 `docs/` 目录结构**（只做索引分组）——理由见 D4。
- **不合并语料篇**——理由见 D9。
- **不改 `openspec/specs/` 下任何既有能力的 Requirement**——`workspace`、`schema-migrations` 等描述的是运行时契约，本次只新增一个工程类能力。
- **不做一次性 fmt / lint 清理**——既有基线是既有事实，不在本变更的验收范围内。

## Decisions

**D1 · `docs/` 与语料目录的同名双写保留两层，用"边界硬化 + 互链"治理，而不是合并。**
理由：两者轴不同（`docs/` 版是给人操作的 how-to，语料版是给 agent 改代码时的机制与约束）。备选：合并成一篇（破坏轴单一，且会让人读的长文挤进 agent 的按需路径）；用符号链接（markdown 场景不适用，且 Windows 需管理员/开发者模式）。**已知代价**：物理唯一做不到，只能靠互链 + 自检压制——本仓历史上正是这三对双写漂出了 3 处死链 + 9 处迁移前旧路径。

**D2 · `.agents/project/pitfalls.md` 移出语料目录。**
理由：按内容类型它是"经验"，放在"规范"目录里即为类型混装；且它与 `hermes/pitfalls/` 是两个平行经验库（"权限缓存失效覆盖不全"两处都记）。备选：留在语料并加交叉引用（两处仍会各自漂移）。

**D3 · `docs/specs/anonymous-filter-weighted-sort.md`（417 行）结晶后删除。**
理由：正式规格已在 `openspec/specs/b2c/browse/`，结论已在 `docs/adr/0005`；它是规格的第二份副本。**独有内容先摘**：`:376-410` 的「决策来源（grilling 三轮 15 题）」「Out of Scope」「后续演进」折进 ADR 0005 补充说明。备选：留原地并标注"设计稿"（仍是副本，且占阅读路径）。

**D4 · Diátaxis 第一期只做"索引分组"，不动文件名。**
理由：动文件名要同步 `README.md` 的 8 条链接，而 `check-docs.mjs` 当前**不覆盖 `docs/`**——没人会自动查出死链。备选：一次性按象限移动并手工体检全量链接（风险集中在一次操作，且与"扩自检覆盖"这一先行条件颠倒）。

**D5 · `docs/ai-*.md` 七篇结晶后删除，不新建 `research/` 目录。**
理由：见分档——`ai-development`（与根文件/README 重叠且自带第二张路由表）与 `system-audit`（已过期，且被根文件「已知缺陷」取代）可直接删；`references`/`comparison-unibest`/`faq` 是不可重推的实测数据，但结论可折成 10–15 行进 ADR 0017 补充说明；`workflow`/`playbook` 另见 D10。备选：建 `research/` 收留（多一个容器，2537 行仍留在阅读路径）。**可恢复性**：删除后 `git show <旧提交>:<路径>` 仍可取回，属"可恢复的不可逆"。

**D6 · 改名 `hermes/` → `docs/experience/` 必须伴随四处同步。**
`CONTEXT.md` 原把 `Human docs`(`docs/`) 与 `Experience library`(`hermes/`) 写成两个**并列层**；改名后经验层成为 `docs/` 的**子层**，若不改词条则文档与事实立刻不符。四处：① `CONTEXT.md` 词条与 `_Avoid_` 清单；② 根文件「知识位置」表（7 处 → 6 处）；③ `docs/README.md` 索引归入 explanation 象限；④ `docs/experience/README.md` 顶部一行"曾名 `hermes/`"（防旧记忆与旧链接直接失效）。备选：保留 `hermes/` 不改（隐喻名，且与 Hermes Agent 框架、unibest 的同名目录构成三义——`docs/ai-engineering-faq.md` Q2 曾评 `docs/experience/` 为最佳命名）。

**D7 · `decisions/` 桶取消，而不是改名保留。**
理由：实测它已在腐烂——ADR 索引停在 0016（漏 0017，而 `docs/adr/` 实际 17 篇）；变更决策摘要只回填 2 条，而归档有 38 个变更（2/38）。两块职责都有更权威的家（`docs/adr/` 目录本身 / `openspec/changes/archive/*/{proposal,design}.md`）。备选：保留并只扩充为"调研桶"（仍留着一份会漂移的 ADR 索引）。**代价**：`docs/adr/0017` 明确写过"ADR 索引的结论版在 `hermes/decisions/README.md`"，取消即推翻其一条 → 必须给 0017 加补充说明（先例：0011 有补充说明、0014 有更正注记）。

**D8 · 同名双写「去重 + 互链」，不是「合并成一篇」。**
`docs/deployment.md`(211) 与语料版(64)、`docs/response-format.md`(98) 与语料版(27) 的重复段落各删自己那半，保留各自定位。备选：合并成一篇（破轴）。

**D9 · 语料 9 篇不再合并。**
合并横切篇（`coding`/`dto-swagger`/`permissions`/`response-format`）看似精简，实则让"改权限"要读 200 行的混合文档。**衡量精简用"每次任务读多少行"，不用文件数**。备选：合并（牺牲按需性）。

**D10 · 方法论（`workflow` + `playbook`，1102 行）出仓库、进 skill。**
实测 `agent-constraint-docs` 的 5 篇 references 合计仅 361 行，且全库无「棕地/brownfield」覆盖 → playbook §3「六份资产最小模板」（约 176 行）与 §6「棕地增量开发 + 门禁棘轮」（约 136 行）是真实独有内容。处置：提炼进 skill 后从仓库删除。**属仓库外动作，需单独确认**（本变更只登记该决定与前置条件）。备选：留在 `docs/`（形态错配：它服务的是"下一个项目"，不是 GVRAY）；直接删（丢掉那 312 行）。

**D11 · CI 用"棘轮"而非全量达标。**
`docs:check` + typecheck×4 + `test` 三项硬卡（均已本地实测通过），fmt/lint 只查本次改动文件。备选：先修完 1718 条 lint / 212 个 fmt 文件再开门禁（一次性大 diff 会掩盖真实改动，且把门禁上线时间推迟到一次大重构之后）。

**D12 · 删除一律"先结晶、再删除"，且在**同一次提交**内完成。**
结晶物 = ADR 0005/0010/0017 的补充说明（每处 ≤15 行，形式为"结论 + 可从此前提交取回原文"）。备选：直接删（丢掉不可重建的实测数据）；结晶物单列一个新文档（又制造一个容器，正是本变更要解决的问题）。

## Risks / Trade-offs

- **删除不可逆** → 结晶前置 + 单批单提交（`git revert` 可整批回退）；`docs/README.md` 索引里注明"已删除的体系自述/调研可从此前提交取回"。
- **改名破坏旧引用与旧记忆**（README、ADR、以及人与 agent 的记忆里都有 `hermes`）→ 四处同步（D6）+ 新目录 README 写"曾名 `hermes/`"+ `check-docs` 覆盖扩到 `docs/experience/` 后可持续拦截。
- **`check-docs.mjs` 加 `extraDirs` 后可能冒出既有违规**（`docs/` 从未被查过）→ 先试跑并记录发现，再决定"修"还是"进白名单"，**不为了让检查通过而放宽判据**。
- **CI 首跑即红的信任成本** → 只把本地已实测通过的三项设为硬卡；`pnpm build` 明确不纳入第一期（状态未测且属"需先确认"操作）。
- **结晶可能丢细节** → 每处补充说明有 15 行上限，超出的以"指向此前提交路径"承载；宁可留指针也不搬全文（搬全文等于又造副本）。
- **包级 `AGENTS.md` 会与根文件漂移**（本变更为根文件增加新规则）→ 包级只写 delta；验收用逐句 grep 核对"包级不存在根文件规则句"。
- **`docs/` 顶层减到 5 篇后，部分信息只剩 git 历史** → 接受（这正是"不在阅读路径"的代价）；门槛是"独有结论必须先结晶"。
- **拆嵌套 `AGENTS.md` 增加维护面** → 以 20–80 行 + 只写 delta + 就近优先为界；**若某包的真实增量撑不起 20 行，则不建该文件**（实施时实测：`packages/domain` 的增量≈0，因为它的事实已写在根文件「关键目录」一行里 —— 不为凑数建文件）。
- **下沉本身不减少根文件行数**（实施时实测）：根文件从 194 行变成 195 行（字符从 12318 降到 12021）。移走的 4 条目录清单被 4 条指针替代、又新增 1 行路由表行，净效果接近零。**收益在结构而不在行数**：agent 改某包时会先读到该包的专属约定，而不是在根文件里读一大段含混描述。若将来真要给根文件显著减重，只能减少**规则条数**或把规则下沉——而那会削弱"只读根文件即可自足"这条更重要的性质，需另立变更权衡。

## Migration Plan

按批次推进，**每批一个独立提交**，可单独回退：

1. **P0 只改错**：README 六处 + Gate 表 typecheck 行 + 四条红线入根文件。验证 `pnpm docs:check` 仍绿。
2. **P1 接门禁**：`.github/workflows/ci.yml` + `CODEOWNERS`。验证 CI 首跑全绿。
3. **P2 补人向文件**：`CONTRIBUTING.md`（含承接 `api-testing.md`）+ `SECURITY.md`。
4. **P3 拆嵌套入口**：4 份包级 `AGENTS.md` + 根文件减重。验证 `**/AGENTS.md` = 5、无复述。
5. **P4 收拢 + 精简 + 结晶**：删 `features.md`/`api-testing.md`、建 `docs/README.md` 索引、D8 去重、删 ASCII 树、把独有结论写进 ADR 0005/0010/0017 补充说明。验证 `docs/` 顶层 5 篇 ≤550 行。
6. **P5 改名 + 归位 + 删除 + 扩自检**：`hermes/` → `docs/experience/`（D6 四处）、`decisions/` 取消、`pitfalls.md` 归位去重、删分档内 9 篇并清引用、`check-docs.mjs` 加 `extraDirs`。验证扩围后仍绿、`grep` 无残留引用。
7. **P6（可选，仓库外）**：方法论提炼进 skill——需单独确认后执行，不在本变更的合入条件内。

**回退策略**：单批 `git revert`；改名批次若需回退，用 `git mv` 反向并在同一提交内恢复四处表述。**不引入数据库变更**，无数据迁移风险。

## Open Questions

- `docs/` 何时真正按四象限移动目录（依赖：`check-docs` 已覆盖 `docs/` + 一次全量链接体检；可另立变更）。
- 四条红线的实测值何时重测（倾向在 CI 加一个每月手动触发的 workflow，届时另立任务）。
- P6 的归属：并入既有 `agent-constraint-docs` 的 references，还是新建一个专注"体系从零搭建"的 skill。
