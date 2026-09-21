# 对照研究：unibest 与 GVRAY 的 AI 工程化体系

对 `feige996/unibest` 的 `base` 分支（818 个文件）与 GVRAY 逐项实测对照。所有结论均附可复现证据，不依赖印象。

- 研究时间：2026-09-11
- 研究方式：GitHub API 拉取 `base` 分支完整文件树 + 关键文件全文（`AGENTS.md`、`.agents/README.md`、`hermes/README.md`、`.cursor/rules/*.mdc` ×3、`package.json`）
- 配套阅读：[`ai-engineering-playbook.md`](ai-engineering-playbook.md)、[`ai-engineering-system-audit-2026-09-11.md`](ai-engineering-system-audit-2026-09-11.md)

---

## 1. 两套体系的结构总览

### unibest（uni-app + Vue3 + TS 前端框架模板）

```
AGENTS.md                     1.7KB，薄入口：项目概览 + 规范索引表 + 三条铁律摘要 + Skills 索引 + 合入门禁命令
├── hermes/                   工程规范事实源（7 篇按场景）
│   ├── README.md             三条铁律 + 文档索引 + 常用命令
│   ├── architecture.md       事实源与生成物、平台接缝、校验边界、目录分层
│   ├── conventions.md        命名、SFC 结构、TS、状态、提交、合入门禁
│   ├── platforms.md          平台差异决策树、条件编译速查、差异点表
│   ├── api.md                请求分层、错误四分类、401 双 token 策略
│   ├── sop-new-page.md       新页面/组件/分包/tabbar/hooks SOP
│   ├── performance.md        分包规则、包体积检查
│   └── release.md            upload:mp、changesets、uvm、环境切换
├── .agents/
│   ├── README.md             按需导入速查表 + 导入规则 4 条 + 区分易混淆项
│   ├── skills/               16 个 skill（uni-app / uniapp-project / uview-pro-vue3 …）
│   └── bak-skills/           停用备选 skill 归档
├── .cursor/rules/*.mdc       3 个 Cursor 专属规则
└── .husky/                   commit-msg + pre-commit
```

### GVRAY（NestJS 后端 Monorepo）

```
AGENTS.md                     4855 字符 入口：项目概况 + 关键目录 + 硬规则 + 按需索引 + 命令
├── .agents/project/          按需知识库（10 篇，按主题）
├── hermes/                   经验库（三库）
│   ├── pitfalls/             21 条踩坑（症状 → 根因 → 规避）
│   ├── decisions/            ADR 索引 + 变更决策摘要
│   └── patterns/             7 个工程模式
├── openspec/                 10 个能力主规格 + 20 个归档变更
└── docs/adr/                 14 条架构决策记录
```

**一句话概括差异**：unibest 是**规范传递型**（把工程规范结构化喂给 AI），GVRAY 是**过程留痕型**（把规格、决策、经验沉淀成可追溯资产）。两者互补性极强。

---

## 2. 能力矩阵（逐项实测）

| 能力域 | unibest | GVRAY | 证据 |
| --- | --- | --- | --- |
| 工具入口 `AGENTS.md` | ✅ 1.7KB | ✅ 4855 字符 | 两边都有，但 GVRAY 是 halo 的 2.4 倍 |
| 各 IDE 工具适配 | ✅ `.cursor/rules/*.mdc` ×3 | ❌ 仅 AGENTS.md | GVRAY 缺 `CLAUDE.md` / `.cursorrules` / `copilot-instructions.md` |
| 规范事实源 | ✅ `hermes/` 7 篇 | ✅ `.agents/project/` 10 篇 | 定位相同、目录名不同 |
| 技能按需加载 | ✅ `.agents/skills/` 16 个 + 速查表 | ❌ `.claude/skills/` 空 | `find .claude -type f` = 0 |
| 提交钩子 | ✅ `husky` + `commitlint` + `lint-staged` | ❌ 无 | unibest 有 `.husky/commit-msg`、`.husky/pre-commit`；GVRAY deps 中三者均为 0 |
| 包管理器锁定 | ✅ `preinstall: npx only-allow pnpm` | ❌ 无 | — |
| 类型检查门禁 | ✅ `type-check: vue-tsc --noEmit` | ⚠️ 有 tsc 但无 CI 执行 | — |
| 测试 | ✅ `vitest` + `test:run` | ⚠️ jest 4 项目，**无 coverageThreshold** | — |
| 版本与 changelog | ✅ `changesets` + `upload:changeset` | ❌ 无 | unibest 有 `.changeset/config.json` |
| 契约代码生成 | ✅ `openapi-ts-request` 生成请求代码 | ⚠️ Swagger 仅产出文档 | unibest 有 `openapi-ts-request.config.ts` |
| 规格驱动 + 归档 | ❌ 无 | ✅ openspec 10 主规格 + 20 归档 | — |
| 架构决策记录 | ❌ 无 | ✅ ADR 14 条 | — |
| 经验/踩坑沉淀 | ❌ 无 | ✅ hermes 三库 | — |
| **CI 服务端门禁** | ❌ **无 `.github/`** | ❌ **无 `.github/`** | 两边都缺（见 §5.1） |

