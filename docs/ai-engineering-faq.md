# AI 工程化五问详解

针对 five 个具体问题逐一核实并给出结论。每条含证据来源与可执行建议。

- 研究时间：2026-09-11
- 配套阅读：[`ai-engineering-references.md`](ai-engineering-references.md)、[`ai-engineering-comparison-unibest.md`](ai-engineering-comparison-unibest.md)

---

## Q1 · 不使用 Cursor 时，`.cursor/rules` 怎么处理？

### 结论

**不用 Cursor 就不要建 `.cursor/rules/`。** 同理，不用 Claude Code 就不要建 `CLAUDE.md`，不用 Copilot 就不要建 `.github/copilot-instructions.md`。

### 各工具实际读哪个文件

| 工具 | 规则文件 | 需要指针吗 |
| --- | --- | --- |
| OpenAI Codex / Kilo Code | `AGENTS.md` | 不需要（原生读取） |
| Cursor | `.cursorrules` / `.cursor/rules/*.mdc` | 需要 |
| Claude Code | `CLAUDE.md` | 需要（首行 `@AGENTS.md`） |
| GitHub Copilot | `.github/copilot-instructions.md` | 需要 |
| Windsurf / Devin | `.windsurfrules` | 需要 |
| Gemini | `GEMINI.md` | 需要 |

### 三种情形分别怎么处置

**情形一：团队完全不用 Cursor** → 不创建。**不要为了"看起来完整"造空壳目录** —— 空的配置目录只会让人误以为已配置（GVRAY 的 `.claude/skills-disabled/` 就是这个反面案例）。

**情形二：已存在 `.cursor/rules/`，但团队不用 Cursor** → 先判断内容归属，再删除：
- 如果内容是**项目规范**（如 unibest 的 `project-overview.mdc` / `api-http-patterns.mdc`）→ 这些内容本来就放错了位置，应合并进规范事实源（`hermes/` 或 `.agents/`），由 `AGENTS.md` 索引，然后删除 `.cursor/rules/`。
- 如果内容是 **Cursor 独有的差异**（比如只对 Cursor 生效的规则）→ 保留，但确认无人用 Cursor 后应删除。

**情形三：有非 Cursor 工具会读 `.cursor/rules/`** → Cursor 规则文件并非只有 Cursor 读：**Hermes Agent 也会读取 `.cursorrules` 与 `.cursor/rules/*.mdc`**（作为优先级最低的兜底，优先级链为 `.hermes.md` → `AGENTS.override.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`）。此时可以保留，但**必须改成指针或软链，不能是第二份内容**。

### 关键判据

`.cursor/rules/` 唯一正当的用途是**放 Cursor 特有的差异**，或**做指向 `AGENTS.md` 的薄指针**。

unibest 的问题不是"建了 `.cursor/rules/`"，而是**在里面放了本该属于规范事实源的内容**——于是 `AGENTS.md` 声明"唯一事实源在 hermes/"，而 `.cursor/rules/` 却成了第二份副本，并且已经漂移。

---

## Q2 · `hermes/` 应该做"规范事实源"还是"经验/踩坑沉淀"？

### 核心洞察：项目知识有三类，不是两类

大多数人把项目知识分成"规范"和"经验"两类，于是纠结 `hermes/` 该装哪个。但实际是**三类**：

| 类型 | 回答的问题 | 已有归属 | 更新节奏 |
| --- | --- | --- | --- |
| **规范型** | 该怎么做 | `AGENTS.md`（入口）+ `.agents/`（按需知识库） | 随代码与规则改动，高频 |
| **状态型** | 现在是什么样 | 代码本身 + `openspec/specs/` | 随变更 sync，中频 |
| **教训型** | **别再踩什么坑** | **← 没有归属** | 只在踩到新坑时增加，低频只增 |

**所以答案不是"哪种更好"，而是：前两类已经有归属，第三类无处可去 —— 它才最该给 `hermes/`。**

这也解释了 unibest 为什么把 `hermes/` 用作规范源：因为它没有独立的知识库目录（它的 `.agents/` 被 skills 占满），规范无处可放，就塞进了 `hermes/`。而 GVRAY 有 `.agents/project/` 承接规范，`hermes/` 就可以专职做教训型。

### 三条支撑理由

**1. 生命力不同。** 规范会随项目演进被重构（拆分、迁到文档站、改名、随版本分支走）；而教训一旦成立就永久有效（"entrypoint 的 CRLF 会导致容器 exit 127" 十年后仍然成立）。**生命周期更长的东西，需要更稳定的容器**——把教训放在会频繁变动的规范目录下，它会被顺手删掉。

**2. 语义方向不同。** "信使（Hermes）"承载的是**时间维度**的传递——把过去踩过的坑传给未来的人。而"规范的传递"是**空间维度**的——在团队/工具/端之间对齐。unibest 的 README 自己也写了「把工程规范传递给每一位开发者（和 AI）」，那是空间语义，与"信使"的名字其实错位了。

