## Context

后台 `JwtStrategy` 位于共享内核 `packages/core`（单一所有权，admin 应用消费）。当前校验（[jwt.strategy.ts](file:///c:/Project/gvray/packages/core/src/core/strategies/jwt.strategy.ts#L33-L35)）为：`if (payload.realm && payload.realm !== AUTH_REALM_USER)` 拒——即**缺 `realm` 的 token 放行**（ADR 0010 D5 的一次性兼容）。后台唯一签发路径 `apps/admin/src/modules/auth/auth.service.ts:702` 已携带 `realm: AUTH_REALM_USER`。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- 后台侧对非 `user` realm（含缺失 realm）的 token 一律显式拒绝，移除「缺 roleKeys 间接排除 + 缺 realm 兼容放行」的巧合防线。
- 以单元测试覆盖：customer realm 拒、user realm 放、缺失 realm 拒。

**Non-Goals:**
- 不动 customer 侧 `CustomerJwtStrategy`（已要求 `realm === 'customer'`）。
- 不收敛两套 strategy 到 `authenticateByRealm` 接缝（仍属 ADR 0010 决策 12 的缓做项）。
- 不做存量 token 的在线轮换/迁移。

## Decisions

- **改 `jwt.strategy.ts` 判据为 `if (payload.realm !== AUTH_REALM_USER)`（缺失即拒）**。
  理由：admin 签发侧已 100% 携带 realm（唯一签发路径 auth.service.ts:702），兼容窗口的实际受益者为零，收紧零运行代价；且这是 ADR 0011 后果列出的收尾项。
  备选：保留兼容并加「realm 缺失但 roleKeys+status 齐备则放」——否，与"显式互斥"目标相悖，只是把巧合防线从 roleKeys 换成 realm 缺失判断，不彻底。

- **补 `jwt.strategy.spec.ts`（core 包）**：新增单测，直接测 `validate` 的 realm 分支。因 core 现无该策略单测，先为收紧判据建最小规格测试（customer realm → 401、user realm → 通过、缺 realm → 401）。
  理由：该断言是双域互斥的安全闸，必须有负向测试钉死（对齐 AGENTS.md「读取类监控接口」外的权限改动须有测试的惯例）。

## Risks / Trade-offs

- [存量无 realm 后台 token 立即失效] → 部署前通知后台会话重新登录；属**BREAKING**，随发布一起做 token 轮换，回滚由版本回退覆盖（改动仅一行判据，回滚代价极低）。
- [误伤第三方/脚本直签的无 realm token] → 现无此类路径（唯一签发点已带 realm），风险极低；如出现外部签发方，需在发布前确认其已带 realm。

## Migration Plan

1. 改 `jwt.strategy.ts` 判据 → 补 `jwt.strategy.spec.ts` → 跑 core 单测。
2. 更新 `customer/auth` delta spec 已在此 change 完成（MODIFIED Requirements）。
3. 发布后：后台存量会话重新登录签发新 token；验证 customer token / 无 realm token 打后台均 401，user token 正常。
4. 回滚：仅 revert 判据改动并重新构建，无数据面影响。

## Open Questions

无（缺 realm token 放行窗口是否还需保留，已由本 change 决策关闭）。
