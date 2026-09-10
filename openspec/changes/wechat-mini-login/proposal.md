## Why

微信小程序端用户无法（也不会）输入账密，商城需要一条免密的微信身份入口。小程序为**个人主体**，无法使用需要认证主体的手机号一键登录（`getPhoneNumber`），因此唯一可行路径是**静默 openid 登录**（`wx.login` → `jscode2session` → openid）。本次让 `Customer` 能凭微信 `openid` 无感登录，补齐小程序闭环。

## What Changes

- 新增 mall 公开端点 `POST /auth/wechat-login`，接受 `{ code }`（`wx.login` 的 `js_code`），后端调用微信 `jscode2session` 换取 `openid`。

- `openid` 命中已有 `Customer` → 直接登录（返回与账密登录一致的 access + refresh token，realm 仍为 `customer`）。

- `openid` 未命中 → **自动创建新客户**（只建新号，不做任何账号合并/绑定）。

- `Customer.username` 用 `wx_<openid 后 12 位>` 派生（冲突回退追加/短 hash 保证唯一）；`password` 存**不可登录的随机占位串**（保持非空列约束，零 schema 变更）。

- 微信 `unionid` 本次不依赖（个人主体不返回），留空。

- 新增 mall 本地配置 `registerAs('wechat')`，读 `WECHAT_APPID` / `WECHAT_SECRET`。

- 新增 mall 自有 `WechatCode2SessionClient`（可注入 deep-seam），使用 Node 内置 `fetch`（零新依赖），只用 `openid`、不存储 `session_key`。

- 并发建号幂等：按 `openid` upsert + P2002 兜底重查，确保只建一次、只登录一次。

## Capabilities

### New Capabilities

- 无（微信登录归属既有 `customer/auth` 能力，不新建独立能力目录）

### Modified Capabilities

- `customer/auth`: 新增「微信小程序静默登录」需求——以微信 `openid` 为第三种识别入口登录并自动建号，与既有账密登录共享同一客户令牌认证域（realm `customer`）。不改变既有密码登录、刷新、登出、身份恢复需求。

## Impact

- **代码**：`apps/mall/src/modules/customer-auth/`（`CustomerAuthService` 加 `wechatLogin`、`CustomerAuthController` 加端点、新建 `WechatCode2SessionClient`、新增 DTO）。

- **配置**：mall 新增 `registerAs('wechat')`（读 `WECHAT_APPID` / `WECHAT_SECRET`），需在环境/部署配置补充。

- **依赖**：无新增（使用 Node 内置 `fetch`）。

- **Schema**：无变更、无迁移（复用 `Customer.openid`/`unionid` 既有列）。

- **网络**：mall 运行环境需允许出站 HTTPS 到 `https://api.weixin.qq.com`。