**3. 更新触发点不同。** 规范随代码改动而变（每个 PR 都可能动），教训只在"踩到新坑"时增加。混在一起的结果是：改规范的人要通读教训库才能找到该改的那条，看完教训的人会误以为规范也在里面。

### 规范性排序建议

| 方案 | 评价 |
| --- | --- |
| **`docs/experience/`** | ✅ **最佳** —— 与 `docs/adr/` 同族（adr = 决策、experience = 经验），自解释，不依赖隐喻 |
| **保留 `hermes/` + 在 `CONTEXT.md` 写明本地含义** | ✅ 次佳 —— 迁移成本最低，且已有两个项目在用 |
| `hermes/` 用作规范源 | ⚠️ 避免 —— 规范将来重构时会被隐喻名卡住 |
| `.agents/memories/` | ⚠️ 慎用 —— 按约定该目录是 **agent 自维护的本地记忆，通常 gitignore**，不适合团队共享的教训库 |

> **一句话**：`hermes/` 做教训型更合适，但**更规范的做法是让目录名自解释**。若图省事沿用 `hermes/`，务必在 `CONTEXT.md` 里写清本地含义——否则它就是一个只有命名者懂的隐喻。

---

## Q3 · 项目级 `.agents/skills/` 与全局 `~/.agents/skills/` 的区别

### 本机实测

```
~/.agents/skills/          37 个技能  ← 用户级（全局）
~/.workbuddy/skills/       同一套 37 个 + _bm_skillid_migration.json  ← 镜像同步
C:/Project/gvray/.agents/skills   不存在
```

全局那 37 个包括 `wayfinder`、`grilling`、`tdd`、`domain-modeling`、`code-review`、`diagnosing-bugs`、`to-spec`、`to-tickets`、`understand-*` 系列等——都是**跨项目通用方法论**。

### 两者的区别

| 维度 | 项目级 `<repo>/.agents/skills/` | 用户级 `~/.agents/skills/` |
| --- | --- | --- |
| 作用域 | 仅当前仓库 | 本机所有项目 |
| 是否提交仓库 | ✅ 提交，团队共享 | ❌ 不提交，个人私有 |
| 内容性质 | 项目专属流程 | 跨项目方法论 / 个人习惯 |
| 随版本走 | ✅ 随分支与版本 | ❌ 不随 |
| 优先级 | **就近优先**（项目级覆盖全局） | 兜底 |
| 典型例子 | dify 的 `backend-code-review`、`how-to-write-component` | 本机的 `tdd`、`grilling`、`wayfinder` |
| 换项目还能用吗 | 不能 | 能 |

### 一条判断标准

**「这个技能换到别的项目还能用吗？」**

- 能 → 放全局 `~/.agents/skills/`（如"怎么写 Vue 组件"）
- 不能 → 放项目级 `.agents/skills/`（如"本项目的 API 分层与错误四分类""gvray 的权限码怎么加"）

### GVRAY 的现状

- 项目级 `.agents/skills/`：**不存在**
- 全局 `~/.agents/skills/`：37 个（已装，但与本项目无关）
- `.trae/skills/openspec-*`：**不是项目技能**，而是 `openspec init` 生成的工具集成文件

> **建议**：GVRAY 值得建项目级 `.agents/skills/`，但按 dify 的思路装**项目自己的流程**（如"新增一个 admin 模块的完整步骤""权限码怎么加""Prisma 迁移流程"），而不是装第三方库文档。这些知识在公开文档里查不到，才是 skill 的真正价值。

---

## Q4 · `AGENTS.md` 怎么写"薄入口"

### 先修正一个我之前的口误

我前几轮说 GVRAY 的 `AGENTS.md` 是"7.1KB"——那是**字节数**。中文一个字占 3 字节，按**字符数**才是可比的：

| 项目 | 字符数 | 相对 halo |
| --- | --- | --- |
| dify | 927 | 0.45× |
| halo | 2058 | 1.0×（基准） |
| **GVRAY** | **4855** | **2.4×** |

（`CONTEXT.md` 更甚：27452 字符。）

### 三条判据

**判据一 · 按需性。** 只在某类任务才需要的内容，不属于 `AGENTS.md`。它必须服务**每一次**会话。

**判据二 · 删除测试。** 删掉这一段，AI 做**常见任务**会出错吗？不会 → 删。

**判据三 · 索引优先。** 能用一行链接代替的，就只用链接，不写正文。

### 推荐结构（六节，按此顺序）

```markdown
# <项目名> — Agent 指南
一句话说明本文件的定位：自动加载入口，只放硬规则与索引。

## 项目概况
一段话，不超过 3 行：是什么 + 技术栈 + 架构形态

## 关键目录
一行一个目录，只写职责，不展开

## 开发硬规则
可执行的短句，5~10 条。禁写"注意代码质量"这类空话

## 需先问的变更
逐条列出哪些改动必须先确认（halo 的做法）

## 按需阅读
任务 → 文档 的映射表

## 常用命令
只放最常用的 5~8 条
```

### 必须包含的四类（来自 halo / dify 实测）

