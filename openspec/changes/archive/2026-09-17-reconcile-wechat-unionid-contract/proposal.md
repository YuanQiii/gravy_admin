## Why

审查报告 P3-4 指出：微信登录不写 `unionid`，跨小程序账号无法归并。经核实，根因**不在代码缺失，而在 `openspec/specs/customer/spec.md` 的 Requirement 写了一处不实契约**，与 ADR 0012 及实现不符：

- `apps/mall/src/modules/customer-auth/wechat-code2session.client.ts:5-7` —— `WechatSessionResult` 仅含 `openid`；`session_key`/`unionid` 被解析后即丢弃，即使微信返回 `unionid` 也不会被消费。
- `apps/mall/src/modules/customer-auth/customer-auth.service.ts:108-127`（`wechatLogin` 只按 `openid` 定位/建号）、`:197-230`（`createWechatCustomer` 仅写 `openid`）——Mall 侧确实永不写 `unionid`。
- `openspec/specs/customer/spec.md:16-19`「微信登录创建客户」Scenario 称「`openid`/`unionid` 写入」且 `username` 形如 `wx_{openid前8位}`——两处均不实。
- `apps/mall/src/modules/customer-auth/wechat-identity.ts:25-31` —— 真实 `username` 为 `wx_{openid后12位}`（前 8 位是 hash 兜底候选）。

**决定性产品事实**：本项目为**个人主体小程序**（`docs/adr/0012-personal-mini-program-wechat-silent-login.md:25` 已记录「个人主体小程序通常不返回 `unionid`」）。未接入微信开放平台绑定前，`code2Session` **不会返回 `unionid`**，故本期实现"按 unionid 归并"在技术上不可行。报告建议的"归并"属未评审的新能力（ADR 0012 决策 2 已否决），且无任何合并入口。因此本期正确处置是**文档契约纠正**，而非实现归并。

## What Changes

- **修改（非破坏性）** `customer` 能力 spec 的「客户模型与管理员分离」Requirement：校正「微信登录创建客户」Scenario——本期仅写 `openid`，`unionid` 不写入（仅后台手工可维护），`username` 形如 `wx_{openid后12位}`。
- **新增** `customer` 能力 Requirement「微信登录契约（仅 openid，unionid 待接入）」：显式声明本期登录只消费 `openid`；`unionid` 归并 / 跨小程序账号合并的**前置条件**（微信开放平台绑定使 `code2Session` 返回 `unionid`）与**非目标**；后台 `unionid` 手工读写入口保留。
- **不改**：登录代码、`prisma/schema.prisma`（`openid`/`unionid` 的 `@unique` 形同虚设但无害，移除需迁移，YAGNI）、`docs/adr/0012-*.md` 既有文件、账号合并功能。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `customer`: 校正「微信登录创建客户」Scenario 不实主张（`unionid` 写入、`username` 前 8 位），并新增「微信登录契约（仅 openid，unionid 待接入）」Requirement 固化本期契约与前置条件。

## Impact

- 文档/spec 一致性：`customer` spec 与 ADR 0012、实现、admin 手工入口对齐。
- 无代码改动、无 schema 迁移、无运行时行为变化；`validate --strict` 仅校验 spec 文本。
- admin 侧 `unionid` 手工入口保留且不受影响：`apps/admin/src/modules/customers/customers.service.ts:69-76`（创建校验）、`:194-205`（更新校验）、`create-customer.dto.ts:55-59`。
- `Customer` 唯一性校验现状（本期不动，仅记录）：Mall 用 `Prisma.PrismaClientKnownRequestError` P2002 兜底（`customer-auth.service.ts:214-227`），admin 用 `@gvray/core` 的 `SoftDeleteService.assertUniqueActive`（`customers.service.ts:39-76`）；`packages/domain/src` 下**无 Customer 模块**（仅 `equipment`/`inquiry`），故"domain 校验"一说不实。
