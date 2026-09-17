## 1. 校正 customer spec（文档变更，无代码）

- [x] 1.1 在 `openspec/specs/customer/spec.md` 的「客户模型与管理员分离」Requirement 中，将「微信登录创建客户」Scenario 改为「仅写入 `openid`、`unionid` 本期不写入、`username` 形如 `wx_{openid 后 12 位}`」。验证：`grep` 该 spec 不含"unionid 写入"与"前8位"字样，且 MODIFIED 块含原 Requirement 全部 3 个 Scenario。
- [x] 1.2 在 `customer` spec 新增「微信登录契约（仅 openid，unionid 待接入）」Requirement，含 4 个 Scenario（仅消费 openid / 不归并 / 后台手工 unionid / 前置条件未满足）。验证：`openspec validate` 不报 "MODIFIED omits scenario(s)" 且 ADDED Requirement 每个 ≥1 个 `#### Scenario:`。

## 2. 契约一致性核对（不改代码）

- [x] 2.1 核对 `docs/adr/0012-personal-mini-program-wechat-silent-login.md` 已含"unionid 不依赖/可留空（个人主体通常不返回）"与"username 后12位"，确认无需补注记（受边界约束不改该文件）。验证：`grep -n "unionid" docs/adr/0012-*.md` 命中对应行。
- [x] 2.2 核对 admin `customers.service.ts:69-76`、`:194-205` 的 `unionid` 手工读写入口保留且未被本变更影响。验证：`grep "unionid" apps/admin/src/modules/customers/customers.service.ts` 仍含创建/更新两处校验。

## 3. 验收（无代码改动）

- [x] 3.1 运行 `openspec validate reconcile-wechat-unionid-contract --strict`。验证：退出码 0、无错误输出。
- [x] 3.2 确认未改动项目代码：`git status` 仅 `openspec/changes/` 下新增。验证：`git status --short` 不含 `apps/`、`packages/`、`prisma/`、`docs/adr/` 的修改。

## 4. 未来前置（unionid 待接入，本期不实现，仅记录）

- [x] 4.1 记录 unionid 归并前置条件：接入微信开放平台绑定使 `code2Session` 返回 `unionid`；届时再评估"先 unionid 归并、再 openid 定位"方案与账号合并入口。验证：`design.md` Decisions 已声明该前置条件与非目标。

## 5. 架构审查回写（预授权采纳推荐，仅记录 seam，不实现）

- [x] 5.1 记录未来 seam A：拓宽 `WechatSessionResult` 为 `{ openid, unionid?, session_key? }` 被动值类型（换取层诚实化）。验证：`design.md` Architecture Review 第 1 条已记录，且本期未改动该文件。
- [x] 5.2 记录未来 seam B：`WechatCustomerReconciler` module，接口 `reconcile(openid)`（未来 `reconcile(unionid?, openid)`），作为 unionid 归并的 intended 落点。验证：`design.md` Architecture Review 第 2 条已记录为 Strong 采纳项。
- [x] 5.3 记录否决项：统一 Customer 唯一性 adapter 本期不做（Speculative，受同一产品事实阻断 + YAGNI，与 ADR 0012 决策 4 一致）。验证：`design.md` Architecture Review 第 3 条已写明否决理由。
- [x] 5.4 所有上述 seam 仅作文档记录，不在本期触发任何代码改动；触发时机统一为"接入微信开放平台绑定"。验证：`git status --short` 不含 `apps/` 下改动。

## 实施记录（2026-09-17）

- **1.1/1.2**：delta 内容核对通过——MODIFIED「客户模型与管理员分离」承载原 3 个 Scenario（微信登录创建客户已改为"仅 openid、unionid 本期不写入、username 后 12 位"）；ADDED「微信登录契约（仅 openid，unionid 待接入）」4 个 Scenario。
- **2.1**：ADR 0012 已含"unionid 不依赖、可留空（个人主体小程序通常不返回）"与"后 12 位"，无需补注记（边界约束不改该文件）。
- **2.2**：admin \`customers.service.ts\` unionid 读写入口保留（9 处命中）。
- **3.2**：`git status` 无 apps/packages/prisma/docs 改动（纯文档变更）。
- **4.x/5.x**：seam A/B 与否决项均已记录于 design（grep 核对通过）；触发时机统一为"接入微信开放平台绑定"。
- **门禁**：`validate --strict` ✓。
- 剩余：归档动作（合并进主规格）。
