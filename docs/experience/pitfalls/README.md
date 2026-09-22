# Pitfalls — 踩坑记录

已发生的问题、根因与规避写法。**不要硬记文件，记根因与处置。** 每条写「症状 → 根因 → 规避」，并链接源码 / ADR。

> **编号不连续是正常的**：被机制取代的条目已退休、只对某类任务有用的条目已迁出（部署 / 排查类在 [docs/deployment.md](../../deployment.md) 的故障排查节）。按约定，一条经验一旦被 `.gitattributes`、lint 规则或测试覆盖，就删掉它并在提交信息里记一行"已由 X 取代"——只增不减的库最后没人读。

---

## 1. 数据库 / 迁移 / 启动引导

- **[P7] 运行时也需要 `schema.prisma`**。曾误判"运行时不需要它"——`prisma migrate deploy` 需读 schema 来解析 provider 与 migration path。生产镜像必须同时含 `prisma/migrations` + `schema.prisma`。
- **[P8] 基线 `migrate diff --script` 无差异时输出空迁移注释**。漂移检测必须 strip `-- This is an empty migration.` 注释，再把剩余 trimmed 输出当漂移信号，否则误报有漂移。
- **[P9] 新鲜库重建的校验计数要含 `_prisma_migrations`**。期望 = 业务表数 + 1（如 31 + 1 = 32），据此验证 `0_init` 基线完整重建无漂移。
- **[P10] COPY 白名单后要验镜像载荷**。`docker run --rm --entrypoint sh IMG -c "ls ..."` 确认 `dist/scripts/db-bootstrap.js`、`prisma/migrations`、`schema.prisma` 在，且 `prisma/scripts`、`prisma/backups` 不在。
- **[P11] 跨平台 spawn Prisma CLI**。必须 `node node_modules/prisma/build/index.js`（经 `process.execPath` 前缀），勿用 shell / `.cmd` launcher——Windows 会 ENOENT / EINVAL。

## 2. 日志 / 可观测性

- **[P12] 结构化 vs 人类可读**。生产输出 JSON、开发 pretty-print（nestjs-pino）。
- **[P14] request id 被自增覆盖**。主处理用 pinoHttp `genReqId`；`RequestIdMiddleware` 作兜底防数字自增类 id 覆盖（从 `x-request-id` 取，缺失则生成 UUID）。关联 id 读者用 `req.id`。

## 3. 认证 / 权限 / 缓存

- **[P16] koa-connect ctx leak**。koa-connect 包装会导致 ctx 泄漏——用原生 Koa middleware 实现，勿用 koa-connect。
- **[P17] 权限 / 资源缓存失效覆盖不全**。失效若只散落在各变更方法内，新增变更路径极易漏：`permissions-scanner` 软删除权限后不失效缓存，已登录用户会在 TTL（1h）内继续持有已下线权限码 → 已下线接口仍可访问。**收口做法**：在缓存服务提供统一的「按权限反查受影响用户」入口（权限 → 角色 → 用户，`invalidateUsersByPermissionIds`），并在**所有**权限集变更点（含扫描器）调用；角色 / 用户级已有精确失效（`invalidateRole` / `invalidateUser`）则保留。反查入口要 fail-closed（空输入 / Redis 不可用 / 无关联时 no-op 返回 0，不抛异常），返回受影响数量供日志观测。**边界**：缓存只存权限码，`permissions.service.update` 仅改 `name`/`description` 不改 `code`，故不产生失效窗口——需显式注释声明，防被误判为"新的遗漏"而盲目补失效。
- **[P18] 后台侧对 customer token 的拒绝是隐式边界**。后台 `JwtStrategy` 要求 `roleKeys` + `status`，customer token 缺这两者故被 401 排除——但这是**隐式**的。若未来 customer token 带上 `roleKeys/status`，后台防线失效。收敛后台 `JwtStrategy` 到 `authenticateByRealm` 时**必须加显式 `realm == 'user'`**（ADR 0009 标注的安全项，勿丢）。
- **[P20] PowerShell 里构造 JSON body 要转义**。用 `ConvertTo-Json` 正确构造请求体，否则 400。

