## Context

- 规格 `openspec/specs/customer/spec.md` 的「客户模型与管理员分离」Requirement 含 3 个 Scenario，首个是「客户注册」。
- 实现侧：`apps/mall/src/modules/customer-auth/customer-auth.controller.ts` 只有 4 个端点（`login` 10/min、`wechat-login` 10/min、`refresh` 30/min、`logout` 30/min），无注册。
- 账号的两个真实来源：Admin 的 `apps/admin/src/modules/customers/`（有创建能力与唯一性校验）、Mall 的微信静默登录自动建号。
- 客户认证的既定取向见 `docs/adr/0011`（独立 B2C 客户 JWT 与取舍）与 `docs/adr/0012`（个人主体小程序微信静默登录）。
- 并行未归档变更 `reconcile-wechat-unionid-contract` 对**同一个 Requirement** 也做 REMOVED + ADDED（纠正 `unionid` 与 `username` 措辞）。

## Goals / Non-Goals

**Goals:**

- 让规格与实现一致：不再承诺一条不存在的开通路径。
- 把"账号来源只有两类"写成显式、可断言的契约（含注册路径的否定断言）。
- 为重开留下明确的前置条件，使未来的产品决策不必从零调研。

**Non-Goals:**

- **不实现** `POST /auth/register`。若产品需要，它是独立变更，前置条件见决策 1。
- **不做**密码找回 / 修改密码 / 邮箱验证 / 短信验证 / 账号合并（均无端点、无规格）。
- **不改** Admin 的客户创建流程（含其唯一性校验与软删同名 409 语义）。
- **不改** 微信登录的 `unionid`/`username` 措辞（属 `reconcile-wechat-unionid-contract`）。
- **不改** 任何 ADR 文件（只在 tasks 记录是否需要补注记）。

## Decisions

### 1. 选定路线：纠正文档，不实现自助注册

**理由**：

1. 交付渠道是个人主体微信小程序（ADR 0012），客户经微信到达，该路径已实现且有规格支撑。
2. 现存的账密登录（`login`，支持 `username`/`email`/`phoneNumber` 三种标识解析）不是"C 端自助"的配套，而是**邀请制账号**的登录方式——由 Admin 侧确有创建能力（含唯一性与软删语义）这一事实支撑。
3. 新增公开注册端点会引入一整套未被评审的能力：密码策略、验证方式、注册限流、用户枚举防护、软删同名 409 语义的对外暴露。这些是**新需求**，不应在"修文档不一致"的名义下夹带进一个契约纠正变更。

*备选（否决）*：实现 `POST /auth/register`。它不是错的，但它不是本问题的**最小正确动作**——本问题的本质是"文档与实现不一致"，而非"缺一个端点"。已把它写成 Non-Goal 与重开条件（决策 5）。

### 2. 纠正手法用 `REMOVED + ADDED`，不用 `MODIFIED`

`MODIFIED` 是整块替换，且 `openspec validate --strict` 要求承载原 Requirement 的**全部** Scenario（本项目已在 `atomic-inquiry-status-transition` 上验证过这条规则）。而「客户注册」这个 Scenario **名称本身**叙述着要被否定的事实——保留它并改写其内容，会制造"名字与断言相反"的新漂移；删掉它则被校验器判为遗漏。

`REMOVED` 块留下"此规格曾虚挂一条开通路径"的记录，`ADDED` 块描述当下的真实契约。Requirement 总数不变（-1 +1）。

### 3. ADDED 正文不重复 `unionid`/`username` 细则

同一 Requirement 被 `reconcile-wechat-unionid-contract` 并行改写。若本变更再声明一次这两项，两个 delta 会在归档时互相覆盖。改为引用「按微信登录契约自动生成」，把细则的单一所有者留给那个变更。

**归档顺序**：先 `reconcile-wechat-unionid-contract`，再以合并后的主规格为基准重放本变更（tasks 1.2）。

### 4. 无应用代码改动，但产出一条契约测试

`grep` 已确认仓库内不存在注册端点，因此不存在"删掉实现"这一步——**这一点必须写在 proposal 里**，否则审查者会以为漏了实现任务。

但"某条路径不存在"这条断言如果只由 grep 与人工核对承担，下次有人加路由时不会有任何东西响应。因此本变更包含**一个**测试文件（见决策 6）。

### 6. 把否定性契约做成清单断言（架构审查候选 A，采纳）

引入客户认证的**公开路由清单**（4 条：`login`/`wechat-login`/`refresh`/`logout`），配一条表驱动契约测试：从 Nest 的路由元数据取出 `/auth` 下的路径集合，断言其**等于**清单。

- 清单是"允许存在什么"的单一真值；注册与改密不在清单内 → "不提供"由结构保证，而非文档承诺。
- 测试是这条 internal seam 的测试面：新增一条公开认证路由会让 CI 变红，迫使改动者显式更新清单并解释来源（是否引入第三种账号来源）。
- 该测试落在测试目录，**不改应用代码**，与"契约纠正"的定位一致。

*备选（否决）*：只写规格、用 grep 核对（tasks 3.1 的原形态）——一次性的、由人执行的检查，正是本问题（文档与实现漂移）的复发路径。

*记录的后续落点（不在本变更实现）*：审查候选 B 指出两个建号 adapter（Admin 创建、微信静默建号）值得一个 `createCustomer(origin, payload)` 深 module，使"来源仅两类"由结构可数；本变更是纯契约纠正，把它记入 Non-Goals 与 Open Questions，交由独立变更处理。

### 5. 「不提供修改密码端点」写成规格约束

把它写入规格是有意的：它当前成立（无该端点），写下来可防未来误加；代价是"改密码"从此成为一个需要新变更的能力。与注册同理，它属认证能力的边界，值得显式。

**重开条件（若产品需要 C 端自助开通）**：新变更 `add-customer-self-registration`，须同时定义——密码策略（长度/复杂度/是否复用 Admin 侧规则）、验证方式（邮箱或短信，二选一或都做）、注册端点限流（依赖 `harden-client-ip-trust-boundary` 落地的客户端 IP 信任边界；该变更未落地前，注册限流同样可被 XFF 伪造绕过）、唯一性冲突的 409 语义（含软删同名 `CUSTOMER_*_DUPLICATED_SOFT_DELETED`）、以及是否允许自助设置 `nickName`。

## Risks / Trade-offs

1. **[被读成"注册被否决"]** → 决策 1 的备选与决策 5 的重开条件已写明这是"本期不做 + 记下前置条件"，不是"永不做"。
2. **[与 P3-4 的归档顺序]** → 两者改写同一 Requirement。若不按决策 3 的顺序归档，第二个归档的 delta 会以主规格的旧文本为基准，导致 `validate` 报 "MODIFIED/REMOVED ... not found" 或静默覆盖。tasks 1.2 要求核对。
3. **[404 与 405 的语义]** → `POST /auth/register` 返回 404 是因为该**路由**不存在（Nest 只有路径匹配失败才是 404；路径存在而方法不匹配才是 405）。规格写 404 是准确的；若未来有人新增了 `GET /auth/register`，该场景的断言会失准——届时随该变更一并更新。
4. **[否定性约束的维护成本]** → 「不提供注册/改密端点」是两条"证明不存在"的断言，测试上只能靠"请求该路径得 404"来验；它们不会因代码重构而失效，成本低。
