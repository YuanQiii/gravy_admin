# AI 工程化参考项目研究

对 12 个候选项目做**文件级实测扫描**（GitHub Contents API 逐一核对根目录与关键目录），筛出可学习的对象，并对 3 个高价值项目做深度核对。所有结论均附证据。

- 研究时间：2026-09-11
- 扫描方式：`GET /repos/{owner}/{repo}/contents/` 核对 AI 工程化标志文件是否存在；重点项目拉取文件全文
- 配套阅读：[`ai-engineering-comparison-unibest.md`](ai-engineering-comparison-unibest.md)、[`ai-engineering-system-audit-2026-09-11.md`](ai-engineering-system-audit-2026-09-11.md)

---

## 1. 扫描结果总表

标志文件：`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.cursorrules` / `.cursor/` / `.agents/` / `hermes/` / `openspec/` / `.specify/` / `.husky/` / `.github/` / `.changeset/`

| 项目 | 命中的 AI 工程化条目 | 归类 |
| --- | --- | --- |
| **halo-dev/halo** | `AGENTS.md`、`CLAUDE.md`、**`openspec/`**、`docs/`、`.github/` | **AI 层 + CI 双全** |
| **langgenius/dify** | `AGENTS.md`、`CLAUDE.md`、**`.agents/`**、`docs/`、`.github/` | **AI 层 + CI 双全** |
| **github/spec-kit** | `AGENTS.md`、`.specify/`、`docs/`、`.github/` | **AI 层 + CI 双全** |
| bmad-code-org/BMAD-METHOD | `AGENTS.md`、`CLAUDE.md`、`docs/`、`.github/` | AI 层 + CI 双全 |
| openai/codex | `AGENTS.md`、`docs/`、`.github/` | AI 层 + CI 双全 |
| feige996/unibest | `AGENTS.md`、`.agents/`、`hermes/`、`.cursor/`、`.husky/`、`.changeset/`（**无 `.github/`**） | 有 AI 层 · 无 CI |
| **GVRAY（本项目）** | `AGENTS.md`、`.agents/`、`hermes/`、`openspec/`、`docs/adr/`（**无 `.github/`**） | 有 AI 层 · 无 CI |
| vbenjs/vue-vben-admin | `docs/`、`.github/`、`.changeset/` | 有 CI · 无 AI 层 |
| immich-app/immich | `docs/`、`.github/` | 有 CI · 无 AI 层 |
| YunaiV/ruoyi-vue-pro | `.github/` | 有 CI · 无 AI 层 |
| soybeanjs/soybean-admin | `docs/`、`.github/` | 有 CI · 无 AI 层 |
| honojs/hono | `docs/`、`.github/` | 有 CI · 无 AI 层 |

> **注**：上表只核实"文件是否存在"，不代表质量。但一个客观事实是：**AI 上下文层与 CI 门禁层在同一项目里同时具备的比例并不高** —— 12 个里只有 5 个，而其中 3 个是"方法论/AI 工具本身"类项目。

---

## 2. 首选对标：halo-dev/halo

**这是本次研究最有价值的发现**：halo 是一个成熟的 Java 企业级开源项目，**与 GVRAY 的规格层完全同构**（都用 OpenSpec），可以直接逐项对标。

### 2.1 它的 AI 工程化配置

**`AGENTS.md`（2058 字符）** —— 结构与 GVRAY 高度相似（模块表 / 快捷命令 / 跨模块规则），但多了一节**「需要先问的变更」**：

```markdown
- Ask before public API changes, new dependencies, database migrations,
  security configuration, or CI workflow changes.
- Never commit secrets or introduce blocking I/O into reactive flows.
- Stage specific files only; never `git add -A`
```

还明确写了**生成物禁手改**：

```markdown
- Keep API contracts, backend handlers, and UI usage in sync;
  never hand-edit `ui/packages/api-client/src/` — regenerate it after contract changes.
```

**`CLAUDE.md`（全文 11 个字符）**：

```markdown
@AGENTS.md
```

> 这是本研究中**唯一一个把"薄指针"做到极致**的项目 —— 一行导入指令，零重复内容。对比 unibest 的 `.cursor/rules/` 独立复述导致漂移，halo 的做法从物理上杜绝了副本。

**`openspec/config.yaml`（1452 字符，`context` 与 `rules` 都填实了）**：

```yaml
context: |
  Tech stack: ... (技术栈、架构原则、约定)
rules:
  proposal:
    - Evaluate impact on existing plugin/theme APIs for compatibility
    - Database schema changes must include a migration strategy
    - Security-related changes must assess auth/authorization impact
    - UI changes must consider i18n support
  tasks:
    - Backend changes must pass `./gradlew spotlessCheck`
    - Frontend changes must pass `pnpm lint` and `pnpm typecheck`
    - API changes require updating OpenAPI docs and regenerating api-client
    - New dependencies must be checked for license compatibility
```

