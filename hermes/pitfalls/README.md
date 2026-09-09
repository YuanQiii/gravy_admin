# Pitfalls — 踩坑记录

已发生问题、根因与规避动作。按领域分组，均附满足 AGENTS.md 规范的规避写法。**不要硬记文件，记根因与处置。**

---

## 1. Docker / 部署

- **[P1] entrypoint 脚本 CRLF 导致容器 exit 127**。Docker entrypoint scripts 必须使用 **LF 行尾**；CRLF 会触发 `/bin/sh: line N: $'\r'` 或 exit 127。→ 提交前核对行尾。
- **[P2] Redis host 误设为 `localhost`**。应用容器内必须用 Redis 容器名（如 `redis`）而非 `localhost`，否则连不上 Redis 容器。→ 见 [docker-compose.dev.yml](../docker-compose.dev.yml)。
- **[P3] 端口映射重启不生效**。改动端口后仅 `restart` 可能不生效，需**强制重建容器**（数据在 volumes，不影响）。否则代理/连接异常。
- **[P4] compose 注释 service 却留子元素**。注释掉 service 块（如 `app:`）但 `build:` 等子元素未一并注释 → YAML 解析错误。注释要整块。
- **[P5] 容器冒烟需挂对网络 + Redis host**。冒烟测试需把应用容器 join 到 dev compose 网络（如 `gvray_nest-dev`），并把 `REDIS_HOST` 指向 dev redis 容器名；否则应用能起但 Redis 刷 `client error`、`/health` 失败。

## 2. 数据库 / 迁移 / 启动引导

- **[P6] 生产绝不可 `prisma db push`**。会造成不可恢复 schema 变更。schema 演进唯一正道：`prisma migrate dev`（开发）生成 + 应用，生产 `migrate deploy`。
- **[P7] 运行时也需要 `schema.prisma`**。曾误判"运行时不需要 schema.prisma"——`prisma migrate deploy` 需读 schema 来解析 provider 与 migration path。生产镜像必须同时含 `prisma/migrations` + `schema.prisma`。
- **[P8] 基线 `migrate diff --script` 无差异时输出空迁移注释**。漂移检测必须 strip `-- This is an empty migration.` 注释，再把剩余 trimmed 输出当漂移信号，否则误报有漂移。
- **[P9] 新鲜库重建的校验计数**。计数须含 `_prisma_migrations`：期望 = 业务表数 + 1（如 31 + `_prisma_migrations` = 32），验证 `0_init` 基线完整重建无漂移。
- **[P10] COPY 白名单后要验镜像载荷**。`docker run --rm --entrypoint sh IMG -c "ls ..."` 确认 `dist/scripts/db-bootstrap.js`、`prisma/migrations`、`schema.prisma` 在，且 `prisma/scripts`、`prisma/backups` 不存在。
- **[P11] 跨平台 spawn Prisma CLI**。必须 `node node_modules/prisma/build/index.js`（经 `process.execPath` 前缀），勿用 shell/`.cmd` launcher——Windows 会 ENOENT/EINVAL。

## 3. 日志 / 可观测性

- **[P12] 结构化 vs 人类可读**。生产 JSON 结构化、开发 pretty-print（nestjs-pino）。
- **[P13] 敏感字段脱敏**。`password`/`authorization`/`token` 用 pino `redact.paths` 统一脱敏，单一来源 [sensitive-keys.constant.ts](../src/shared/constants/sensitive-keys.constant.ts)。
- **[P14] request id 被自增覆盖**。主处理用 pinoHttp `genReqId`；`RequestIdMiddleware` 作兜底防数字自增类 id 覆盖（从 `x-request-id` 取，缺失生成 UUID）。关联 id 读者用 `req.id`。
- **[P15] access log 与 exception log 去重**。成功在 access log（info/慢附 body）、失败只在 error log 带 stack，`HttpExceptionFilter` 不再重复记，避免一条请求被记两次。

## 4. 认证 / 权限 / 缓存 / B2C

- **[P16] koa-connect ctx leak**。koa-connect 包装导致 ctx 泄漏。原生 Koa middleware 实现，勿用 koa-connect。
- **[P17] 权限缓存失效覆盖不全**。权限集合变更的所有路径都要失效，用统一反向查找入口 `invalidateUsersByPermissionIds`，fail-closed，且仅变更 name/description 不失效。
- **[P18] 后台侧对 customer token 的拒绝是隐式边界**。后台 `JwtStrategy` 要求 `roleKeys`+`status`，customer token 缺这两者故被 401 排除——但这是**隐式**的。若未来 customer token 出现 `roleKeys/status`，后台防线失效。收敛后台 JwtStrategy 到 `authenticateByRealm` 时**必须加显式 `realm=='user'`**（ADR 0009 标签的安全项，勿丢）。
- **[P19] 登录 401 常因 seed 未执行**。"账号不存在"更像数据没入库而非逻辑错。先确认 seed（`pnpm prisma:seed`）再怀疑认证逻辑。
- **[P20] PowerShell 里构造 JSON body 要转义**。用 `ConvertTo-Json` 正确构造请求体，否则 400。
- **[P21] 密码校验触发 400 而非 401**。短密码被 DTO `@MinLength`/校验拦下返回 400 属正常；服务层真正的密码错误才是 401。踩坑点：先排查 DTO 校验再断言认证语义。

---

## 约定：每进一个新坑
追加一条，写清 **症状 → 根因 → 规避**，并链接源码/ADR。中文、收敛、可执行。