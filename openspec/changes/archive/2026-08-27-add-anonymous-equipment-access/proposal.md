## Why

当前 `equipment/*` 下 5 个子模块（brands、catalogs、filter-types、equipment、filters）的所有 GET 接口都挂在类级 `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)` 上，未登录的 B2C 访客（CONTEXT.md 定义的 *Anonymous Visitor*）调用即被 `JwtAuthGuard` 拦截返回 401。售前流程（查设备用什么滤清器、浏览滤清器目录、选型适配）必须先登录后台 `User` 才能看一眼产品目录，与 B2C 自助浏览的预期不符。`Customer` 登录机制（自注册 / 微信 OAuth）按 CONTEXT.md 仍是 "future"，本次需要在不引入 Customer 登录的前提下，先打通匿名只读浏览通道。

## What Changes

- 新增 `@Public()` 方法装饰器 + `IS_PUBLIC_KEY = 'isPublic'` 元数据键（[src/core/decorators/public.decorator.ts] 待创建）
- 新增协作式编排守卫 `AccessGuard`（[src/core/guards/access.guard.ts] 待创建）：注入现有 4 个守卫（`JwtAuthGuard`、`GuestWriteGuard`、`RolesGuard`、`PermissionsGuard`）按序调用，`IS_PUBLIC_KEY` 短路仅写在编排守卫入口一处；4 个被编排守卫类保持不动（成为 internal seams）
- 23 个标准 4 件套 controller 的 `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)` 机械替换为 `@UseGuards(AccessGuard)`（equipment 5、customer 4、inquiry 2、system 12）；5 个刻意差异化变体（dashboard/profile/monitor/online-users/auth）不迁移
- `BaseService` 新增 `applyVisibility(where, opts)` / `assertVisible(record, opts)` 两个 `protected` 方法；5 个 equipment service 的 `findAll(query, opts?)` 与 `findOne(id, opts?)` 新增可选 `opts.visibility: 'anonymous' | 'authenticated'`（默认 `'authenticated'`，保持现有行为），方法体内一行调用上述共享方法；当 `visibility === 'anonymous'` 时强制 `where.status = 'enabled'`、`where.deletedAt = null`，`findOne` 额外校验记录 `status === 'enabled'` 否则抛 404
- 5 个 equipment controller 的 GET 列表/详情/options 方法加 `@Public()` 装饰；方法签名加 `@CurrentUser() user?: IUser`，按 `user ? undefined : { visibility: 'anonymous' }` 传给 service（仅 `findAll`/`findOne` 路径；`findOptions` 已是 enabled-only，无需 visibility 参数）
- 引入 `@nestjs/throttler` + 内存 store 作为过渡（Redis store 推迟到后续），全局 `APP_GUARD` 加 `ThrottlerGuard`，公开 GET 方法挂 `@Throttle({ default: { limit: 60, ttl: 60000 } })`
- `CONTEXT.md` 已先期更新，新增 *Anonymous Visitor* 术语，明确与 `guest` 角色（已登录的演示 `User`）的边界
- 修订 `docs/adr/0005-anonymous-visitor-access.md`（仍为 Proposed 状态，原稿已按架构评审改写）：记录 AccessGuard 编排方案 vs "4 守卫各自短路" / 独立 `PublicController` / 全局 APP_GUARD 的权衡与决策
- `guest` 角色及相关机制（`GuestWriteGuard`、`AllowGuestWrite`、`feature.guestAccount` 配置）本轮**保留弃用**，不删除（独立改造，留待后续）

## Capabilities

### New Capabilities

（无——本次不引入新的 spec capability 目录，匿名访问是 `equipment` 既有 capability 的行为扩展）

### Modified Capabilities

- `equipment`: 新增 "匿名访客只读访问" Requirement——5 个子模块的 GET 列表/详情/options 接口 SHALL 允许无 JWT 的匿名访客访问，且在匿名调用路径上 SHALL 强制只返回 `status = 'enabled' AND deletedAt IS NULL` 的记录；登录调用路径行为不变

## Impact

- **业务代码**：5 个 equipment controller 的 GET 方法签名变更（加 `@CurrentUser() user?`）、5 个 equipment service 的 `findAll`/`findOne` 方法签名变更（加 `opts?` 参数）
- **基础设施**：新增 `@Public()` 装饰器与 `AccessGuard` 编排守卫 2 个文件；23 个 controller 的 `@UseGuards` 行机械替换；4 个被编排守卫类与 `FeatureFlagGuard`（全局 APP_GUARD）均不动
- **依赖**：新增 `@nestjs/throttler` 与 `express-rate-limit`（throttler 内存 store 依赖）作为运行时依赖
- **全局配置**：`src/app.module.ts` 在现有 `APP_GUARD: FeatureFlagGuard` 之外追加 `APP_GUARD: ThrottlerGuard`；`ThrottlerModule.forRoot(...)` 配置全局默认限流（更宽松，如 1000/min），公开方法用 `@Throttle` 收紧到 60/min
- **API 兼容性**：URL 不变（原地复用 `/equipment/*`），登录用户行为完全不变；新增能力，无 BREAKING
- **文档**：`CONTEXT.md`（已更新）、`docs/adr/0005-anonymous-visitor-access.md`（新增）、Swagger 在公开方法上去掉 `@ApiBearerAuth()` 改为标注 `@ApiOperation(description: '公开接口，无需认证')`
- **测试**：新增 `access.guard.spec.ts`（短路/顺序/中断 3 用例）与 `base.service.spec.ts`（visibility 4 用例）；5 个 service 单测各加 "visibility='anonymous' 时强制 status='enabled'" 用例；e2e 回归 23 处迁移的登录路径行为
- **不在 scope 内**：`inquiry`/`customer`/`system`/`profile`/`dashboard` 模块；匿名询盘提交（涉及反垃圾与归属问题，后续独立 change）；`guest` 角色移除；Throttler Redis store