而且它在注释里**明确划清了与 AGENTS.md 的分工**：

```yaml
# Shared context injected into ALL AI prompts.
# Keep concise: tech stack, conventions, and architectural principles.
# Broader coding standards and detailed guidelines go into AGENTS.md.
```

对比之下，**GVRAY 的 `openspec/config.yaml` 仍是空模板**（只有 `schema: spec-driven` 加注释），`context` 与 `rules` 都没填 —— 这意味着 OpenSpec 生成的产物拿不到任何项目特定约束。

### 2.2 它的三道 CI 闸门

halo 有三条 `.github/workflows/`，其中两条对 GVRAY 有直接借鉴价值：

**① `halo.yaml` —— 主 CI**

```yaml
on:
  pull_request: { branches: [main, release-*], paths: ["**", "!**.md"] }
  push: { branches: [main, release-*], paths: ["**", "!**.md"] }
concurrency:
  group: ${{github.workflow}} - ${{github.ref}}
  cancel-in-progress: true
jobs:
  test:
    steps:
      - run: ./gradlew clean check --configuration-cache
      - uses: codecov/codecov-action@v6
```

值得学的两个细节：`paths: ["**", "!**.md"]`（**纯文档改动不跑 CI**，省资源）；`concurrency` + `cancel-in-progress`（同一 PR 的旧运行自动取消）。

**② `openapi-check.yaml` —— 契约漂移检测（最值得抄的一条）**

```yaml
- name: Regenerate OpenAPI docs
  run: ./gradlew generateOpenApiDocs
- name: Regenerate api-client
  run: vp run api-client:gen
- name: Verify OpenAPI docs and api-client are in sync
  run: |
    if ! git diff --exit-code -- api-docs/openapi ui/packages/api-client/src; then
      echo "::error::OpenAPI docs or api-client generated code is out of sync..."
      exit 1
    fi
```

**这就是我在对照研究里说的"让漂移当场失败"的现成实现**：CI 重新生成一遍产物，如果和仓库里不一致就报错。

这条模式可以**直接平移到 GVRAY 的所有生成物**：Prisma migration 与 schema 是否一致、权限码 seed 与常量是否一致、文档索引指向的路径是否存在 —— 全部可以做成"重新生成 / 重新校验 → `git diff --exit-code`"。

### 2.3 与 GVRAY 的逐项对照

| 维度 | halo | GVRAY |
| --- | --- | --- |
| `AGENTS.md` | 2058 字符，含"需先问的变更"清单 | 4855 字符 |
| 多工具薄指针 | ✅ `CLAUDE.md` = `@AGENTS.md` | ❌ 无 |
| `openspec/config.yaml` | ✅ `context` + `rules` 填实 | ❌ 空模板 |
| openspec 规模 | 21 个能力规格 + archive | 10 个能力规格 + 20 归档 |
| 契约漂移 CI | ✅ `openapi-check.yaml` | ❌ 无 |
| 主 CI | ✅ `gradlew clean check` + Codecov | ❌ 无 |
| 格式门禁 | ✅ Spotless（`spotlessCheck`） | ⚠️ ESLint/Prettier 但无钩子 |
| 架构决策记录 | ❌ 无 | ✅ **14 条 ADR** |
| 经验 / 踩坑沉淀 | ❌ 无 | ✅ **hermes 三库** |

**结论**：两边的**规格层同构**，差别集中在**门禁层** —— halo 有三道 CI，GVRAY 一道都没有；但在**决策记录与经验沉淀上 GVRAY 反超 halo**。

**也就是说：GVRAY 缺的不是"另一个体系"，而只是 halo 那三道闸门中的两条。** 这是本次研究最直接的行动结论。

---

## 3. langgenius/dify —— 嵌套 AGENTS.md 与项目级流程 skill

dify 是一个大型 monorepo（`api/`、`web/`、`docker/`、`dify-agent/`、`cli/`、`e2e/`），它的 AGENTS.md 只有 **927 字符**，且提出了一条 GVRAY 可以直接采用的原则：

```markdown
Follow the nearest scoped `AGENTS.md` for the files being changed.
Apply its guidance within the user's requested scope;
explicit user instructions take precedence over workflow defaults.
```

**这就是 monorepo 的嵌套 AGENTS.md 模式** —— 根 AGENTS.md 给全局，子目录各有自己的 AGENTS.md，就近优先。halo 的 AGENTS.md 也呼应了这个思路（"load **every relevant module guide** for the areas you touch"）。

> **对 GVRAY 的直接启示**：GVRAY 是 monorepo（`apps/admin`、`apps/mall`、`packages/core`、`packages/domain`），却只有**一个根 AGENTS.md（4855 字符）**。按 dify/halo 的模式，应该拆成：根 AGENTS.md 保留全局硬规则，`apps/admin/AGENTS.md` 写后台端专属约定（RBAC/JwtAuthGuard/权限码），`apps/mall/AGENTS.md` 写商城端约定（CustomerJwtGuard/匿名浏览），`packages/core/AGENTS.md` 写内核约定（深模块/薄适配器）。**这同时也是给根 AGENTS.md 减重的手段。**

