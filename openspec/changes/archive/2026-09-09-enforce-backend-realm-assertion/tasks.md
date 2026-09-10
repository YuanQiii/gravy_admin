## 1. 收紧后台 realm 判据

- [x] 1.1 修改 `packages/core/src/core/strategies/jwt.strategy.ts`：将 realm 判据由 `payload.realm && payload.realm !== AUTH_REALM_USER` 收紧为 `payload.realm !== AUTH_REALM_USER`（缺 realm 即拒），并更新注释移除「缺 realm 兼容放行」说明；验证 `pnpm build` 通过

- [x] 1.2 新增 `packages/core/src/core/strategies/jwt.strategy.spec.ts`，覆盖三分支：`realm=customer` 抛 401、`realm=user` 通过、`realm` 缺失抛 401；验证 `pnpm test` 该 spec 通过

## 2. 集成验证与发布

- [x] 2.1 核对后台唯一签发路径 `apps/admin/src/modules/auth/auth.service.ts` 始终携带 `realm: AUTH_REALM_USER`（无需改动，确认即可）；验证 grep 无其它后台签发点漏带 realm

- [x] 2.2 双端冒烟：customer token 与「无 realm 手工签发的 token」打后台受保护接口均 401，admin 正常登录的 user token 放行；验证 curl/测试输出符合预期

- [ ] 2.3 发布前通知后台存量会话重新登录（BREAKING：旧无 realm token 立即失效）；验证发布后后台可用

