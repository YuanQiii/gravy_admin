# constraint-docs Specification

## Purpose
定义 GVRAY 仓库约束文档体系的可验证契约：每类知识只有唯一家、路由表只有一处、按读者的触发条件分轴取用、规模有上限、且"文档没有腐烂"由机器检查而非靠自觉。

## Requirements

### Requirement: 单一事实源与单一路由表

每类知识（术语 / 硬规则 / 机制步骤 / 事实 / 决策 / 状态 / 经验 / 过程）SHALL 在仓库内有且只有一个家。路由表（"什么任务先读哪篇"）SHALL 只在根 `AGENTS.md` 的「按需阅读与同步更新」维护一处，且 SHALL 同时承载读方向（先读哪篇）与写方向（改完同步哪篇）两列。语料目录 SHALL NOT 包含 `README.md` 索引。语料文档 SHALL NOT 复述根文件已写的规则，只 SHALL 写该规则的机制 / 字段 / 步骤。

#### Scenario: 语料目录出现索引文件

- **WHEN** `.agents/project/README.md` 被创建或恢复
- **THEN** `pnpm docs:check` 以非零退出码报出"语料目录不得有索引"违规，并在输出中给出该文件路径

#### Scenario: 新增语料篇未登记路由

- **WHEN** 在 `.agents/project/` 下新增一篇场景文档
- **THEN** 该文档在根文件的「按需阅读与同步更新」表中有一行触发条件（左列写"什么任务时读它"），并且该行同时给出完成后要同步更新的文档

#### Scenario: 语料复述根文件规则

- **WHEN** 某一规则已被根文件以一句话写明，而语料文档又整段重复同一规则
- **THEN** 视为重复且必然漂移，SHALL 删除语料中的复述、只保留该规则的机制/字段/步骤（本仓实证：`.agents/project/architecture.md` 曾长期保留一条已被 `AccessGuard` 取代的守卫写法，而根文件同日已订正）

### Requirement: 每层载体的切分轴单一

仓库 SHALL 为三层文档载体各指定唯一且互不相同的切分轴：语料目录 SHALL 按**改动类型**切分；目录级 `AGENTS.md` SHALL 按**代码形态（位置）**切分且只写相对根文件的 delta；`docs/` SHALL 按**读者需求**（tutorial / how-to / reference / explanation 四象限）组织。语料目录 SHALL NOT 按代码区域切分（那会与目录级 `AGENTS.md` 重复）。

#### Scenario: 语料篇写不出触发条件

- **WHEN** 某篇语料文档无法用一句话写出"什么任务时读它"
- **THEN** 该篇 SHALL 被并入其他语料篇或上移到根文件，而不是继续留在语料目录

#### Scenario: 包级 AGENTS.md 复述根文件

- **WHEN** `apps/*/AGENTS.md` 或 `packages/*/AGENTS.md` 中出现与根 `AGENTS.md` 相同的规则句
- **THEN** 视为违规：包级文件 SHALL 只写"在本包内额外……"的差异，以及本包对全局规则的显式例外

#### Scenario: docs 顶层按四象限分组

- **WHEN** 读取 `docs/README.md` 索引
- **THEN** 每篇 `docs/` 文档被归入 tutorial / how-to / reference / explanation 之一，且 ADR 与经验层归 explanation

### Requirement: 约束文档规模红线

仓库 SHALL 对常读文档设定规模上限并在根文件写明：常读核心（根 `AGENTS.md` + `CONTEXT.md` + 语料目录 + `docs/experience/` + `README.md` + 各包级 `AGENTS.md`）总量 SHALL NOT 超过 1200 行；单篇语料 SHALL NOT 超过 100 行；根 `AGENTS.md` SHALL NOT 超过 200 行；包级 `AGENTS.md` SHALL 控制在 20–80 行。

> 下限取 20 而非 30：实施时实测三个包的真实增量是 23–33 行，撑到 30 行以上只能靠复述根文件。**内容驱动的下限优于预估的数字**——这也意味着该数字应随实测调整，而不是反过来让内容去凑数字。

#### Scenario: 根文件超出上限

- **WHEN** 根 `AGENTS.md` 行数超过 200
- **THEN** SHALL 优先把"只有某类任务才用"的段落下沉到语料目录或目录级 `AGENTS.md`，而不是继续在根文件追加

#### Scenario: 单篇语料超出上限

