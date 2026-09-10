## Context

动机见 proposal.md（Why）。当前 mall 客户认证实现在 `apps/mall/src/modules/customer-auth/`：账密登录 `POST /auth/login`（identifier+password，bcrypt）走 [CustomerAuthService.login](file:///c:/Project/gvray/apps/mall/src/modules/customer-auth/customer-auth.service.ts#L46-L93)，令牌经 `generateAccessToken/generateRefreshToken/storeRefreshToken` 发放（realm 恒为 `customer`）。`Customer` 模型（[schema.prisma](file:///c:/Project/gvray/prisma/schema.prisma#L746-L770)）已具 `openid`/`unionid`（`@unique` 可空）、`username`（`@unique` 非空）、`password`（非空）、`nickName`（非空）等列。mall 当前**无任何 HTTP 客户端依赖**，配置用 `registerAs('jwt')` 模式（Packages 内部 jwt.config.ts），mall 本地无 config 文件。

个人主体小程序的硬约束：不能用依赖认证主体的 `getPhoneNumber` 手机号一键登录，只能用静默 openid 登录。

## Goals / Non-Goals

**Goals:**
- 新增 mall 公开端点 `POST /auth/wechat-login`，静默 openid 登录。
- openid 命中→登录；未命中→幂等自动建号再登录；响应结构与账密一致。
- 零 schema 变更、零迁移、零新增依赖。
- 微信换取层可注入、可单测（deep-seam），配置走 mall 本地。

**Non-Goals（本次不做）:**
- 手机号一键登录 / 微信 `getPhoneNumber`（个人主体不可用）。
- 账号合并/绑定：微信 openid 与既有账密账号不关联。
- 头像昵称回写、`session_key` 存储与依赖、`unionid` 依赖。
- 多小程序支持（不为 openid 引入 provider/appid 维度）。

## Decisions

- **机制：静默 openid 登录（`wx.login → jscode2session`）**。个人主体下唯一免密路径。备选 `getPhoneNumber` 已被主体约束排除（ADR 0012 记录）。
- **端点 `POST /auth/wechat-login`，DTO 仅 `{ code }`**。置于既有 `CustomerAuthController`，落点与 `/auth/login` 一致。
- **扩展 `CustomerAuthService` 新增 `wechatLogin(code, reqInfo)`**，token 发放经新增私有方法 `issueSession(customerId, meta)` 收敛（internal seam：TTL 解析 → genAT → genRT → store → 组装，login/refresh/wechatLogin 三处唯一装配点；refresh 的「撤销旧 RT」轮换策略留在 refresh 自身）。备选独立 `WechatAuthService` 会造成发放逻辑重复，弃用。顺手删除 module 中 `'2h'` 死默认，TTL 单一事实来源留在 service。
- **微信换取层：mall 自有 `WechatCode2SessionClient`**（可注入、返回纯值、失败抛错），**用 Node 内置 `fetch`**（Node 18+/NestJS 11 自满足，零依赖）调 `https://api.weixin.qq.com/sns/jscode2session`。备选 `@nestjs/axios`+axios 增加依赖，弃用。归属 mall（微信是 mall 专属认证基础设施；core 仅保留跨端共用的 session，参照现有 SessionStore 入 core 而微信换取不跨端）。
- **换取只用 `openid`，不存/不依赖 `session_key`**；`errcode != 0` 或 `openid` 为空 → 抛 `UnauthorizedException`，Controller 统一 401，话术不泄露微信内部细节。
- **建号字段**：`username` 取自 `wechat-identity.ts` 纯函数 `wechatUsernameCandidates(openid)` 的候选序列（`wx_<后12位>` → 追加更长 openid → 末尾短 hash），service 逐候选试 `findUnique`，撞了取下一个、耗尽则 500；`password` 用同文件 `wechatPlaceholderPassword()` 生成 `'!wx-login:' + randomBytes hex` 再经 `bcrypt.hash(placeholder, 10)` 落库存**bcrypt 占位哈希**（`bcrypt.compare` 对未知明文返回 false → 账密登录 401、非抛错），保持列非空、零迁移；`nickName = '微信用户'`；`status='enabled'`、`deletedAt=null`；`unionid` 留空。`wechat-identity.ts` 放 mall customer-auth 模块内（微信是 mall 专属关注点，不入 @gvray/domain），纯函数分支直测、不进 CONTEXT.md（实现概念非领域词条）。
- **幂等并发建号**：先按 `openid` 查 → 未命中 `create`；捕获唯一索引冲突（Prisma P2002）→ 重查改为登录。保证并发首次登录只建一次、只登录一次。
- **限流**：端点加 `@Throttle({ default: { limit: 10, ttl: 60000 } })`，与 `/auth/login` 同级、仅 IP 级，不做账户级锁定（延续 CONTEXT.md 中 ADR 0011 既定认证限流哲学）。
- **客户端信息提取收敛**：`@gvray/core` 新增纯函数 `resolveClientIp(headers)`（可信头顺序单一事实来源），mall 本地 `@ClientInfo()` 参数装饰器为其薄 adapter（返回 `{ ip, userAgent }`）；login/wechat-login 消费装饰器，删除 controller 内 12 行猎取器与手写 `CustomerRequest` 类型。同链现存 4 处重复（mall controller、admin auth.service、core 两 interceptor 且后两者为截短版），admin 与 core interceptor 的迁移**不在本次范围**（截短→全量是日志行为实质变化），留独立后续 change。`extractAccessTokenJti` 单消费端，本次不动。
- **配置**：mall 本地 `registerAs('wechat')`（`WECHAT_APPID`/`WECHAT_SECRET`），仿 jwt.config.ts。不从 core 消费（微信凭据仅 mall 用）。

## Risks / Trade-offs

- **单一 `openid` 唯一、默认绑单小程序** → 未来接第二个小程序会撞 `Customer.openid @unique`。→ 缓解：ADR 0012 记录该取整；届时再加 `wxAppId` 列并改复合唯一索引。
- **`session_key` 不落库** → 将来若要加新的微信能力（如客服消息解密、手机号验证），需重建换取逻辑。→ 缓解：`WechatCode2SessionClient` 已是一致 seam，扩展点收敛于此。
- **个人主体静默登录不验身份证/手机号** → 风控仅 IP 级，身份锚定到微信 openid。→ 缓解：与 ADR 0011「仅 IP 级、不锁账户」一致；建号客户无密码，降低账密泄露面。
- **微信换取是外部 HTTP 出站** → 偶发超时/限流。→ 缓解：换取层设超时并以微信 errcode 归一为 401/统一话术；不在 handler 暴露网络细节。
- **`wx_` 前缀用户名被极端占用/碰撞** → 建号失败。→ 缓解：唯一冲突回退链（追加更长 openid / 短 hash）+ P2002 兜底。

## Migration Plan

- 纯逻辑新增，**无 schema 变更、无数据迁移**。
- 需在部署环境补充 `WECHAT_APPID` / `WECHAT_SECRET`；mall 运行环境确保可出站 HTTPS 到 `api.weixin.qq.com`。
- 回滚：移除新端点/Service 方法与会话发放即可，不影响既有账密认证（default 前置，无破坏性）。
- 文档：本 change 归档后同步 AGENTS/部署相关配置说明（deployment.md 的 env 清单），并新增 ADR 0012。

## Open Questions

无（设计阶段已收敛）。