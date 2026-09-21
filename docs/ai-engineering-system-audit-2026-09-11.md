# AI 工程化体系审计 — 2026-09-11

对仓库的 AI 工程化体系（入口 / 按需知识 / 规格 / 记忆 / 领域语言 / 探索 / 工具索引 / 门禁）做了一轮实测审计。所有结论均有可复现的命令证据，不依赖印象。

## 结论

**架构设计完备，执行完成度中等，防腐机制缺位。**

八层结构中只有规格层（OpenSpec）处于真正运转状态；其余各层普遍存在"文档漂移"与"索引过期"，且仓库没有任何机制能自动发现这类漂移（无 CI、无文档校验脚本）。

一句话：**架构是完备的，运转是半程的，防腐是缺位的。**

综合判定：**设计 A-，运转 B-，防腐 F** → 当前 **B-**。补齐 P0 三条 + 一个文档校验脚本即可到 A-。

## 评级矩阵

| 层 | 设计 | 现状 | 关键缺口 |
| --- | :--: | :--: | --- |
| 入口层 `AGENTS.md` | ★★★★★ | ★★★☆☆ | 含 1 条事实错误且与自身矛盾（P0-1） |
| 按需知识层 `.agents/project/` | ★★★★☆ | ★★☆☆☆ | 3 处死链 + 9 处迁移前旧路径（P0-2/P0-3） |
| 规格层 `openspec/` | ★★★★★ | ★★★★☆ | 10 主规格 / 20 归档 / CLI 可用；当前无活跃变更 |
| 记忆层 `hermes/` + `docs/adr/` | ★★★★★ | ★★★☆☆ | 索引漏 5 条 ADR；两个 pitfalls 入口并存 |
| 领域语言层 `CONTEXT.md` | ★★★★☆ | ★★★☆☆ | 内容扎实，3 处旧路径 |
| 探索层 `wayfinder/` | ★★★★☆ | ★★★☆☆ | 4 个 ticket 全 open，未转入规格层 |
| 本地索引/可视化 `.codegraph` `.ua` `.archify` | ★★★☆☆ | ★★☆☆☆ | 图与图谱描述的是单应用时代架构 |
| 门禁与 CI | ★★☆☆☆ | ★☆☆☆☆ | 无 CI、无文档校验，漂移永不被发现 |

## 实测发现

### P0-1 `AGENTS.md` 存在事实错误且自相矛盾

- **证据 A**：`AGENTS.md:55` 称「`prisma/schema.prisma` 使用 `relationMode = "prisma"`，无外键约束」。
- **证据 B**：同一文件 `AGENTS.md:7` 称「Prisma 6 + PostgreSQL（数据库原生外键约束）」。两处直接冲突。
- **实测**：`grep -rn "relationMode" prisma/schema.prisma` → **0 命中**。datasource 段仅有 `provider = "postgresql"` 与 `url = env("DATABASE_URL")`，未声明 `relationMode`，即采用 Prisma 对 PostgreSQL 的默认行为 `foreignKeys`。
- **实测**：`prisma/migrations/0_init/migration.sql` 含 **66 条 `FOREIGN KEY` 语句**，例如 `CONSTRAINT "users_departmentId_fkey" FOREIGN KEY`。
- **影响**：真实状态是**存在原生外键、删除受约束**；文档所述是**无外键、删除自由**，两者相反。而 `AGENTS.md` 是唯一自动加载的入口，每个 AI 会话都会继承这条错误假设，直接污染删表 / 迁移 / 级联删除的判断。**全仓毒性最高的一条。**

### P0-2 按需知识库索引指向 3 个不存在的文件

- **证据**：`.agents/project/README.md` 的「任务到文档映射」表引用 `../../UNIFIED_RESPONSE_GUIDE.md`、`../../CONFIGS_ANALYSIS.md`、`../../DOCKER_DEPLOYMENT.md`。
- **实测**：三个文件在仓库根目录均**不存在**（逐一验证）。
- **影响**：AI 按映射表取文档时命中死链，只能退化为凭训练记忆作答 —— 而这正是该层存在的意义。

### P0-3 按需知识库路径停留在 monorepo 迁移前

- **证据**：`.agents/project/` 下共 **9 处** `src/...` 路径：`architecture.md:15/17/37`、`coding.md:29/35`、`deployment.md:41/49/63`、`permissions.md:5/22`、`response-format.md:3`、`workflow.md:20`；`CONTEXT.md` 另 **3 处**。
- **实测真实位置**：`packages/core/src/shared/services/base.service.ts`、`packages/core/src/shared/constants/permissions.constant.ts`。
- **影响**：`architecture.md` 的 `src/shared/services`、`workflow.md` 的 `src/modules/`、`deployment.md` 的 `src/bootstrap/bootstrap.ts`、`workflow.md` 新增模块所依赖的 `SystemModule` 均已失效（现为 `packages/core/src/...` 与 `apps/admin/src/modules/system/`）。照文档操作会找不到文件或建错位置。

