## 1. 微信配置注入

- [x] 1.1 在 mall 本地新建 `wechat.config.ts`，用 `registerAs('wechat')` 读 `WECHAT_APPID` / `WECHAT_SECRET`（仿 packages/core/src/config/jwt.config.ts）——验证：文件存在，`pnpm test` 通过

- [x] 1.2 在 `apps/mall/src/app.module.ts` 的 `ConfigModule` 注册项加入 `wechat` 配置——验证：应用可启动，`pnpm build` 通过

- [x] 1.3 依据部署文档（.agents/project/deployment.md）在样例 env / compose 补充 `WECHAT_APPID` / `WECHAT_SECRET`——验证：环境变量清单已更新

## 2. 微信换取层

- [x] 2.1 新建 `wechat-code2session.client.ts`（mall 自有 deep-seam），注入 `ConfigService`，用 Node 内置 `fetch` 调 `jscode2session` 并设超时——验证：`wechatLogin` 单元测试 mock 该 client 且通过

- [x] 2.2 客户端返回纯值 `{ openid }`；`errcode != 0` 或 `openid` 为空时抛 `UnauthorizedException`（不泄露微信细节）——验证：对应单测覆盖失败分支

- [x] 2.3 在 `CustomerAuthModule` 注册 `WechatCode2SessionClient` 为 provider——验证：模块 provider 列表含该 client

## 3. 建号与登录服务逻辑

- [x] 3.1 前置收敛：在 `CustomerAuthService` 内提取私有 `issueSession(customerId, meta: CustomerSessionMetadata): Promise<CustomerTokenResult>`（TTL 解析 → genAT → genRT → storeRefreshToken → 组装），login/refresh 改为调用它；顺手删除 module 中 `'2h'` 死默认（TTL 单一事实来源留在 service）——验证：现有 `customer-auth.service.spec.ts` 全部通过（行为零变化）

- [x] 3.2 在 `CustomerAuthService` 新增 `wechatLogin(code, reqInfo)`，注入并调用 wechat client，入股 `openid` 未命中则幂等建号（先查、`create`、捕获 P2002 重查），最后调 `issueSession` 发放——验证：服务单测覆盖命中/未命中/并发三条路径

- [x] 3.3 新建 `apps/mall/src/modules/customer-auth/wechat-identity.ts` 两个纯函数：`wechatUsernameCandidates(openid): string[]`（按序产出 `wx_<后12位>` → 追加更长 openid → 短 hash 候选）与 `wechatPlaceholderPassword()`（`'!wx-login:' + randomBytes hex`）——验证：候选顺序与长度分支的直测单测通过

- [x] 3.4 `wechatLogin` 通过 `issueSession` 发放令牌（禁止第三份 TTL/签发/组装装配），响应结构与 `login` 一致（realm customer）——验证：`wechatLogin` 单测断言响应结构与 `login` 对齐，且不重复解析 TTL

## 4. 端点到公开接口

- [x] 4.0 在 `@gvray/core` 新增纯函数 `resolveClientIp(headers)`（可信头顺序单一事实来源，经 barrel 导出）；mall 本地新增 `@ClientInfo()` 参数装饰器（其上的薄 adapter，返回 `{ ip, userAgent }`）——验证：纯函数单测覆盖头顺序回退与 `::1` 归一化，装饰器可注入使用

- [x] 4.1 新建 DTO `wechat-login.dto.ts`（仅 `code`，Swagger 中文描述，`@IsString`/`@IsNotEmpty`）——验证：文件存在且与既有 DTO 风格一致

- [x] 4.2 在 `CustomerAuthController` 新增 `POST wechat-login` 端点，`@Throttle 10/min/IP`（与 login 同级），`@ApiOperation`/`@ApiResponse` 中文描述，`ResponseUtil.success` 返回；同时用 `@ClientInfo()` 改造既有 `login` 端点并删除 controller 内 `getClientIp` 与手写 `CustomerRequest` 类型（`extractAccessTokenJti` 本次不动，单消费端不抽接缝）——验证：`pnpm build` 通过，Swagger 呈现该端点，controller 无 IP 猎取逻辑

- [ ] 4.3 规范联调：openid 命中→复用 customerId；换取出错→401 统一话术；端点不产生 audit 写（mall 无 OperationLog）——验证：端到端冒烟（curl）符合 specs 各 Scenario

## 5. 测试与文档

- [x] 5.1 为 `wechatLogin` 补齐单元测试（命中登录、未命中建号、换取失败 401、并发幂等、禁用/软删拒登、占位密码不可账密登录）——验证：`pnpm test` 全部通过

- [ ] 5.2 提交 PR；归档后按流程同步 `openspec/specs/customer/auth/spec.md`——验证：`openspec instructions specs --change --json` 与比对通过

- [x] 5.3 新增 ADR 0012 记录个人主体约束→静默 openid 登录取舍、只建新号、username/password 占位约定、单小程序不引入 provider 维度、微信换取层归 mall——验证：docs/adr/0012-\*.md 已创建

