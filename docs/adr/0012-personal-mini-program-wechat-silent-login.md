# ADR 0012: 个人主体小程序微信静默登录

- 状态：已接受

- 日期：2026-09-09

- 关联：ADR 0009（独立 B2C Customer JWT 认证域）、ADR 0010（Monorepo 双应用拆分）、ADR 0011（客户授权模型与安全取舍）、CONTEXT.md 词条 `Customer`（`openid`/`unionid` 识别）

## 背景

Mall 客户认证需提供微信小程序一键登录。个人主体小程序的硬约束：**不能用依赖认证主体的 `getPhoneNumber` 手机号一键登录**（`getPhoneNumber` 需企业/个体营业执照认证主体；个人主体不可用）。

本次记录在个人主体约束下的取舍：选择静默 `openid` 登录、只建新号不做账号合并、占位字段约定、单小程序不引入 provider 维度、微信换取层归属 mall。

## 决策

### 1. 机制：静默 openid 登录（非手机号一键登录）

选用 `wx.login → JS 侧 js_code → POST /auth/wechat-login → 后端 jscode2session → openid → 定位/创建 Customer`。个人主体下这是唯一免密路径；`getPhoneNumber` 因主体约束被排除。

- 换取只消费 `openid`；`session_key` **不落库、不依赖**（若未来需客服消息解密/手机号验证再重建，接缝收敛于 `WechatCode2SessionClient`）。

### 2. 只建新号，不做账号合并

微信 `openid` 与既有账密账号**不关联、不合并**：openid 未命中即自动建号；命中则直接登录。`unionid` 不依赖、可留空（个人主体小程序通常不返回 unionid）。

### 3. 建号字段占位约定

`Customer` 需 `username`（唯一非空）/ `password`（非空）两列，静默登录无用户名与密码，因此：

- `username = wx_<openid 后12位>`，冲突回退 `wx_<后24位>` / `wx_<sha1 前8位>`（候选序列由 `wechat-identity.ts` 纯函数产出，service 逐候选判重）。
- `password` 存**随机秘钥的 bcrypt 占位哈希**（`bcrypt.hash('!wx-login:' + randomBytes)`）：`bcrypt.compare` 对未知明文返回 `false` → 该客户无法经 `POST /auth/login` 用密码登录（返回 401，而非抛错）；保持列非空、**零 schema 迁移**。注：占位秘钥明文以 `!wx-login:` 前缀标记不可登录，但**落库的是其 bcrypt 哈希**、非明文。
- 其余默认态：`status='enabled'`、`deletedAt=null`、`nickName='微信用户'`。

### 4. 单小程序，不引入 provider 维度

`Customer.openid` 仅在**单个** appid 维度唯一。当前只接入一个个人主体小程序，既定 `@unique` 足够（YAGNI）。**触发条件**：未来接入第二个小程序时，开放 `wxAppId` 列并把唯一索引改为 `(openid, wxAppId)`。

### 5. 微信换取层归属 mall（deep-seam）

微信换取是 mall 专属认证基础设施，`WechatCode2SessionClient`（mall 自有、可注入、返回纯值、失败抛 401）用 Node 内置 `fetch`（零依赖）调 `jscode2session`。core 仅保留跨端共用的 `SessionStore`/`JwtService`；配置 `registerAs('wechat')` 放 mall 本地。换取失败统一 401、话术不泄露微信 errcode/errmsg。

## 备选方案（已否决）

- **手机号一键登录（`getPhoneNumber`）**：依赖认证主体，个人主体不可用，排除。

- **账号合并/绑定（openid ↔ 账密）**：引入归属冲突与确认摩擦，本期明确不做；触发条件是出现「同一自然人多途径认证需归一」的明确需求。

- **`password` 改可空**：需要 schema 迁移并改动既有账密 `resolveCustomer` 逻辑，改动面大于占位串方案。

- **引入 `@nestjs/axios` + axios**：增加依赖；Node 18+/NestJS 11 内置 fetch 已满足换取，弃用。

## 后果

正面：

- 个人主体下提供可用的免密登录，体验`wx.login → 自动登录`一气呵成。

- 零 schema 变更、零迁移、零新增依赖，纯逻辑新增，可回滚。

- 换取层是独占 seam、配置 mall 本地，微信能力演进（客服消息/手机号/小程序码）扩展点收敛。

负面/风险：

- **单一 `openid` 默认绑单小程序** → 接第二个小程序会撞唯一索引。缓解：决策 4 的触发条件与复合键预案。

- **静默登录不验身份证/手机号** → 身份锚定到微信 openid，无强实名。缓解：与 ADR 0011「仅 IP 级限流、不锁账户」一致；占位密码降低账密泄露面，但客户总是可通过手动触发手机号能力/客服验证补全（本期不做）。

- **微信换取是外部 HTTP 出站** → 偶发超时/限流。缓解：换取层设超时（5s）、失败归一 401 统一话术，不在 handler 暴露网络细节。

- **`wx_` 前缀极端碰撞/占用** → 建号失败。缓解：候选回退链 + P2002 幂等兜底（并发首次登录只建一个客户）。

## 参考

- ADR 0009（独立 B2C Customer JWT 认证域）：`customer` realm 与会话存储接缝。

- ADR 0011（客户授权模型与安全取舍）决策 5：认证端点仅 IP 级限流、不锁账户（`/auth/wechat-login` 沿用）。

- 实现：`apps/mall/src/modules/customer-auth/`（`wechat-login` 端点/DTO/`CustomerAuthService.wechatLogin`/`issueSession` internal seam/[wechat-code2session.client.ts](../../apps/mall/src/modules/customer-auth/wechat-code2session.client.ts)/[wechat-identity.ts](../../apps/mall/src/modules/customer-auth/wechat-identity.ts)）、`apps/mall/src/config/wechat.config.ts`、`apps/mall/src/core/decorators/client-info.decorator.ts`、`packages/core/src/shared/utils/client-ip.util.ts`。