### P1-1 hermes 决策索引落后 5 条 ADR

- **证据**：`hermes/decisions/README.md:3` 自称「历史决策索引（ADR 0001–0009）」；`docs/adr/` 实际有 **14** 条。
- **缺口**：0010（monorepo 双应用）、0011（客户授权模型）、0012（微信静默登录）、0013（历史留存与快照策略）、0014（询价提交取消与状态加固）均未进索引表。
- **性质**：与 hermes 自身维护约定（「新增变更归档后回填到这里」）冲突 —— 最近 5 次变更的回填动作漏做了。

### P1-2 存在两个「踩坑记录」入口

- `.agents/project/pitfalls.md`（53 行，10 节：死代码删除 / 硬编码重复 / 投影漂移 / 归档前 …，偏**重构与审查**）
- `hermes/pitfalls/README.md`（42 行，21 条 P1–P21：Docker / 迁移 / 日志 / 认证，偏**运行时**）
- **问题**：hermes 维护约定明写「一条经验只写一处；发现重复先合并」，但两个入口并存且无交叉引用，使用者无法判断该查哪个。二者当前内容并不重复 —— 属**未合并的分裂**而非重复，但分裂本身违反了自己的收敛原则。

### P1-3 对外 AI 指南隐藏了四分之三的体系

- **证据**：`docs/ai-development.md`（根 README 中「AI Ready」卖点所指的文档）对 `openspec` / `hermes` / `wayfinder` / `ADR` 的提及次数**均为 0**；根 `README.md` 同样为 0。
- **影响**：规格驱动、经验库、探索定案、决策记录这四支柱对新加入的人和外部读者**完全不可见**，只能靠自行摸索。体系的"可发现性"与它的实际规模严重不匹配。

### P1-4 索引与架构图资产全部过期，过期方向正好是最大一次重构

- **`.archify/`**：5 组图产物（architecture / auth-flow / data-cache / logging / request-lifecycle）生成于 **2026-09-02~03**；全部 JSON 中 `packages/core` 与 `apps/admin` 出现次数**均为 0** → 图描述的是**单应用时代**架构。
- **`.ua/`**：知识图谱基线 commit `315c740`，落后当前 HEAD（`f260ed7`）**27 个提交**，且基线早于 9-09 的 monorepo 迁移。
- **`.codegraph/`**：相对新鲜（9-10 仍有增量同步记录），是本层唯一健康产物。
- **影响**：这两类资产恰恰是被 AI 当作"现成上下文"直接消费的。**过期索引比没有索引更危险** —— 它会给出高置信度的错误答案，且使用者难以察觉。

### P2-1 `docs/` 与 `.agents/project/` 三对同名文档双写

| 详版 | 摘要版 |
| --- | --- |
| `docs/deployment.md`（211 行） | `.agents/project/deployment.md`（64 行） |
| `docs/configs.md`（106 行） | `.agents/project/configs.md`（32 行） |
| `docs/response-format.md`（98 行） | `.agents/project/response-format.md`（27 行） |

这是 README 明示的**有意设计**（长文档留 `docs/`，短摘要给 AI），代价是每改一处需同步两地，且当前无任何机制保证同步。

### P2-2 `docs/` 部分文档早于 monorepo 迁移

- `features.md`（8-26）提及 `mall` 的次数为 **0**，而项目早已是双应用。
- `api-testing.md` / `configs.md` / `response-format.md` 同为 8-25~26，均早于 9-09 迁移。
- `project-structure.md`（9-09）与 `monorepo-migration-summary.md`（9-09）已更新，属健康。

### P2-3 探索层成果未转入规格层

- `wayfinder/map.md` `status: active`，4 个 ticket（t01–t04）`status` 全部为 `open`。
- 但 `openspec/changes/` 下**只有 `archive/`，无活跃变更**。
- 说明「mall 自助业务闭环」已完成定案，却尚未落成 OpenSpec change —— 流水线停在 explore，未进 propose。

### P2-4 多工具入口只配了一半

- **已确认事实**：`.trae/commands/opsx-*.md` 与 `.trae/skills/openspec-*/SKILL.md` 的 frontmatter 带 `author: openspec`、`generatedBy: "1.10.0"` —— 这批文件由 `openspec init --tools trae` 生成，非手写。
- **因此**：`.claude/skills/` 与 `.claude/skills-disabled/` 为空是**结果而非疏漏** —— 初始化时只勾了 `trae`，没勾 `claude` 等其他工具。
- **实际缺口**（按 AGENTS 标准核对各工具的规则文件）：

| 工具 | 读哪个文件 | 本项目状态 |
| --- | --- | --- |
| OpenAI Codex / Kilo Code | `AGENTS.md` | ✅ 原生可用，无需指针 |
| Claude Code | `CLAUDE.md` | ❌ **缺失** —— Claude 不自动读 AGENTS.md |
| GitHub Copilot | `.github/copilot-instructions.md` | ❌ 缺失 |
| Cursor | `.cursorrules`（或 `.cursor/rules`） | ❌ 缺失 |
| Windsurf / Devin | `.windsurfrules` | ❌ 缺失 |

