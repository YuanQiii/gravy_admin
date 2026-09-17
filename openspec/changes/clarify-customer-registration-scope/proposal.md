## Why

规格 `openspec/specs/customer/spec.md` 的「客户模型与管理员分离」Requirement 把「客户注册」写成了第一个 Scenario（「消费者提交 `username`/`password`/`email` 注册」），但 Mall 应用根本没有注册端点——`apps/mall/src/modules/customer-auth/customer-auth.controller.ts:32-84` 只有 `login` / `wechat-login` / `refresh` / `logout` 四个端点。`Customer` 的真实产生路径只有两条：后台管理员在 Admin 应用创建（`apps/admin/src/modules/customers/`），或微信静默登录自动建号。

后果不是"少一个功能"，而是**文档承诺了一条不存在的开通路径**：任何按规格实现的调用方（或下一个探索此仓库的 AI agent）都会去找 `POST /auth/register`，然后落空——这正是本项目一直在治理的规格漂移。同时它也掩盖了真实的账号模型：一个有账密登录、却没有自助注册的"邀请制"账号体系。这个决策该被写下来，而不是继续由文档空转。

## What Changes

- **作出并落定决策：本期不提供客户自助注册。** 账号来源契约明确为两类——后台创建、微信静默登录自动建号；Mall SHALL NOT 提供注册端点，也 SHALL NOT 提供设置/修改密码的端点（凭据由后台开号时设定）。
- **规格纠正**：以 `REMOVED + ADDED` 重写「客户模型与管理员分离」——保留实体字段契约，删除虚挂的注册场景，新增「账号来源」与「Mall 不提供自助注册」两条可断言行为（含 `POST /auth/register` 返回 404 的场景）。
- **把重开条件写进 planning artifacts**：若产品确需 H5/公众号自助开通，它是一个**独立变更**，前置条件是密码策略、验证方式（邮箱/短信）、注册端点限流（依赖未归档变更 `harden-client-ip-trust-boundary` 的客户端 IP 信任边界）、唯一性冲突 409 语义——全部记入 design 的 Non-Goals 与 Open Questions，避免未来被当成遗漏而重开。
- **无代码改动**：本变更是契约纠正。`grep` 已确认仓库内不存在注册端点，因此不需要删除任何代码。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `customer`: 「客户模型与管理员分离」——移除虚挂的「客户注册」场景，改为断言真实账号来源（后台创建 / 微信静默建号）与「Mall 不提供自助注册端点」。

## Impact

- **规格**：`openspec/specs/customer/spec.md`（Requirement 被 REMOVED + ADDED，Requirement 总数不变）。
- **代码**：无应用代码改动（`grep` 已确认仓库内不存在注册端点，因此没有实现需要删除）。唯一代码产出是一条契约测试文件——见 design 决策 6。
- **文档**：`docs/adr/0011`（客户授权模型）或 `0012`（微信静默登录）是否需要补一句「账号来源仅两类」由 tasks 记录为动作项；本次不修改既有 ADR 文件。
- **与并行变更的接缝（重要）**：未归档变更 `reconcile-wechat-unionid-contract`（P3-4）对**同一个 Requirement** 也做了 `REMOVED + ADDED`（修正 `unionid` 与 `username` 措辞）。两者必须**串行归档**：先 P3-4，再以 P3-4 合并后的主规格为基准重放本变更的 delta；否则两个 delta 会互相覆盖同一 Requirement。本变更的 ADDED 正文因此**不重复**声明 `unionid`/`username` 细则，只引用"见微信登录契约"。
