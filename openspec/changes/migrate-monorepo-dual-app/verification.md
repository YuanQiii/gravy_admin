# Verification — migrate-monorepo-dual-app

逐条对照本变更 6 个 delta specs 的场景自检。结论：**全部通过**。
证据统一来自：步骤 4-6 实现 + `pnpm test`（145 用例）/ `pnpm test:e2e`（43 用例）+ 双镜像容器级冒烟 + 结构性核验（lint 依赖方向 / 镜像 payload）。

## workspace（双应用工作区契约）

| Requirement | 场景 | 结果 | 证据 |
|---|---|---|---|
| 双应用独立部署 | Mall 重启不影响 Admin | ✅ | 步骤 5/6 双生产镜像独立容器，各端口独立；启动互不影响 |
| 双应用独立部署 | Admin 端口不暴露 Mall 路由 | ✅ | admin 镜像不含 mall 树（payload 校验），容器 admin 端口拉 `/filters` 404 |
| 双应用独立部署 | 各自独立 API 文档 | ✅ | admin `/api` 与 mall `/api` 各自容器 200，Swagger 标题 `GVRAY Mall API` 独立 |
| 依赖方向约束 | 应用源码互不引用 | ✅ | D7 lint `no-restricted-imports` 负向测试 + `grep` 无跨 app import；packages 不 import apps |
| 依赖方向约束 | Mall 消费共享领域服务 | ✅ | mall browse controllers 只 import `@gvray/domain` 的 services/DTOs |
| 限流独立核算 | Mall 流量饱和不挤占 Admin | ✅ | 双应用独立 `ThrottlerModule`（e2e + 容器） |
| 限流独立核算 | Mall 公开浏览限流保持 60/min | ✅ | `equipment-anonymous.e2e-spec.ts` 61st→429 + `Retry-After`；容器安防 `X-RateLimit-Remaining:59` |
| 横切按应用挂载 | Mall 匿名请求不产生审计写 | ✅ | 容器冒烟：匿名 `/filters`/`/equipment` 前后 `operation_logs` 75→75 |
| 横切按应用挂载 | Mall 请求不触发功能开关查询 | ✅ | mall app.module 未挂 FeatureFlagGuard（D8 结构校验） |
| 横切按应用挂载 | Admin 审计行为不变 | ✅ | admin 保留 OperationLogInterceptor 全横切 |

## b2c/browse（Mall 公开浏览）

| 场景 | 结果 | 证据 |
|---|---|---|
| 匿名访客浏览滤清器列表 | ✅ | e2e `GET /filters` 200，仅 enabled、page 结构正确 |
| 匿名访客请求禁用记录 | ✅ | e2e `GET /filters/:id` disabled→404 |
| 已登录客户与匿名行为一致 | ✅ | 共用 `MALL_OPTS`（migration 后改名）强制 enabled + 加权排序 |
| B2C 浏览写操作被拒 | ✅ | `POST /filters` 401/404（e2e） |
| 加权排序生效（忽略 sortBy） | ✅ | e2e weighted sort 用例 |
| B2C 浏览限流触发 | ✅ | 60/min → 429 + Retry-After |
| 后台路径不再公开 | ✅ | e2e 匿名 `GET /equipment/filters` → 401（admin 工厂） |
| 后台登录用户行为不变 | ✅ | e2e admin token → 200，`?status=disabled` 可筛选 |

## customer/auth（客户认证）

场景依据 `CustomerAuthService` 既有逻辑（迁移仅剥前缀 `customer/auth`→`auth`，行为不变）：登录（用户/邮箱/电话 + bcrypt、401 统一话术、disabled/deleted 拒登）、refresh 轮换、logout 撤销——均由 `customer-auth.service.spec.ts` / `customer-token.service.spec.ts` 单元覆盖；`customer-jwt.strategy.spec.ts` 覆盖 realm 校验；e2e 覆盖未登录 401 与身份注入 400。

| Requirement | 关键场景 | 结果 | 证据 |
|---|---|---|---|
| 客户密码登录 | 按用户名/邮箱登录成功 | ✅ | 单元（逻辑）+ 路由 `POST /auth/login` 存在（容器日志路由映射） |
| 客户密码登录 | 密码错误 / 禁用已删拒登 | ✅ | 单元 `customer-auth.service.spec.ts` |
| 刷新访问令牌 | 有效/已撤销 refresh | ✅ | 单元 `customer-token.service.spec.ts` |
| 客户登出 | 登出后 refresh 401 | ✅ | 单元 + ADR 0009 易失会话 |

## customer（客户自助收货地址）

场景（新增默认地址事务置其他默认 false / 更新他人地址 404 / 删默认不迁移 / 未登录 401 / 声明身份字段 400）由 `customer-addresses.service.spec.ts`（原 B2C self 域）+ `b2c-customer.e2e-spec.ts`（401、400 forbidNonWhitelisted、他人地址防泄露 404）覆盖。

## inquiry（客户自助询价）

场景（已注册客户提交、选收货地址、未登录 401、身份字段 400、本人列表/详情、他人询价 404、客户无法直接提交）由 `inquiries.service.spec.ts` + `b2c-customer.e2e-spec.ts` 覆盖；mall `mall-inquiries.controller.ts` 仅暴露 POST + GET（无状态 PATCH），结构上杜绝客户直接提交流转。

## schema-migrations（生产迁移）

| 场景 | 结果 | 证据 |
|---|---|---|
| 生产启动时应用迁移 | ✅ | admin 容器 entrypoint → `db-bootstrap` 实测 `migrationApplied=true`（migrate deploy） |
| Mall 容器不执行 schema 同步 | ✅ | mall 镜像 payload 无 `migrations`/`schema.prisma`，入口直接 exec CMD（容器冒烟 /health 200） |
| 缺失迁移目录时即失败 | ✅ | 共享 `bootstrapDatabase` fail-closed 逻辑（`bootstrap.spec.ts` 单元）；prisma/migrations 缺失 → 非零退出 |
| 生产绝不使用 db push | ✅ | `bootstrapDatabase` 无 `db push` 分支（ADR 0007/0008，单元 + 结构核验） |

## 结论

`openspec validate "migrate-monorepo-dual-app"` → **valid**。6 个 delta specs 全部场景自检通过。