- **WHEN** 某篇语料行数超过 100
- **THEN** SHALL 按该篇内部的读时机拆分，或把不随任务变化的部分下沉到目录级 `AGENTS.md`

#### Scenario: 规模红线本身有处可查

- **WHEN** 任何 agent 或人只读根 `AGENTS.md`
- **THEN** 能在「验证与收尾」节读到上述四条红线及当前实测值

### Requirement: 不在阅读路径的内容须显式标注

`openspec/changes/archive/`、`reports/`、`dist/`、`openapi/`、`logs/` SHALL 被显式标注为"不在阅读路径"（提供追溯，不作为阅读材料）。路由表 SHALL NOT 指向这些位置。

#### Scenario: 归档目录不被当作文档

- **WHEN** 检查根文件的「按需阅读与同步更新」表
- **THEN** 表中没有任何一行指向 `openspec/changes/archive/`，且 `openspec/` 一行的说明限于"已定稿规格在 `specs/`，改行为契约前先读"

### Requirement: 文档自检的覆盖范围与检查项

仓库 SHALL 提供一个零依赖的文档自检命令 `pnpm docs:check`，检查四类会静默腐烂的问题：① 相对链接可达（按被检文件自身目录解析，而非仓库根）；② 文档中提到的命令真实存在（与 `package.json` 的 scripts 及包级 `bin` 对齐，且区分命令与散文短语）；③ 无指向根文件的 `§` 章节号指针；④ 语料目录不含 `README.md` 索引。检查范围 SHALL 覆盖：根文件 + 语料目录（递归）+ 仓库内任何目录级 `AGENTS.md` + `docs/`、`docs/experience/`、`wayfinder/`。

#### Scenario: 死链被拦截

- **WHEN** 任一被检文件中的相对链接指向不存在的位置
- **THEN** 自检以非零退出码报出该文件与该链接目标

#### Scenario: 故意违规探针可拦住

- **WHEN** 在被检范围内放入一个故意违反上述任一类规则的文件
- **THEN** 自检报错并以非零退出码结束

#### Scenario: 不误报

- **WHEN** 文本中出现指向**其他**文档的章节号（如 `playbook §4`）、散文中的动词短语（如 `make sure`）、代码围栏内的模板占位（如 `[<路径>](<路径>)`）、以及脚本通配形态（如 `npm run test:*`）
- **THEN** 自检保持静默，不产生任何发现

### Requirement: CI 强制等级与棘轮

CI SHALL 在 PR 与 push 到主分支时运行并**阻塞**以下三项：`docs:check`、四个 workspace 的类型检查（`tsc -p <workspace>/tsconfig.json --noEmit`）、单元测试。格式与 lint SHALL 采用棘轮策略：只对本次改动涉及的文件检查，SHALL NOT 要求既有基线全绿。纯文档改动 SHALL NOT 触发重型任务。CI SHALL 支持手动触发，且同一 PR 的旧运行 SHALL 被自动取消。

#### Scenario: 不合规文档被阻塞

- **WHEN** 提交中 `pnpm docs:check` 返回非零退出码
- **THEN** CI 该次运行失败，合入被阻塞

#### Scenario: 类型检查被阻塞

- **WHEN** 任一 workspace 的类型检查报出错误
- **THEN** CI 该次运行失败（本仓四个 workspace 当前均为 0 错误，属硬门禁而非棘轮）

#### Scenario: 纯文档改动不跑重活

- **WHEN** 一次提交只改动 `.md` 文件
- **THEN** 测试与类型检查任务不执行，仅文档相关检查执行

#### Scenario: 只检查改动文件的格式与 lint

- **WHEN** 一次提交改动了若干 `.ts` 文件，其中部分不符合格式规则
- **THEN** CI 仅对本次改动的文件报错；未被本次改动触及的既有违规不导致失败（既有基线：格式 212 文件、lint 1718 条）

### Requirement: 指令文件的所有权与修改方式

根 `AGENTS.md`、仓库内所有目录级 `AGENTS.md`、`.agents/`、`docs/adr/`、`docs/experience/` SHALL 在 `.github/CODEOWNERS` 中声明负责人。这些文件的修改 SHALL 经 PR 评审，SHALL NOT 由直接推送完成。

#### Scenario: 指令文件改动触发负责人评审

- **WHEN** 有人提交改动根 `AGENTS.md` 的 PR
- **THEN** 该 PR 因 `CODEOWNERS` 规则需要指定负责人审阅后方可合入

