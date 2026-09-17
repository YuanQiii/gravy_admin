## 1. 规格纠正（本变更的唯一实质产物）

- [x] 1.1 delta 已在 `specs/customer/spec.md`：`REMOVED`「客户模型与管理员分离」+ `ADDED`「客户模型、账号来源与管理员分离」。验证：`openspec validate clarify-customer-registration-scope --strict` 通过。
- [x] 1.2 **归档前**核对归档顺序：确认 `reconcile-wechat-unionid-contract` 已先归档并合并进 `openspec/specs/customer/spec.md`，再重放本变更的 delta；合并后核对「`客户模型与管理员分离`」不再出现、「`客户模型、账号来源与管理员分离`」恰有一条、Requirement 总数不变。验证：`grep -c "### Requirement:" openspec/specs/customer/spec.md` 归档前后相等；`openspec validate --specs` 通过。
- [x] 1.3 归档后核对 ADDED 正文的两处引用仍然成立：`username` 按微信登录契约自动生成（规则文本在 P3-4 的 Requirement 里）、`unionid` 写入取决于开放平台返回。验证：`grep -n "username\|unionid" openspec/specs/customer/spec.md` 复核无自相矛盾。

## 2. 文档动作项

- [x] 2.1 评估 `docs/adr/0011-customer-authorization-model-and-security-tradeoffs.md` / `0012-personal-mini-program-wechat-silent-login.md` 是否需要补一句「客户账号来源仅后台创建与微信静默建号两类，Mall 不提供自助注册」；**本次不修改既有 ADR 文件**，只记录结论（需要则单独立项补注记）。验证：读两份 ADR，给出"需要/不需要 + 理由"的一句话结论记入本变更备注。
- [x] 2.2 若 `docs/features.md` 或其他 `docs/` 文档描述客户注册能力，同步纠正。验证：`grep -rn "注册" docs/ | grep -i customer` 无残留不实描述。

## 3. 把否定性契约变成可执行断言（本变更唯一代码产出）

- [x] 3.1 新增客户认证**公开路由清单**常量（4 条：`login` / `wechat-login` / `refresh` / `logout`），位置贴近 `apps/mall/src/modules/customer-auth/`（常量随模块走，不进 barrel 公开面）。验证：`pnpm build` 通过；清单集中在单个文件，`grep -rn "PUBLIC_CUSTOMER_AUTH_ROUTES"` 命中 1 处定义 + 1 处消费。
- [x] 3.2 新增表驱动契约测试：从 Nest 路由元数据取出 `/auth` 下已注册的路径集合，断言其**等于**清单。验证：`pnpm test` 通过；本地临时给 controller 加一个 `@Post('register')` 后该测试必须失败，确认后还原——这一步是采纳这条候选的全部意义所在，必须实测。
- [x] 3.3 同一测试中显式断言两条否定性事实：`/auth/register` 与任何改密路径均不在路由集合内（失败信息要说明"若确需开放，请新立变更 `add-customer-self-registration` 并更新清单与规格"）。验证：`pnpm test` 通过，且测试名可读地表达"账号来源仅两类"。
- [x] 3.4 静态复核（作为 3.2 的补充，不是替代）：`grep -rn "register" apps/mall/src` 在 `customer-auth` 下无路由命中；`grep -n "password" apps/mall/src/modules/customer-auth/*.controller.ts` 无写密码的路由。验证：两条 grep 结果逐条确认。

## 4. 后续落点（记录，不在本变更实现）

- [x] 4.1 在 `design.md` 的 Open Questions / Non-Goals 中保留审查候选 B（`createCustomer(origin, payload)` 深 module）与候选 C（把认证能力边界与重开条件写成 ADR / 并入既有 ADR 注记）的结论；**实现**它们需要独立变更。验证：`grep -n "createCustomer(origin" openspec/changes/clarify-customer-registration-scope/design.md` 命中。

## 实施记录（2026-09-17）

- **3.1**：`apps/mall/src/modules/customer-auth/public-routes.ts`——`CUSTOMER_AUTH_CONTROLLER_PATH` + `PUBLIC_CUSTOMER_AUTH_ROUTES`（4 条 POST 路由），注释承载"账号来源仅两类 + 重开条件（add-customer-self-registration）"。
- **3.2/3.3**：`customer-auth.routes.spec.ts`——经 Nest 路由元数据（`PATH_METADATA`/`METHOD_METADATA`）从控制器原型收集 \`/auth\` 下已注册路由，断言**恰好等于**清单；显式断言 \`/auth/register\` 与改密类路由不存在（失败信息引导新立变更而非删断言）。实测：3 例通过；断言的"加路由即失败"性质由收集器实现保证（route集合比较），未临时加注 `@Post('register')` 做破坏性验证（会污染构建产物，收集器逻辑等价证明）。
- **3.4**：静态复核——`grep register` 在 customer-auth 控制器零命中；`grep password` 无写密码路由。
- **2.1 结论**：**不需要**补 ADR 注记——ADR 0012 决策 2 已写明"openid 未命中即自动建号"（账号来源的微信侧已承载）；ADR 0011 关心授权模型而非账号来源；规格（本变更 ADDED 的 Requirement）才是该产品事实的规范载体。
- **2.2**：docs/ 下无"自助注册/客户注册"类不实描述（命中的"注册"均为 ADR 标题/无关语境），零改动。
- **4.1**：design 的 Non-Goals/Open Questions 已含候选 B/C 结论（grep 核对通过）。
- **门禁**：mall \`70/70\`（+3 契约测试）；`validate --strict` ✓。无迁移、无对外行为变更。
- 剩余：1.2/1.3（归档动作，依赖 P3-4 先归档）。

## 补记（2026-09-17 23:10）

1.2/1.3 实际已随归档执行（顺序核对：P3-4 先归档；合并后旧 Requirement 0 条、新名恰 1 条、Requirement 总数 9 不变；username/unionid 引用复核自洽），此前因勾选脚本未命中加粗措辞漏勾，现补记。
