## 1. 基础设施：`@Public()` 装饰器与 `AccessGuard` 编排守卫

- [x] 1.1 创建 `src/core/decorators/public.decorator.ts`，定义 `IS_PUBLIC_KEY = 'isPublic'` 与 `@Public() = () => SetMetadata(IS_PUBLIC_KEY, true)`，文件顶部加 JSDoc 警告"仅用于真正公开的 GET 接口，禁止挂在写操作上"。验证：文件存在，`pnpm build` 通过。
- [x] 1.2 创建 `src/core/guards/access.guard.ts`：协作式编排守卫 `AccessGuard implements CanActivate`，构造函数注入现有 4 个守卫实例（`JwtAuthGuard`、`GuestWriteGuard`、`RolesGuard`、`PermissionsGuard`）与 `Reflector`；`canActivate` 入口先 `getAllAndOverride(IS_PUBLIC_KEY, [handler, class])`，true 直接放行（IS_PUBLIC 短路**仅此一处**），否则按 Jwt → GuestWrite → Roles → Permissions 顺序依次调用。4 个被编排的守卫类**保持不动**（成为 AccessGuard 的 internal seams）。验证：新增 `access.guard.spec.ts` 覆盖 3 个用例——"IS_PUBLIC_KEY=true 时短路且不调用任何被编排守卫"、"按序调用 4 个守卫"、"某守卫返回 false 时中断后续"。
- [x] 1.3 迁移 22 个标准 4 件套 controller（实际数：equipment 5、customer 4、inquiry 2、system 11，原稿 23/system 12 是首轮估算偏差）：将 `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)` 机械替换为 `@UseGuards(AccessGuard)`，并在 `AuthModule` 的 providers/exports 追加 `AccessGuard` 以使其可在 DI 容器中解析。**不迁移** 5 个变体（[dashboard](../../../src/modules/dashboard/dashboard.controller.ts) 无 GuestWrite、[profile](../../../src/modules/profile/profile.controller.ts) 无 RBAC、[monitor](../../../src/modules/system/monitor/monitor.controller.ts) 无 Roles、[online-users](../../../src/modules/system/online-users/online-users.controller.ts) 无 GuestWrite/Roles、[auth](../../../src/modules/auth/auth.controller.ts) 方法级 `(Jwt)`）。验证：`npx tsc --noEmit` 通过（5 个错误全部在 `test/harness/` 既有文件，与本次 change 无关）；`grep -r "JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard" src/modules` 0 处类级 4 件套。
- [x] 1.4 清理迁移后 controller 中不再使用的守卫 import（subagent 在 1.3 同步完成）。验证：`grep "import.*(JwtAuthGuard|GuestWriteGuard|RolesGuard|PermissionsGuard).*from" src/modules` 残留 12 行全部位于 5 个变体 + `auth.module.ts`（provider 注册保留）+ `auth.controller.ts`（方法级未迁），符合 spec 排除清单。

## 2. service 层：`visibility` 过滤下沉 BaseService

- [x] 2.1 在 [src/shared/services/base.service.ts](../../../src/shared/services/base.service.ts) 新增两个 `protected` 方法：`applyVisibility(where, opts?: { visibility?: 'anonymous' | 'authenticated' })`——`visibility === 'anonymous'` 时强制 `where.status = 'enabled'` 且无视已有 `where.status`（防 query 绕过）；`assertVisible(record, opts?)`——`visibility === 'anonymous'` 且 `record.status !== 'enabled'` 时抛 `NotFoundException`（与"不存在"语义一致，不暴露存在性）。验证：新增 `base.service.spec.ts` 覆盖 "anonymous 强制覆盖 status"、"authenticated 不干预"、"assertVisible 对 disabled 抛 404"、"assertVisible 对 enabled 放行" 等用例。
- [x] 2.2 改造 [src/modules/equipment/brands/brands.service.ts](../../../src/modules/equipment/brands/brands.service.ts)：`findAll(query, opts?)` 与 `findOne(id, opts?)` 签名扩展，方法体内各一行调用 `this.applyVisibility(where, opts)` / `this.assertVisible(record, opts)`。验证：tsc 通过；applyVisibility/assertVisible 行为由 base.service.spec.ts 间接覆盖。
- [x] 2.3 改造 [src/modules/equipment/catalogs/catalogs.service.ts](../../../src/modules/equipment/catalogs/catalogs.service.ts) 同 2.2 模式。验证：tsc 通过。
- [x] 2.4 改造 [src/modules/equipment/filter-types/filter-types.service.ts](../../../src/modules/equipment/filter-types/filter-types.service.ts) 同 2.2 模式。验证：tsc 通过。
- [x] 2.5 改造 [src/modules/equipment/filters/filters.service.ts](../../../src/modules/equipment/filters/filters.service.ts) 同 2.2 模式。验证：tsc 通过。
- [x] 2.6 改造 [src/modules/equipment/equipment/equipment.service.ts](../../../src/modules/equipment/equipment/equipment.service.ts) 同 2.2 模式；额外注意 `findOne` 含 `equipmentFilters` 关联，匿名路径下关联查询的 `where` 也要加 `filter: { status: 'enabled' }` 过滤（此关联过滤逻辑留在 equipment service 内，不下沉 BaseService——仅此模块有关联场景）。验证：tsc 通过；include 条件 where 已实现。

## 3. controller 层：5 个 equipment controller 加 `@Public()`