### Requirement: 状态描述的唯一家与强制状态标注

已知缺陷与待人工确认项 SHALL 只写在根 `AGENTS.md` 的「已知缺陷与待确认」一节，每条 SHALL 附复核方式（可执行命令或可检查路径）；修复后 SHALL 从该节移除。`CONTEXT.md` 作为领域词典 SHALL NOT 记录状态或实现细节。未被机器强制的规则 SHALL 在根文件显式标注"未机器强制"；声称由机器强制的规则 SHALL 有实测触发证据（用故意违规的探针验证过）。

#### Scenario: 新增一条已知缺陷

- **WHEN** 发现一处尚未定性的缺陷并写入根文件
- **THEN** 该条同时带"复核方式"一行，使读者可自行验证结论是否仍成立

#### Scenario: 依赖方向守卫的强制状态

- **WHEN** 规则声明"禁止 `@gvray/*/src` 深路径、packages 不得 import apps"由机器强制
- **THEN** 该声明有探针实测证据（在 `apps/` 与 `packages/` 各放一个违规文件，eslint 报 `no-restricted-imports`），且该规则确实在 lint 的执行范围内

#### Scenario: 无机器强制的规则被标注

- **WHEN** 某条规则只有约定而无 lint 或自检拦截（如"不暴露自增 `id`""权限码不硬编码"）
- **THEN** 根文件中该条显式标注"未机器强制"，使读者不会误以为有护栏

### Requirement: 经验层的内容类型与条目退休

`docs/experience/` SHALL 只收纳"过去时"的经验（踩坑 `pitfalls/` 与可复用模式 `patterns/`）。决策 SHALL 归 `docs/adr/`，当前状态 SHALL 归根文件的「已知缺陷与待确认」，规格 SHALL 归 `openspec/specs/`，SHALL NOT 复制进经验层。条目所描述的问题一旦被机制（配置 / lint / 测试 / 生成物）覆盖，该条目 SHALL 退休（删除并在原处记一行"已由 X 取代"）。

#### Scenario: 一条经验可以落机制

- **WHEN** 新踩的坑违反后能被机器查出（如行尾、格式、依赖方向）
- **THEN** 该约束落在配置或 lint 规则上，不写入经验层；已有条目在机制落地后退休

#### Scenario: 同一经验只写一处

- **WHEN** 同一条经验在经验层与语料目录都被记录
- **THEN** 保留一处、另一处删除或改为指针（本仓实证：`hermes/pitfalls` 与 `.agents/project/pitfalls.md` 曾两处都记"权限缓存失效覆盖不全"）

### Requirement: 仓库根级人向文件的最小集

仓库根 SHALL 提供四类人向文件：`README.md`（门面与快速开始）、`LICENSE`、`CONTRIBUTING.md`（贡献与本地验证流程）、`SECURITY.md`（漏洞上报渠道与已入库敏感文件的现状）。`SECURITY.md` SHALL 声明确认过的敏感文件现状（`.env.*` 入库清单与密钥是否在环境间分离），SHALL NOT 仅声明上报邮箱。

#### Scenario: 贡献者能找到本地验证流程

- **WHEN** 新贡献者在 GitHub 新建 PR
- **THEN** 界面提供指向 `CONTRIBUTING.md` 的链接，且该文件包含本地启动、测试与所需通过的检查

#### Scenario: 安全现状被声明

- **WHEN** 阅读 `SECURITY.md`
- **THEN** 能读到已入库的 `.env.*` 清单、生产与开发密钥是否分离的实测结论，以及漏洞上报渠道

### Requirement: 引用完整性随删除与改名同步

删除或改名任一被文档引用的文件时，SHALL 在同一次变更内更新全部指向它的引用。自检覆盖范围内的引用 SHALL 由 `docs:check` 拦截；覆盖范围之外的引用 SHALL 在变更的验收清单中逐条核对。

#### Scenario: 删除文档后引用被清理

- **WHEN** 删除 `docs/ai-development.md`
- **THEN** `README.md` 中指向它的链接在同一次变更内改为现存目标，且 `pnpm docs:check` 通过

#### Scenario: 目录改名后四处表述一致

- **WHEN** 经验层目录改名（`hermes/` → `docs/experience/`）
- **THEN** 根文件「知识位置」表、`CONTEXT.md` 的词条与 `_Avoid_` 清单、`docs/README.md` 索引、新目录自身 README 的表述在同一次变更内全部一致
