# MEMORY.md — gvray 项目长期笔记

## 未归档变更积压（2026-09-17 建立）

2026-09-16/17 的一轮"业务审查问题清单逐项规划"产生 **17 个未归档 openspec 变更**（对应 Mall 业务审查报告 18 项问题中的 17 项；P0-1 已归档）。全部通过 `openspec validate --strict`，**均未实现、未提交**。

明细、每项的方案/审查采纳/事实修正、以及**必须遵守的串行约束**见 `.workbuddy/memory/2026-09-16-mall-issue-sweep.md`（含 `inquiries.service.ts` 的 7 变更重叠顺序、两处 Requirement 被多变更改写的先后关系）。

落地前的关键提醒：
- 多个变更改同一文件（`packages/domain/src/inquiry/inquiries/inquiries.service.ts` 被 7 个变更触及），实施必须串行。
- 归档有顺序要求（P3-4 → P3-5；P0-2 → P2-4）。

## openspec 使用要点（本项目实证）

- **完整流水线经验已沉淀为项目级 skill**：`.workbuddy/skills/openspec-issue-sweep/`（SKILL.md 流程 + references/archive-playbook.md 归档/delta 重放手册 + 8 条实证坑）。处理 openspec 变更（propose/apply/archive）前先读它；项目级 skill 无法经 Skill 工具加载，直接 Read 该 SKILL.md。

- `openspec validate <change> --strict` 会检查：`## MODIFIED Requirements` 必须承载原 Requirement 的**全部** Scenario，否则报 "MODIFIED omits scenario(s)"。因此**纠正文档里的错误主张**应优先用 `REMOVED + ADDED`（新增 Requirement 名），而不是就地改写 —— 后者要么保留"名字与断言相反"的场景，要么被校验器拒绝。RENAMED + MODIFIED 组合已尝试并放弃。
- **同一 Requirement 被多个未归档变更改写时，后归档者必须把 delta 重放到合并后的主规格上**（实证：P0-2 归档把「询价单创建」3→5 场景后，P2-4 的 MODIFIED 块立刻被 `validate --strict` 判为遗漏场景）。落地顺序见 `2026-09-16-mall-issue-sweep.md` 的串行约束表。**重放方法（2026-09-17 实证）**：以合并后主规格的 Requirement 块为基底、只叠加本变更自己的约束句/场景，而不是在旧 delta 上补场景——前者自动保住其他变更（如 201 措辞、fire-and-forget）已合并的文本不回退。`openspec archive -y` 每次只报第一个冲突的 Requirement，需循环修复直到归档成功。
- `openspec new change` 若目录已存在会失败（不会覆盖）——子代理被中断后可能留下空壳目录，需先检查 `.openspec.yaml` 是否存在再补齐。
- Change 的 delta 文件路径：`openspec/changes/<name>/specs/<capability>/spec.md`，capability 名必须是 `openspec/specs/` 下已有目录名（或新引入的 kebab-case）。

## 仓库事实校正（与 `AGENTS.md` 不一致处）

- `AGENTS.md` 声称 `prisma/schema.prisma` 使用 `relationMode = "prisma"`「无外键约束」：**不实**。`datasource` 块未声明该选项，`prisma/migrations/0_init/migration.sql` 建立了真实外键（如 `inquiries_shippingAddressId_fkey ... ON DELETE SET NULL`），即级联行为是 **DB 级**的。`snapshot-inquiry-shipping-address` 的 tasks 4.2 已列入订正项。

## 项目级 skill 的加载方式

`{workspace}/.workbuddy/skills/<name>/SKILL.md` 无法通过 Skill 工具加载（返回 `Can not find skill`）。以 `@skill:<name>` 附加时，直接 `Read` 该 `SKILL.md` 并按其步骤执行即可。