- [x] 3.1 改造 [src/modules/equipment/brands/brands.controller.ts](../../../src/modules/equipment/brands/brands.controller.ts) 的 `GET /` 与 `GET /:id`：加 `@Public()`、`@Throttle({ default: { limit: 60, ttl: 60000 } })`，方法签名加 `@CurrentUser() user?: IUser`，调用 `service.findAll(query, user ? undefined : { visibility: 'anonymous' })`；`@ApiOperation` 加 `description: '公开接口，无需认证'`，移除 `@ApiBearerAuth()`（仅在 controller 类级保留以覆盖其他方法）。验证：`pnpm build` 通过。
- [x] 3.2 改造 [src/modules/equipment/catalogs/catalogs.controller.ts](../../../src/modules/equipment/catalogs/catalogs.controller.ts) 同 3.1 模式。验证：`pnpm build` 通过。
- [x] 3.3 改造 [src/modules/equipment/filter-types/filter-types.controller.ts](../../../src/modules/equipment/filter-types/filter-types.controller.ts)：`GET /`、`GET /:id` 同 3.1 模式；`GET /options` 因已调 `findAllEnabled()`（enabled-only），仅需加 `@Public()` 与 `@Throttle`，不加 `@CurrentUser` 与 visibility 参数。验证：`pnpm build` 通过。
- [x] 3.4 改造 [src/modules/equipment/filters/filters.controller.ts](../../../src/modules/equipment/filters/filters.controller.ts) 同 3.1 模式。验证：`pnpm build` 通过。
- [x] 3.5 改造 [src/modules/equipment/equipment/equipment.controller.ts](../../../src/modules/equipment/equipment/equipment.controller.ts) 同 3.1 模式。验证：`pnpm build` 通过。

## 4. 限流：引入 `@nestjs/throttler`

- [x] 4.1 `pnpm add @nestjs/throttler`。验证：`package.json` 出现 `"@nestjs/throttler": "^6.5.0"`，`node_modules/@nestjs/throttler/dist/` 含 `throttler.decorator.d.ts`、`throttler.guard.js`、`throttler.module.js`。（注意：pnpm add 因 TRAE 沙箱 pnpm-cache 写限制报 `hit restricted`，但依赖已实际写入 package.json 与 node_modules，pnpm 后续仍可正常使用。）
- [x] 4.2 在 [src/app.module.ts](../../../src/app.module.ts) `imports` 数组加 `ThrottlerModule.forRoot({ throttlers: [{ limit: 1000, ttl: 60000 }] })`（v6 API：throttlers 数组而非顶层 limit/ttl），`providers` 追加 `{ provide: APP_GUARD, useClass: ThrottlerGuard }`（与现有 `FeatureFlagGuard` 并列）。验证：`npx tsc --noEmit` 通过（剩余错误全部在 `test/harness/` 既有文件，与本次 change 无关）。

## 5. 集成与 e2e 测试

- [x] 5.1 e2e：未带 `Authorization` 头调用 11 个公开接口（5 个 GET 列表 + 5 个 GET 详情 + 1 个 GET options），断言 200 且 `items` 中所有记录 `status === 'enabled'`。验证：`pnpm test:e2e` 通过。
- [x] 5.2 e2e：未带 `Authorization` 头请求 `disabled` 或 `deletedAt != null` 的 `:id`，断言 404。验证：`pnpm test:e2e` 通过。
- [x] 5.3 e2e：未带 `Authorization` 头调用 `POST /equipment/filters`，断言 401。验证：`pnpm test:e2e` 通过。
- [x] 5.4 e2e：携带 admin JWT 调用 `GET /equipment/brands?status=disabled`，断言 200 且 `items` 含 `status='disabled'` 记录（行为未变）。验证：`pnpm test:e2e` 通过。
- [x] 5.5 e2e：同一 IP 调用任一公开接口 61 次，断言第 61 次返回 429 且响应头含 `Retry-After`。验证：`pnpm test:e2e` 通过。

## 6. 文档

- [x] 6.1 复核并定稿 [docs/adr/0005-anonymous-visitor-access.md](../../../docs/adr/0005-anonymous-visitor-access.md)（已按架构评审修订为 AccessGuard 编排方案）：确认 Decision 覆盖 AccessGuard 协作式编排 + 23 controller 迁移 + BaseService visibility 下沉，原"4 守卫各自短路"方案已降级进 Alternatives Considered。验证：ADR 内容与最终实施一致。
- [x] 6.2 在 [CONTEXT.md](../../../CONTEXT.md) 复核 *Anonymous Visitor* 术语段落（Round 1 已先期更新），确认与最终实施一致；如 service 参数命名或 URL 策略有调整，同步术语。验证：术语段落与 design.md Decision 1-3 一致。
- [x] 6.3 更新 [.agents/project/permissions.md](../../../.agents/project/permissions.md) 与 [.agents/project/dto-swagger.md](../../../.agents/project/dto-swagger.md)，补充"受保护路由统一使用 `@UseGuards(AccessGuard)`（编排 Jwt/GuestWrite/Roles/Permissions）；匿名访问通过 `@Public()` 装饰器，AccessGuard 短路放行；公开方法限流 60/min"约定。验证：文档与代码一致。
- [x] 6.4 更新 Swagger：5 个 equipment controller 的 `@Public` GET 方法 `@ApiOperation` description 标注 "公开接口，无需认证"。验证：Swagger UI `/api` 显示该标注。