**它的 `.agents/skills/`** 有 5 个 skill，全是**项目自己的流程能力**，不是第三方库文档：

```
.agents/skills/
├── backend-code-review       后端代码评审流程
├── frontend-code-review      前端代码评审流程
├── frontend-testing          前端测试流程
├── e2e-cucumber-playwright   E2E 测试流程
└── how-to-write-component    组件编写规范
```

> 这是一个比 unibest 更成熟的 skill 用法：unibest 的 skill 是"查文档"（uni-app/uView 的 API 参考），dify 的 skill 是"**执行本项目特有的流程**"（怎么评审、怎么测试、怎么写组件）。后者才是 skill 真正不可替代的价值 —— 因为这些知识在公开文档里查不到。

---

## 4. github/spec-kit —— 规格驱动方法论的工具化

GitHub 官方项目，把 Spec-Driven Development 做成可安装的工具链（`.specify/`）。

它的核心概念是 **`.specify/memory/constitution.md`** —— 一份**项目宪法**，位于所有规格之上，定义项目不可违背的原则。

> **对 GVRAY 的启示**：GVRAY 目前把"硬规则"写在 `AGENTS.md` 里（面向 AI 的入口文件）。constitution 的思路是**把原则与入口分离**：入口文件可能被重构、被拆分（如上面说的嵌套 AGENTS.md），但"宪法"应当稳定且单一。这是一个可选增强，不是必需项 —— `AGENTS.md` 的硬规则节已经承担了大部分职责。

它的 `AGENTS.md` 有 31KB（本项目是工具仓库，需要写清如何新增 AI 工具集成，所以偏大，不具代表性）。

---

## 5. 其余值得关注的项目

| 项目 | 值得看什么 | 备注 |
| --- | --- | --- |
| bmad-code-org/BMAD-METHOD | 多角色 agent 协作的敏捷方法论（AGENTS.md + CLAUDE.md） | 方法论类，不是工程模板 |
| openai/codex | `AGENTS.md` 标准的起源项目之一 | 对照标准演进 |
| vbenjs/vue-vben-admin | 有 `.changeset/` + 完整 `.github/`，Vue 企业级脚手架的工程化标杆 | **无 AI 层**，可作为"补 AI 层"的练习对象 |
| immich-app/immich | 有 `.github/`，测试与发布工程化成熟 | **无 AI 层** |
| YunaiV/ruoyi-vue-pro | 国内最流行的后台脚手架之一 | **只有 `.github/`，无 AI 层** |

> **一个有意义的观察**：`vbenjs/vue-vben-admin`、`immich-app/immich`、`YunaiV/ruoyi-vue-pro`、`soybeanjs/soybean-admin`、`honojs/hono` 这 5 个项目**工程化都很扎实但完全没有 AI 上下文层**。反过来，unibest 和 GVRAY **有 AI 层但没有 CI**。这说明"AI 工程化"目前还是一件**少数派在做、且容易做偏**的事 —— 大多数团队要么只做了传统工程化，要么只在 AI 层做了"写文档"。

---

## 6. 对 GVRAY 的行动结论

按性价比排序，且全部来自上述真实项目的现成做法：

| 序 | 动作 | 直接来源 |
| :--: | --- | --- |
| 1 | 建主 CI：`lint → typecheck → test → build`，加 `paths: ["**","!**.md"]` 与 `concurrency.cancel-in-progress` | halo `halo.yaml` |
| 2 | 建 `CLAUDE.md`，内容就一行 `@AGENTS.md` | halo `CLAUDE.md` |
| 3 | 填实 `openspec/config.yaml` 的 `context` 与 `rules`（GVRAY 现在是空模板） | halo `openspec/config.yaml` |
| 4 | 把"生成物漂移检测"做成 CI：Prisma migration↔schema、权限码↔常量、文档索引↔实际路径 | halo `openapi-check.yaml` |
| 5 | 拆嵌套 `AGENTS.md`：根保留全局，`apps/admin`、`apps/mall`、`packages/core` 各一份 | dify AGENTS.md 原则 |
| 6 | 把 `.agents/skills/` 建起来，但装**项目自己的流程**（代码评审、测试、新增模块 SOP），不要装第三方库文档 | dify `.agents/skills/` |
| 7 | （可选）把 AGENTS.md 的硬规则提升为 `constitution` 式的单点 | spec-kit `.specify/memory/` |

**一句话**：GVRAY 的规格层（openspec：10 能力规格 + 20 归档）和 halo（21 能力规格 + archive）**已经处在同一水平**，决策记录（14 条 ADR）和经验库（hermes 三库）甚至超出 halo。**缺的只是把已有的规则接上 CI** —— 而这件事有现成的实现可以直接抄。
