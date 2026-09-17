## Context

本变更仅纠正契约文档，不改动代码。背景事实（均经核实，非照抄审查报告）：

- 本项目是**个人主体微信小程序**，未接入开放平台绑定。`docs/adr/0012-personal-mini-program-wechat-silent-login.md:25` 已记录「个人主体小程序通常不返回 `unionid`」；`:31` 已确认 `username = wx_{openid后12位}`。即 AdR 0012 本身**已经**写明了"本期仅 openid、unionid 待接入"，无需再补（也受边界约束不可改该文件）。
- 不实主张集中在 `openspec/specs/customer/spec.md:16-19` 的「微信登录创建客户」Scenario：`unionid` 写入、username 形如 `wx_{openid前8位}`。实现侧 `wechat-code2session.client.ts:5-7` 的 `WechatSessionResult` 仅含 `openid`，`customer-auth.service.ts` 的 `wechatLogin`/`createWechatCustomer` 只写 `openid`，`wechat-identity.ts:25-31` 真实产出 `wx_{后12位}`。
- `unionid` 列确实只可能由 admin 手工写入：`apps/admin/src/modules/customers/customers.service.ts:69-76`（创建）、`:194-205`（更新），且有 `create-customer.dto.ts:55-59` 入口。Mall 永不写。
- `packages/domain/src` 下**无 Customer 模块**（仅 `equipment`/`inquiry`），`Customer` 唯一性校验分散：Mall 用 P2002 兜底，admin 用 `@gvray/core` 的 `SoftDeleteService.assertUniqueActive`。本期不动。

## Goals / Non-Goals

**Goals:**
- 校正 `customer` spec 的两处不实主张，使 spec ↔ ADR 0012 ↔ 实现 ↔ admin 入口四方一致。
- 显式固化本期契约：微信登录只消费 `openid`；`unionid` 归并 / 跨小程序合并的**前置条件**（开放平台绑定）与**非目标**写进 spec。

**Non-Goals:**
- 不实现 `unionid` 归并逻辑（技术不可行：个人小程序 `code2Session` 不返回 `unionid`；且属未评审新能力，ADR 0012 决策 2 已否决）。
- 不设计"账号合并"功能（无合并入口，未评审）。
- 不改 `prisma/schema.prisma`（`openid`/`unionid` 的 `@unique` 形同虚设但无害；移除需迁移，YAGNI）。
- 不改 `docs/adr/0012-*.md` 既有文件。
- 不改任何登录/建号代码。

## Decisions

1. **采用文档纠正而非实现归并** —— 理由：个人主体小程序在接入开放平台前 `code2Session` 不返回 `unionid`，实现归并无数据来源，属空转；ADR 0012 已记录该约束。备选否决：本期实装 `unionid` 归并（否决理由——无数据、无入口、未评审，且会与 ADR 0012 决策 2 冲突）。

2. **用 MODIFIED 整块复制并校正既有 Requirement** —— 理由：「客户模型与管理员分离」仅「微信登录创建客户」一个 Scenario 不实，整 Requirement 仍有效；整块复制再改可满足 `validate --strict` 对"MODIFIED 必须承载全部 Scenario"的要求，成本最低。备选否决：REMOVED+ADDED 拆 Requirement（否决理由——会丢失其余两个有效 Scenario 的连续性，且 MODIFIED 已能表达）。

3. **新增 ADDED Requirement 固化本期契约与前置条件** —— 理由：不实主张原本就写在 spec 的 Requirement 中，纠正后应把正确契约就地写成 Requirement（含 4 个 Scenario），并显式声明 `unionid` 归并的前置条件（开放平台绑定）与非目标，避免该 `@unique` 列被误读为已生效。

4. **username 规则漂移一并纳入同一 Requirement 纠正** —— 理由：同一 Scenario 内两处不实（`unionid` 写入 + `前8位`），一起改成本最低，避免二次变更。

5. **账号合并功能写作 Non-Goal + 前置条件** —— 理由：报告点名的"已绑定账号合并策略"当前无任何入口，属未评审新能力；仅在 spec 中声明其为非目标与前置条件，不进入方案。

## Risks / Trade-offs

- `unionid` 的 `@unique` 约束仍形同虚设，但**当前无害**：个人小程序下 `unionid` 恒为空，`@unique`（可空）不触发冲突；admin 手工填 `unionid` 时唯一校验仍生效。移除约束需 schema 迁移，收益不抵成本，故保留。
- spec 与 ADR 0012 已一致，无需再改 ADR；但 ADR 0012 未在归档前做"补注记"动作——本报告确认其已含该澄清，故 tasks 中仅记"确认无需更改"，不再触碰该文件（受边界约束）。
- 风险：若未来误以为 `unionid` 已生效而直接依赖，会再次产生漂移。缓解：本变更把"unionid 待接入 + 前置条件"写进了 spec 的 Requirement，使契约可校验。

## Architecture Review（规划件审查回写，预授权采纳推荐）

对 4 份规划件做架构审查后，以下 deepenings 已采纳结论（用户预授权「同意推荐」）：

1. **WechatSessionResult 值类型拓宽（Worth exploring → 采纳为未来 seam）**：`WechatSessionResult` 当前过窄（仅 `openid`），解析后即丢弃 `unionid`/`session_key`。推荐拓宽为承载完整响应的被动值类型 `{ openid, unionid?, session_key? }`，调用方按需取用，使换取层成为诚实的 seam。本期仅记录，不实现——受同一产品事实阻断（个人小程序不返回 unionid）。

2. **抽出 WechatCustomerReconciler module（Strong → 采纳为 unionid 归并的 intended seam）**：`wechatLogin` + `createWechatCustomer` 的"定位或建号"决策内联于 `CustomerAuthService`，无 locality。推荐抽出 `WechatCustomerReconciler`，接口 `reconcile(openid) → Customer`（未来 `reconcile(unionid?, openid)`），把归并策略收进单一深 module。这是 unionid 前置条件真正落点，使被推迟的工作成为一次本地化 module 改造。仅记录，不实现。

3. **统一 Customer 唯一性 adapter（Speculative → 否决 / 推迟）**：Mall（P2002 兜底）与 admin（`assertUniqueActive`）两套唯一性机制可统一为 adapter，但属较大重构，且受同一产品事实阻断（个人小程序 `unionid` 恒空，无第二身份源），YAGNI。否决理由：与 ADR 0012 决策 4（单小程序不引入 provider 维度）一致，待出现第二小程序/开放平台绑定再议。