1. **命令** —— 怎么跑起来、怎么验证（`pnpm typecheck && pnpm lint && pnpm test:run`）
2. **边界** —— 不许做什么：禁改生成物、不许 `git add -A`、不许提交密钥
3. **需先问的事** —— halo 原文：
   ```markdown
   Ask before public API changes, new dependencies, database migrations,
   security configuration, or CI workflow changes.
   ```
4. **索引** —— 任务 → 文档的映射

### 不该包含的四类

架构详解 · API 参考 · 教程性说明 · **任何"某类任务才需要"的内容**

### 三种减重手段（不牺牲信息量）

1. **嵌套 `AGENTS.md`**（dify 模式）—— 把 app/package 专属规则下沉到子目录，根文件只留全局。GVRAY 应拆出 `apps/admin/AGENTS.md`、`apps/mall/AGENTS.md`、`packages/core/AGENTS.md`。
2. **下沉到 `.agents/` 知识库 + 索引**——正文搬走，只留一行链接。
3. **用 `@AGENTS.md` 让其他工具做指针**——而不是复制内容。

### 一条硬红线

**`AGENTS.md` 里所有路径必须真实存在。** 它是入口，索引一旦指向死链，效果比没有索引更差——AI 会顺着死链放弃检索，退化为凭记忆作答。（GVRAY 现在有 3 处死链，应优先修。）

---

## Q5 · 有"经验库"的优秀项目有哪些

先要区分两种"记忆"——它们的项目实践完全不同，混为一谈会找错参考。

### A · 状态型记忆（有成熟模式与真实采用）

**代表：Cline Memory Bank**（文档化程度最高、采用最广）

```
memory-bank/
├── projectbrief.md      基础文档：目标与范围（几乎不变）
├── productContext.md    为什么存在、解决什么问题
├── systemPatterns.md    架构、关键决策、设计模式
├── techContext.md       技术栈、环境、约束、依赖
├── activeContext.md     当前焦点、最近改动、下一步（变更最频繁）
└── progress.md          什么做完了、什么没做、已知问题
```

依赖图：`projectbrief` →（`productContext` / `systemPatterns` / `techContext`）→ `activeContext` → `progress`

**核心设计思想**：文件按 **稳定 → 易变** 排序。`projectbrief.md` 几乎不动，`activeContext.md` 高频更新。**把不同更新节奏的内容分开存放**——这一点比文件清单本身更值得学。

- 被谁读：Cline、Roo Code、Cursor（通过自定义指令）
- 真实采用：`ModusCreateOrg/app-med-ai-gen` 等公开仓库
- 官方明列的坑：`activeContext.md` 退化成人类 changelog；更新后文件之间互相矛盾；任务结束忘记 `update memory bank`
- 触发命令：`initialize memory bank` / `update memory bank` / `follow your custom instructions`

> **对 GVRAY 的判断**：Memory Bank 解决的是"agent 无状态、每次重建上下文"的问题。GVRAY 已有 `openspec/specs/` 承担"当前规格"、`.agents/project/` 承担"怎么做"，所以**不需要照搬六文件结构**，但可以借用它的"稳定→易变分层"思路。

### B · 教训型记忆（罕见，但价值最高）

**这一格在公开项目里几乎是空的。** 目前能找到的：

- **GVRAY 自己的 `hermes/`** —— `pitfalls/` 21 条「症状 → 根因 → 规避」+ 源码链接，就是一个相对完整的样本
- **Hermes Agent 的 `~/.hermes/memories/MEMORY.md`** —— 但那是 **agent 自维护的本地记忆、不提交仓库**，属于个人级而非团队级
- 多数项目只做到 `TROUBLESHOOTING.md` 或 `docs/faq.md`，且通常不按「症状 → 根因 → 规避」的结构化格式写

**也就是说：你现在在做的事，本身就有参考价值。**

### C · 找参考的首选入口

**`ItamarZand88/awesome-agent-conventions`** —— 专门收录 AI agent 约定的目录仓库，22 个分类：

```
agents-md · claude-md · skill-md · memory-bank · memory-md ·
spec-kit · mcp-config · ai-ignore-files · llms-txt · ai-txt ·
agent-rules · agent-cards · claude-commands · copilot-prompt-files ·
design-md · kiro-steering · auth-md · okf · pricing-md ·
prompt-assets · protocols-md · tool-specific-instructions
```

每条约定都带：**Read by（谁读）/ Location（放哪）/ Spec（规范来源）/ Evidence（采用证据）/ Last verified（最后核验日期）**，且样例文件是用脚本从公开仓库抽取的**真实内容**（非手写）。

> 这是本次研究里**最值得收藏的单一入口**。后续遇到"某个约定该放哪、有没有人在用"的问题，先查这里。

### 结论

| 想要什么 | 去看 |
| --- | --- |
| 状态型记忆的最佳实践 | Cline Memory Bank + `awesome-agent-conventions` 的 `memory-bank/` |
| 教训型记忆的实践 | 公开项目里几乎没有，**GVRAY 的 `hermes/pitfalls/` 已是较好样本** |
| 某个约定的规范定义与采用情况 | **`awesome-agent-conventions`** |
