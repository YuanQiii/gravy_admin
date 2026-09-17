---
name: openspec-issue-sweep
description: gvray 仓库的 openspec 变更流水线经验：批量问题清单 → 逐项规划（proposal/design/tasks/delta）→ 审查回写 → 串行实施 → 按依赖序归档（含 delta 重放）。当用户要求处理 openspec 变更（propose/apply/archive）、提到业务审查问题清单、或归档时报 "MODIFIED omits scenario(s)" / "current spec contains scenario(s) not present" 类冲突时使用。
agent_created: true
---

# openspec-issue-sweep（gvray 变更流水线）

本仓库用 openspec 管理 NestJS monorepo 变更。每项问题走完整流水线：规划 → 实施 → 归档。本 skill 固化 17 项批量实践中验证过的流程与坑。

## 前置事实

- `openspec` 为全局 CLI；仓库根含 `openspec/` 即 root。命令：`new change / list / validate --strict / archive -y / validate --specs`。
- 变更四件套在 `openspec/changes/<name>/`：`proposal.md`、`design.md`、`tasks.md`、`specs/<capability>/spec.md`（delta）。capability 名必须是 `openspec/specs/` 下已有目录名（或新引入 kebab-case）。
- 台账在 `.workbuddy/memory/2026-09-16-mall-issue-sweep.md`（17 项状态 + 串行约束表）——动任何变更前先读它。

## 流程

### 1. 规划（每项一个变更）

1. `openspec new change <name>`（目录已存在会失败——先检查 `.openspec.yaml` 是否存在；被中断的子代理可能留空壳目录）。
2. 写四件套；`tasks.md` 用 `- [ ]` 数字编号分组。
3. **先建串行约束表**：列出哪些变更改同一文件的同一段代码、哪些 MODIFIED 同一个 Requirement，排定顺序写入台账。这是后续归档不炸的前提。
4. `openspec validate <name> --strict` 必须通过。

### 2. 实施（严格串行）

1. 按约束表顺序，一次一个变更：读 tasks → 逐项实现 → 门禁（单测 + e2e + build + `validate --strict`）→ 提交（conventional commits，中文正文）。
2. 每个变更提交后在 `tasks.md` 追加「实施记录」并勾选（含偏离任务字面的决策与理由）。
3. 门禁基线：全量单测（core/domain/mall/admin）、e2e（7 套件）、两应用 build。数字要记录（如 303/303、87 用例），便于下个变更对比回归。

### 3. 归档（按依赖序，见 references/archive-playbook.md）

1. 按「被依赖者先归档」排序；每次归档后对剩余变更跑 `validate --strict`，失败即重放。
2. 全部归档后 `openspec validate --specs` 必须全过。
3. 迁移类任务：数据库变更**必须用户显式确认**才应用（硬规则）；手写迁移 + `prisma migrate deploy`，应用前后各跑一次只读核查 SQL。

## 高频坑（全部实证过，勿再踩）

- **改关键文件（schema.prisma 等）禁止用 node 脚本 replace**：空白符不匹配会**静默失败**，且 `prisma generate` 照常成功、编译靠旧 client 通过——错误延迟暴露。用 Edit 工具，改完 `grep` 验证再 `prisma generate` + tsc。
- **node 脚本改模块 DI 注册同样会静默失败**（锚点猜错），错误在 e2e 启动期才爆（`Nest can't resolve`）。模块结构类编辑用 Read + Write/Edit。
- **勾选任务时 sed 模式要含加粗标记**：tasks.md 里 `1.2 **归档前**核对…` 的 `**` 会让裸 sed 不匹配而静默漏勾。用 node 按行前缀匹配或 Edit。
- 原始 SQL 里 Prisma 列名是 **camelCase 带双引号**（未做 snake_case 映射）：写 `"unitPrice"` 不是 `unit_price`；表名看 `@@map`。
- 同一 spec 内多个用例共享 mock 时，断言调用次数前先 `mockClear()`（前用例泄漏调用记录）。
- 收集 Nest 路由元数据做契约测试：用 `Object.getOwnPropertyDescriptor(proto, name).value` 取处理函数（原型方法不是 descriptor）；`RequestMethod` 枚举 GET=0、POST=1。
- DTO query 数字字段必须 `@Type(() => Number)`（`transform: true` 下 query 是字符串，`@IsInt` 恒 400）。
- e2e 构造真实错误路径用 `mockRejectedValue(new Error(...))` + `setImmediate` 排空微任务，比 mock interceptor 更接近线上。

详细归档操作与 delta 重放手册：**读 `references/archive-playbook.md`**。