## 4. 重构与收敛（改代码前读）

- **删死代码前先 grep 归零**。`grep -rn "\.methodName(" apps/ packages/` 确认调用方归零，而非凭"名字很像"判断；删除后再 grep 一次，并保留同族现役 API 避免误删。`touchSession` / `heartbeat` / `paginateWithResponse` 曾看似在用，实为零调用。
- **分清"管理面"与"执行面"**。"建模了却永不生效"的抽象要拆开看：`DataScopeService` 的分配 / 查询方法真实在用，但其强制执行方法（`getUserDataScope` / `buildDataScopeQuery`）grep 为零调用、且业务表无 `departmentId` 可过滤——属自包含死代码，直接删除而非标注保留，并在 `CONTEXT.md` 声明"记录型元数据、未接入查询"为显式边界。
- **同一语义的键 / 常量多处字面量必然分叉**。`'auth:sessions:'` 曾各写一处；提取单一常量后，以「业务代码中裸字面量仅存常量定义一处」为验收。
- **筛选逻辑不要双重维护**。Prisma `where` 与 raw SQL `conditions` 各自维护同一筛选（尤其 keyword），改一处漏一处。收敛为单一来源纯函数（`buildWeightedConditions`），列表与 count 共享，单测断言参数化与注入安全。
- **增改返回结构时不要在多处手写投影**（会漏字段：`assignRoles` / `removeRoles` 响应曾缺 `description`）。收敛为统一 select 常量（`USER_RESPONSE_SELECT`）+ 单一 helper；列表用专用瘦 select 控制负载。
- **"某逻辑散落 N 处"这类断言先 grep 核实再动手**。案例：据称"权限码解析散落 3 处"，grep 后只有 `permissions-scanner.service.ts:254` 一处是真 `module:resource:action` 解析，另 3 处 `.split(':')` 属 `token.service.ts` 的 session/jti 键解析，语义不同。
- **下沉共享抽象前做"一个消费者 vs 两个消费者"测试**。仅 1 处真实消费时（如权限码解析）倾向 YAGNI 就地保留；≥2 处同语义才下沉。
- **提取共享解析时锁定自洽约束**：契约定义码固定 3 段，解析应显式取段，而非 `parts[len-1]/[len-2]` 端索引——后者对 4 段以上的码会把 action 误当 resource。
- **特权判定收敛**：散落多处内联 `roleKey === SUPER_ROLE_KEY` 时，先 grep 核实调用点清单（5 处）再收敛为纯函数 `isSuperAdminOf(roleKeys)`。其输入是"角色码数组"（由 `extractRoleKeys(userRoles)` 生成，或取自 JWT），语义 fail-closed（空 / 缺省返回 false）。
- **守卫内"运行时旁路"信号必须取自已验签的 JWT 角色码**，而非 DB / 缓存——才能做到零额外查询且不要求权限码完整；且旁路判定必须放在任何缓存 / DB 访问**之前**。测试需补"super-admin 缺失权限码仍放行"并断言 cache / DB 零访问。
- **纯重构（`skip_specs`）的验收**：既有单测全绿 + 重灾区接口 e2e 逐字通过 + 交叉 grep 归零。触碰重灾区（如 equipment 匿名域 27 例 e2e）时单测覆盖不全，必须把 e2e 逐字通过设为完成门槛。
- **归档 / 提交前先跑 `prettier`**，避免格式噪音混入重构 commit。

## 5. 已声明为边界（勿顺手做）

- filters / catalogs 存在与 equipment 同款的 B2C 筛选双重维护，应作独立变更收敛。
- `remove()` 未失效权限缓存是**有意非目标**（JWT 生命周期问题，另立变更跟踪 JWT 撤销联动）。此处只记"这是有意的"；状态与复核方式见 [AGENTS.md](../../../AGENTS.md) 的「已知缺陷与待确认」。

---

## 约定：每进一个新坑

追加一条，写清 **症状 → 根因 → 规避**，并链接源码 / ADR。中文、收敛、可执行。