---

## 3. 核心发现：`hermes/` 同名异用

这是本次对照最有价值的发现。

**命名理由几乎完全一致**：

- unibest `hermes/README.md`：「Hermes = 项目的信使：把工程规范传递给每一位开发者（和 AI）」
- GVRAY `hermes/README.md`：「命名：Hermes 是信使之神——这里存放让后续工作不再"重新踩坑"的信使型内容」

两处都援引"信使之神"的同一套说辞，且都作为 AI 知识的载体目录。**这不像巧合，更像同一个约定来源被两个项目各自继承。**

**但内部语义完全不同**：

| | unibest `hermes/` | GVRAY `hermes/` |
| --- | --- | --- |
| 定位 | **工程规范事实源**（当前形态） | **经验教训库**（历史沉淀） |
| 结构 | architecture / conventions / platforms / api / sop-new-page / performance / release | pitfalls / decisions / patterns |
| 面向 | 怎么写才对 | 别踩什么坑 / 为什么这么定 |
| 更新时机 | 规范变化时 | 变更归档后回填 |

**还有第三重含义**：`openspec init --tools` 的工具列表里也有 `hermes` —— 那指的是 **Hermes Agent**（Nous Research 于 2026 年 2 月发布的开源 agent 框架，其上下文文件优先级为 `.hermes.md` → `AGENTS.override.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`）。这与"项目里的 `hermes/` 目录"是两回事。

**结论**：`hermes` 这个词目前同时指三样东西（unibest 的规范目录 / GVRAY 的经验目录 / Hermes Agent 这个工具）。**这恰恰是 `CONTEXT.md` 该管却没人管的事** —— 当一个词承载三种语义，跨项目协作和 AI 理解都会出错。

**建议**：保留 `hermes/` 这个名字（两边都用了，改名成本高），但在 `CONTEXT.md` 里明确写下本地含义；如果要合并两边的定位，建议 `hermes/` 只留一个定位，另一个改用更直白的名字（如 `docs/spec/` 或 `.agents/memory/`）。

---

## 4. unibest 值得借鉴的三件事

### 4.1 门禁真的建起来了（这是它最大的优势）

```jsonc
// package.json 节选
"prepare": "pnpm init-husky & pnpm init-baseFiles",   // 装 husky 自动化
"preinstall": "npx only-allow pnpm",                   // 锁包管理器
"type-check": "vue-tsc --noEmit",
"lint": "eslint",
"test": "vitest",
"test:run": "vitest run",
"upload:changeset": "pnpm changeset && pnpm changeset version"
```

依赖中齐全：`husky`、`@commitlint/cli`、`@commitlint/config-conventional`、`lint-staged`、`@changesets/cli`、`vitest`、`vue-tsc`。

更关键的是 **`AGENTS.md` 里把门禁写成了一条可执行命令**：

```bash
# 合入前门禁(三条全过)
pnpm type-check && pnpm lint && pnpm test:run
```

**这比 GVRAY 的"约定用 conventional commits"强一个量级** —— 前者是机器执行，后者是自觉遵守。GVRAY 的 `husky` / `commitlint` / `lint-staged` 依赖数均为 **0**。

### 4.2 `.agents/` 的「按需导入速查表」

unibest 的 `.agents/README.md` 是一份**可直接执行的检索表**：

- 16 行「任务场景 → skill → 路径」映射
- **导入规则 4 条**：① 先匹配场景再导入，不预加载整个目录 ② 一个任务可能命中多个 skill ③ 定义了优先级 ④ skill 内部同样按需加载（`SKILL.md` 只是指引，references/examples 按当前问题再读）
- 单列一节「**区分易混淆项**」（如 `uniapp-uview` vs `uview-pro-vue3` vs `uniappx-uview-pro`）

**这解决了 AI 上下文膨胀的核心矛盾**：知识不是越全越好，而是要"能按需精确取用"。GVRAY 的 `.agents/project/README.md` 有类似的映射表，但只有 8 行且无导入规则；skill 层则是空的。

### 4.3 契约驱动：从 OpenAPI 生成请求代码

`"openapi": "openapi-ts"` + `openapi-ts-request.config.ts`。

这不只是"有文档"，而是**契约作为唯一真源反向生成客户端代码** —— 契约变了，代码必须跟着变，不会漂移。GVRAY 有完整的 Swagger，但只产出文档，前端（Mall 端）请求层仍需手写，**契约与实现之间没有强制同步机制**。

---

## 5. 两边共犯的同一类错误

这是本次对照最值得警惕的部分：**两个项目在两件关键事情上犯了同一类错误。**

### 5.1 都缺 CI —— 门禁是可绕过的

| | unibest | GVRAY |
| --- | --- | --- |
| 本地钩子 | ✅ husky + commitlint + lint-staged | ❌ 无 |
| 服务端 CI | ❌ 无 `.github/` | ❌ 无 `.github/` |

unibest 的门禁强在"本地有钩子"，但 `git commit --no-verify` 一条命令就能绕过；同时**没有任何机制在合并前跑全量 type-check + lint + test**。GVRAY 则连本地钩子都没有。