- **注意**：`.claude/skills-disabled/` 是一个**空的禁用目录**，它不会产生任何效果，只会让人误以为 Claude Code 已配置。要么补全，要么删除。
- **修复方式**：补 `CLAUDE.md`（首行 `@AGENTS.md` 导入，而非复制内容）；若确要 Claude Code 的 OpenSpec 技能，重跑 `openspec init --tools trae,claude`。

### P2-5 无 CI、无文档防腐

- 仓库**无任何 CI 配置**（无 `.github/`、`.gitlab-ci.yml`、`Jenkinsfile` 等）。
- `scripts/` 中仅有 `check-menus.ts` / `check-permissions.ts` 两个**业务**一致性脚本，无文档死链 / 路径存在性校验。
- `eslint.config.mjs` 无 markdown 相关规则。
- **直接后果**：P0-2 / P0-3 / P1-1 这类漂移**永远不会被自动发现**。这也解释了为什么漂移能积累到"14 条 ADR 漏 5 条、3 处死链无人知"的程度。

## 亮点（同样经实测确认）

- **规格层是真在跑的，不是空架子**：`openspec/specs/` 10 个能力主规格；`changes/archive/` 20 个归档变更；CLI `1.10.0` 实测可用；归档命名 `YYYY-MM-DD-<change>` 一致。
- **入口分层原则正确**：`AGENTS.md` 只放硬规则 + 索引，没有退化成第二本长文档 —— 这是很多项目做反的地方。**但体量已偏大：4855 字符，是 halo（2058 字符）的 2.4 倍**，建议按「删除测试」裁剪到 2000 字符以内（详见 `ai-engineering-faq.md` Q4）。
- **hermes 有真实密度**：21 条踩坑均带「症状 → 根因 → 规避」+ 源码链接；7 个工程模式均带先例指向。
- **决策记录规范**：14 条 ADR 编号齐整；hermes 以「否决项 + 何时复活」的形式记录决策，能有效防止重复推翻。
- **领域词汇表有实质内容**：`CONTEXT.md` 的 `Customer / User` 边界、`Anonymous Visitor` 与 `guest` 角色的区分，是真正能防歧义的内容而非术语堆砌。
- **提交历史可回溯**：conventional commits + 中文描述执行到位；monorepo 迁移按步骤拆成 25+ 个提交，粒度健康。
- **自省机制在工作**：同日已有一轮代码层架构评审产出（见 `.workbuddy/memory/2026-09-11.md`），本审计属另一维度（文档与索引健康度）。

## 建议修复顺序

| 序 | 项 | 动作 | 理由 |
| :--: | --- | --- | --- |
| 1 | P0-1 | 修正 `AGENTS.md:55` 的 `relationMode` 表述，改为「使用 Prisma 默认 `foreignKeys`，DB 层已建原生外键约束」 | 唯一自动加载文件，收益最高、改动最小 |
| 2 | P0-2 / P0-3 | 修 `.agents/project/README.md` 3 处死链；全量把 `src/...` 改写为 `packages/core/src/...` / `apps/<app>/src/...` | 恢复按需层的可用性 |
| 3 | P1-4 | 重建 `.archify/` 与 `.ua/`；最低成本方案是先删除误导性产物，收敛到 `.codegraph/` 单一来源 | 消除高置信度错误上下文 |
| 4 | P1-1 / P1-2 | hermes/decisions 补 0010–0014；合并两处 pitfalls 或建立显式分工声明与交叉引用 | 恢复记忆层的收敛性 |
| 5 | P2-5 | 新增轻量 `check-docs.ts`（死链 + 路径存在性），挂 pre-commit 或最小 CI | 从根上终止静默腐烂 |
| 6 | P1-3 | `docs/ai-development.md` 补四支柱总览；根 README 同步 | 恢复体系可发现性 |
| 7 | P2-3 | 把 wayfinder 4 个 ticket 落成 OpenSpec change，或明确 wayfinder→propose 的交接规则 | 让定案成果可执行 |
| 8 | P2-1 / P2-2 / P2-4 | 更新 `features.md`、清理空目录、明确双写文档的同步责任 | 收尾 |

## 判定

"是否完善"取决于问哪一层：

- **问「能不能用」** —— **能**。`AGENTS.md` + `.agents/project/` + OpenSpec + hermes 四件套齐备，AI 接手项目有明确入口、有规格约束、有经验库兜底，明显超过绝大多数同类仓库。
- **问「能不能放心长期跑」** —— **不能**。缺防腐机制，文档与索引会持续腐烂，且腐烂是**静默**的。当前已积累：1 条高危事实错误、3 处死链、9 处失效路径、5 条漏索引 ADR、5 组描述旧架构的图。

结论：**体系设计 A-，运转 B-，防腐 F。补齐 P0 三条 + 一个文档校验脚本，即可到 A-。**
