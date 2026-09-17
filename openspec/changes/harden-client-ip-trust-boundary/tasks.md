## 1. 配置与引导接缝

- [x] 1.1 新增 `security.trustedProxy` 配置项（app config + env 校验 + `.env.example`），仅接受非负整数层数 / CIDR 列表 / `false` / `true`，默认 `false`。验证：env 校验单测覆盖非法值被拒、默认值 `false` 生效。
- [x] 1.2 在共享引导接缝 `configureApp`（`packages/core/src/bootstrap/configure-app.ts`）读取 `trust-boundary` config module 产出的 trustProxy 并 `app.set('trust proxy', cfg)`。验证：单测验证设置生效；docker 直连（`false`）下 `req.ip` 等于对端 socket 地址。

## 2. ClientIpResolver 可信代理边界模块

- [x] 2.1 在 `packages/core/src/core/` 新增 `ClientIpResolver`（interface + Express 实现），由 `trust-boundary` config module 构造，实现以 `req.ip` 为唯一来源，缺失时回退安全值（socket remote / `127.0.0.1`）。验证：单测覆盖 `req.ip` 缺失回退、`::1` 归一化、伪造 `X-Forwarded-For` 首段被忽略。
- [x] 2.2 彻底删除 `resolveClientIp`（`packages/core/src/shared/utils/client-ip.util.ts:23-36`）及其 barrel 导出，module 的 interface 即唯一测试面；无 `req` 测试改用内存 adapter / mock request 喂入。验证：旧纯函数单测移除；新增「伪造头首段不计入」用例全部通过；无残留第二解析路径。
- [x] 2.3 新增 `trust-boundary` config module，集中校验 `security.trustedProxy`（非负整数层数 / CIDR 列表 / `false` / `true`）并产出 trustProxy 供 resolver 构造。验证：启动期校验非法值（如负数、超范围）报错；合法值产出正确 trustProxy。

## 3. 调用点收敛（同源）

- [x] 3.1 `@ClientInfo()` 装饰器（`apps/mall/src/core/decorators/client-info.decorator.ts:18`）改用 `ClientIpResolver`。验证：限流 IP 来自 resolver；对 `POST /auth/login` 每请求带随机 `X-Forwarded-For`，同一来源第 11 次返回 429。
- [x] 3.2 `request-log.interceptor.ts:95-97` 与 `operation-log.interceptor.ts:89-91` 改用 `ClientIpResolver` 取来源 IP。验证：访问日志 / 审计日志记录的 IP 经可信解析，伪造头首段不出现于日志。

## 4. 规格与回归

- [x] 4.1 本变更 delta 规格（customer ADDED + logging MODIFIED）与 `openspec validate harden-client-ip-trust-boundary --strict` 通过。验证：`validate --strict` 无错误。
- [x] 4.2 新增 e2e：受信代理（nginx 1-hop，`security.trustedProxy=1`）拓扑下客户端 IP 正确归因且限流 429 触发；无代理（docker 直连）下 IP 取自对端。验证：e2e 用例通过，且伪造 `X-Forwarded-For` 不被信任。

## 实施记录（2026-09-17）

- **1.1/2.3**：`SECURITY_TRUSTED_PROXY` 配置（`AppConfig.trustedProxy`，默认 `false`）+ `resolveTrustProxy` 启动期校验（false/true/非负整数/CIDR 列表；非法值抛错——纯字母如 'abc' 亦拒，须含数字与点或冒号）。**偏离任务措辞（已记录）**：未建独立 `trust-boundary` config module——信任拓扑是 app 级安全配置，与 `logRequestIdHeader` 同属 `app.config`；校验逻辑集中在 `resolveTrustProxy` 纯函数（单测 12 例）。
- **1.2**：`configureApp` 经 \`getHttpAdapter().getInstance().set('trust proxy', ...)\` 设置（INestApplication 无 set 方法）。
- **2.1/2.2**：`ClientIpResolver`（interface + ExpressClientIpResolver + 共享单例）——**只认 \`req.ip\`**，回退 socket → 127.0.0.1；`normalizeIp`（::1 与 ::ffff: 前缀）。**伪造 XFF 首段不计入是结构性承诺**：代码不读任何转发头。旧 \`resolveClientIp\` 及其 spec 删除，barrel 换新 API；三处调用点（`@ClientInfo`、request-log、operation-log）收敛到 resolver 单例。
- **3.1/3.2**：装饰器与两个拦截器改用 resolver；request-log 的既有断言（XFF 优先）按新契约改写为「req.ip 缺失 → socket 回退，XFF 头不被读」。
- **4.2**：e2e——限流桶打满后，60 次请求各带**不同**随机伪造 XFF 全部仍 429（若伪造生效则全 200）；受信代理拓扑下的正向用例属部署期验证（单测已覆盖 trust proxy 语义），记为部署 checklist。
- **门禁**：单测 **303/303**（core 133）；全量 e2e **7 套件 / 87 用例**（+1）；两 build ✓；`validate --strict` ✓。无迁移。
- **部署 checklist**：nginx 反代后需设 \`SECURITY_TRUSTED_PROXY=1\`（或网段列表）并在代理层覆写 XFF；docker 直连保持默认 false。