结论：**两边的"门禁"都停留在"约定 + 本地提示"层面，没有服务端强制。** 这正是我在 `ai-engineering-playbook.md` 里强调"门禁必须是唯一不可省的一步"的原因 —— 连一个有门禁意识的成熟模板项目都会漏掉 CI 这一环。

### 5.2 都声明"唯一事实源"，却并存已经漂移的副本

**unibest 的证据**：`AGENTS.md` 第 7 行明确写「详细规范**唯一事实源**在 `hermes/`」，但 `.cursor/rules/` 下独立复述了同样的内容，而且已经漂移成泛化文本：

| `hermes/api.md`（自称事实源） | `.cursor/rules/api-http-patterns.mdc`（副本） |
| --- | --- |
| 请求层**分层**、`httpGet/Post` 用法、**错误四分类**、**401 双 token 策略** | 「可以使用简单 http 或者 alova 或者 @tanstack/vue-query」—— 三个方案并列，不构成决策 |

| `hermes/conventions.md` | `.cursor/rules/development-workflow.mdc` |
| --- | --- |
| 命名、SFC 结构、TS、状态、提交、验证命令 | 「推荐使用 VSCode 编辑器」「使用 console.log 和 uni.showToast 调试」—— 通用填充 |

另外 `development-workflow.mdc` 的 frontmatter 位于**文件末尾**（`--- description: ... ---` 写在正文之后），不符合 `.mdc` 格式要求，很可能不会被解析为规则元数据。

**GVRAY 的证据**（见审计报告）：`AGENTS.md` 声明是唯一入口只放索引，但 `.agents/project/` 与 `docs/` 存在三对同名文档双写（`deployment.md` 211↔64 行、`configs.md` 106↔32 行、`response-format.md` 98↔27 行），并已漂移出 **3 处死链 + 9 处迁移前旧路径**。

**共同的病根**：**"事实源"是被声明出来的，不是被机制保证的。** 一旦存在第二份副本，无论声明多少次"唯一"，它都会漂移——因为没有任何东西会阻止它。

**唯一有效的解法**是让副本在物理上不可能独立存在：
- 用软链（`ln -s`）代替复制
- 用导入指令（Claude Code 的 `@AGENTS.md`）代替复制
- 用工具自带的生成命令（`openspec init`）代替手写
- 把死链/路径校验放进 CI，让漂移**当场失败**

---

## 6. 合并两家长处后的目标结构

| 层 | 采用谁的方案 | 理由 |
| --- | --- | --- |
| 入口 `AGENTS.md` | **unibest 的薄**（1.7KB 级） | GVRAY 4855 字符已偏厚，是 halo 的 2.4 倍 |
| 规范事实源 | **unibest 的 `hermes/` 场景切分**（架构/约定/平台/请求/SOP/性能/发布） | 按"要做什么事"切，比按"主题"切更贴近取用场景 |
| 经验沉淀 | **GVRAY 的 `hermes/` 三库** | unibest 完全没有，这是 GVRAY 的独有资产 |
| 工具适配 | **unibest 的 `.cursor/rules/`** + 补齐 `CLAUDE.md` | 但必须改成软链/导入，**禁止复制内容** |
| 技能按需加载 | **unibest 的 `.agents/skills/` + 速查表 + 导入规则** | GVRAY 该层为空 |
| 提交与版本门禁 | **unibest 的 husky/commitlint/lint-staged/changesets/only-allow** | GVRAY 缺 |
| 契约代码生成 | **unibest 的 openapi-ts-request** | GVRAY 只有文档无生成 |
| 规格驱动 | **GVRAY 的 openspec** | unibest 没有 |
| 决策记录 | **GVRAY 的 ADR** | unibest 没有 |
| **CI** | **两边都没有 —— 必须自己补** | 见 §5.1 |

> **目录名冲突的处置**：两边 `hermes/` 语义不同，合并时**必须二选一或改名**。建议保留 `hermes/` 给"经验沉淀"（GVRAY 语义，因为它的三库结构更成体系），把 unibest 式的"工程规范"改名为 `docs/spec/` 或 `.agents/spec/`。无论怎么选，都要在 `CONTEXT.md` 里写清本地定义。

---

## 7. 结论

**这两个项目不是竞争关系，是互补关系。** unibest 强在"把规范结构化地喂给 AI，并且真的建了本地门禁"；GVRAY 强在"把过程和决策留痕，形成可追溯的规格与经验资产"。任何一边单独看都不完整。

**但它们在同一个地方一起失守**：都以为把规则写进文档、把钩子装到本地，体系就成立了。实际上：

1. **没有 CI，门禁就是建议。** unibest 装了完整钩子仍可 `--no-verify` 绕过；GVRAY 连钩子都没有。
2. **没有物理约束，唯一事实源就会长出副本并漂移。** 两边都声明了"唯一事实源"，两边都已有漂移证据。

**一句话**：这两套体系都把力气花在了"让 AI 知道该怎么做"，而在"保证 AI 不偏离"这一侧投入不足。而后者才是 AI 工程化的价值所在 —— 因为 AI 的最大风险不是"不知道"，而是"知道了但没被拦住"。
