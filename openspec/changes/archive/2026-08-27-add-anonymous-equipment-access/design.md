## Context

当前所有 equipment 子模块 controller 在类层级挂 `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)`，无任何匿名访问通道。`JwtAuthGuard` 仅是 `extends AuthGuard('jwt')`（[jwt-auth.guard.ts](../../../src/core/guards/jwt-auth.guard.ts)），无元数据短路；`GuestWriteGuard`、`RolesGuard`、`PermissionsGuard` 假设 `request.user` 存在，匿名调用时会因读取 `user.roles` / `user.permissions` 抛错或拒绝。守卫组合现状（grep 事实）：标准 4 件套 23 处（equipment 5、customer 4、inquiry 2、system 12），刻意差异化变体 5 处（dashboard 无 GuestWrite、profile 仅 Jwt+GuestWrite、monitor 无 Roles、online-users 仅 Jwt+Permissions、auth 方法级 6 处仅 Jwt）——守卫顺序这个隐含不变量由 23 处调用点共同背诵，守卫链是 shallow 拼接。5 个 service 的 `findAll(query)` 默认 `where.deletedAt = null` 但**不**默认按 `status='enabled'` 过滤；`findOne(id)` 只按 id 查、仅排除 `deletedAt`，不检查 `status`——意味着直接复用现有 service 给匿名用会暴露 disabled/draft 记录。`@CurrentUser` 装饰器直接 `return request.user`，匿名场景返回 `undefined` 不抛错。`filter-types.service.ts` 已有 `findAllEnabled()` 方法（用于 `options` 下拉）作为匿名实现的字段精简参考，但其本身返回原始行不做 DTO 转换（违反 AGENTS.md，不在本轮修）。`main.ts:67` 有 TODO 提到 ThrottlerModule + Redis Store 限流，当前未实现任何限流。See [proposal.md](proposal.md) for motivation.

## Goals / Non-Goals

**Goals:**

- 让 5 个 equipment 子模块的 GET 接口（列表 + 详情 + options）对未登录访客开放
- 匿名调用强制只看 `status='enabled' AND deletedAt=null`，登录调用行为完全不变
- 守卫改造可复用——未来若需给其他模块（如 inquiry）开匿名，沿用同一 `@Public()` 装饰器机制
- 顺手收敛守卫链 shallowness：23 处 4 件套 `@UseGuards` 收敛为单一 `AccessGuard`，守卫顺序不变量从 23 处背诵集中到 1 处（架构评审候选 A，deletion test 通过）
- visibility 过滤逻辑收敛 BaseService（架构评审候选 B）：匿名可见性规则一处实现、全模块生效
- 引入应用层限流最低防护，防爬虫拖库
- URL 不变（原地复用 `/equipment/*`），登录用户与前端无感知迁移

**Non-Goals:**

- 不删除 `guest` 角色 / `GuestWriteGuard` / `AllowGuestWrite` / `feature.guestAccount` 配置（独立 change 处置）
- 不实现 Throttler Redis store（内存 store 过渡，Redis 推迟）
- 不开放匿名询盘提交（涉及反垃圾、数据归属、风控，独立 change）
- 不引入专用 public DTO（复用现有 `*ResponseDto`）
- 不给 `inquiry`/`customer`/`system`/`profile`/`dashboard` 模块开匿名
- 不实现 Customer 登录机制（CONTEXT.md 仍标记为 future）
- 不修复 `filter-types.service.ts:findAllEnabled` 返回原始行的既有问题

## Decisions

### Decision 1: `@Public()` 装饰器 + 协作式编排守卫 `AccessGuard`（公开路由仅尝试 Jwt，吞错放行）

新增 `src/core/decorators/public.decorator.ts`：

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

新增 `src/core/guards/access.guard.ts`——协作式编排守卫：

```ts
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly guestWriteGuard: GuestWriteGuard,
    private readonly rolesGuard: RolesGuard,
    private readonly permissionsGuard: PermissionsGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 公开路由：仅尝试运行 JwtAuthGuard 以填充 request.user，
      // 失败（无 token / 无效 token）被吞掉，访客以匿名身份放行。
      // 其余 3 个守卫不调用——匿名场景没有 user.roles/permissions 可读。
      // controller 通过 @CurrentUser() user? 判断 user 是否存在即可切换
      // service 的 visibility 行为（登录用户在公开路由上行为不变）。
      try {
        await this.jwtAuthGuard.canActivate(context);
      } catch {
        return true;
      }
      return true;
    }

    // 受保护路由：守卫顺序不变量集中在此（原由 23 处 controller 背诵）
    for (const guard of [this.jwtAuthGuard, this.guestWriteGuard, this.rolesGuard, this.permissionsGuard]) {
      if (!(await guard.canActivate(context))) return false;
    }
    return true;
  }
}
```

同时将 23 个标准 4 件套 controller 的 `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)` 机械替换为 `@UseGuards(AccessGuard)`。4 个被编排守卫类**保持不动**，各自既有单测保留——它们成为 AccessGuard 的 internal seams（deep module 内部由小零件组成，零件不进 interface）。调用方 interface 从"4 个类名 + 顺序语义"收敛为"1 个类名 + `@Public()`/`@RequirePermissions()` 元数据装饰器"。

**命名 `AccessGuard` 而非 `AdminRouteGuard`**：这道 seam 承载认证、RBAC、匿名放行三重语义，"Access" 不偏向任何一端；equipment 目录路由加 `@Public` 后不再是纯 admin 路由，`AdminRouteGuard` 会在那里撒谎。

**迁移范围**：仅 23 处标准 4 件套（纯机械替换，行为零变化）。5 个变体（dashboard/profile/monitor/online-users/auth）**不迁移**——守卫组合的差异化是有语义的 interface 决策（profile 是自身资料操作无 RBAC；dashboard 只读监控），强行统一会改变行为。

**Why this over alternatives:**

- **Alternative A: 4 个守卫各自在 `canActivate` 加 IS_PUBLIC 短路**（原方案）—— ❌ 同一段短路逻辑 + 单测重复 4 处；守卫链 shallowness（interface = 4 类名 + 顺序）原样保留。架构评审候选 A 否决。
- **Alternative B: 吞并式——把 4 个守卫逻辑全部搬进一个类并删除原文件** —— ❌ `PermissionsGuard` 有重依赖（Prisma + Redis permission-cache），搬家全部单测成本高；协作式让它们保持 internal seams，各自的测试面不变。
- **Alternative C: 独立 `PublicController`（`src/modules/public/`）** —— ❌ 路由分裂为 `/public/equipment/*`，前端/Swagger 两套 URL；无法解决 service 行为分支问题。首轮 grilling 已否决。
- **Alternative D: 全局 `APP_GUARD` 替换** —— ❌ 触达全部 33 处 `@UseGuards`（含 5 个刻意变体），且变体的差异化组合会被抹平。scope 过大。
- **Alternative E: 仅改造 `JwtAuthGuard` 跳过，其他守卫不动** —— ❌ `RolesGuard`/`PermissionsGuard` 在 `request.user` 为空时读 `user.roles`/`user.permissions` 会抛 TypeError 或 403，必须 4 项检查一起跳过。
- **Alternative F: 公开路由完全短路，不调用任何守卫（首轮实施尝试）** —— ❌ controller 通过 `@CurrentUser() user?` 切换 `visibility` 时，`request.user` 永远 `undefined`，登录用户在公开路由上也被当匿名访问，违反 spec "登录调用路径 SHALL 维持现有行为不变"。实施 5.4 e2e 测试时暴露此设计疏漏，修订为"公开路由仅尝试 JwtAuthGuard、吞错放行"。

**Cost**: 新增 1 个守卫文件 + 4 个单测用例（公开短路吞错、公开 Jwt 成功、按序调用、守卫中断）；23 处机械替换；`FeatureFlagGuard` 保持全局 APP_GUARD 不变（其 seam 在"所有路由含无守卫路由"，与编排守卫正交）。

### Decision 2: service 加 `visibility` 参数，过滤实现下沉 `BaseService`

5 个 equipment service 的 `findAll` 与 `findOne` 签名扩展（interface 决策不变）：

```ts
async findAll(query: QueryXxxDto, opts?: { visibility?: 'anonymous' | 'authenticated' }): Promise<...>
async findOne(id: string, opts?: { visibility?: 'anonymous' | 'authenticated' }): Promise<...>
```

- 默认 `visibility === 'authenticated'`，保持现有行为（仅 `deletedAt=null`，不强制 `status`）
- `visibility === 'anonymous'` 时：`findAll` 强制 `where.status = 'enabled'`（无视 `query.status`，防绕过）；`findOne` 取到记录后若 `status !== 'enabled'` 抛 `NotFoundException`（与现有"不存在"语义一致，不暴露存在性）

**实现位置（架构评审候选 B 采纳）**：过滤逻辑不下沉到每个 service 各写一遍，而是收敛到 [BaseService](../../../src/shared/services/base.service.ts) 两个新 `protected` 方法：

```ts
protected applyVisibility(where: Record<string, unknown>, opts?: VisibilityOpts): void
// visibility==='anonymous' 时强制 where.status='enabled'（覆盖已有值）

protected assertVisible(record: { status: string }, opts?: VisibilityOpts): void
// visibility==='anonymous' 且 record.status!=='enabled' 时抛 NotFoundException
```

5 个 service 方法体内各一行调用 `this.applyVisibility(where, opts)` / `this.assertVisible(record, opts)`。规则改动（如未来 anonymous 也要排除某种 status）改 BaseService 一处即全模块生效——locality。唯一例外：equipment.service 的 `findOne` 关联 `equipmentFilters` 过滤留在该 service 内（仅此模块有关联场景，不下沉）。

Controller 调用约定：

```ts
@Get()
@Public()
async findAll(@Query() query: QueryFilterTypeDto, @CurrentUser() user?: IUser) {
  const result = await this.svc.findAll(query, user ? undefined : { visibility: 'anonymous' });
  return ResponseUtil.paginated(result, '...');
}
```

**Why this over alternatives:**

- **Alternative A: 5 个 service 各自内联写 visibility 分支**（原方案）—— ❌ 同两段逻辑重复 10 处；5 个 `findAll` 本就互为拷贝，再叠一层分支。架构评审候选 B 否决。
- **Alternative B: controller 内 `if (!user) query.status='enabled'` 后调原 `findAll`** —— ❌ 直接违反 AGENTS.md "业务逻辑放 Service"；且 `findOne` 没有 query 参数，此方案对 `findOne` 无效。
- **Alternative C: 5 个 service 各加 `findAllPublic` + `findOnePublic` 共 10 个新方法** —— ❌ DRY 受损，90% 逻辑与原方法重复，维护负担大。
- **Alternative D: service 读 `request.user` 自行判断** —— ❌ service 不应依赖 HTTP 上下文，违反分层。

**Cost**: BaseService 新增 2 个 `protected` 方法 + 4 个单测用例；5 个 service 各改 2 个方法签名、各加 1 个匿名场景单测。对 BaseService 其他子类零影响（方法为 `protected` 且可选参数）。

### Decision 3: URL 原地复用，不加 `/public/` 前缀

匿名访客与登录用户走完全相同的 URL（如 `/equipment/filters/:id`），按 `Authorization` 头存在与否切换 service 行为分支。

**Why:** 同一 URL 对不同身份暴露不同视图是 REST 语义正确的常态（参考 GitHub `/repos` 公开/私有差异）。加 `/public/` 别名会导致同一资源两套路由，前端切换成本高。Q10 grilling 已决议。

**Trade-off:** 新人首次见"`/equipment/filters` 既能匿名又能鉴权访问"会困惑——由 ADR-0005 + Swagger 描述弥补。

### Decision 4: `@nestjs/throttler` + 内存 store 过渡

引入 `@nestjs/throttler` 依赖，全局 `APP_GUARD` 追加 `ThrottlerGuard`（与现有 `FeatureFlagGuard` 并列）。`ThrottlerModule.forRoot({ limit: 1000, ttl: 60000 })` 设全局默认；公开 GET 方法上挂 `@Throttle({ default: { limit: 60, ttl: 60000 } })` 收紧。

**Why this over alternatives:**

- **Alternative A: 本轮就上 Redis store** —— ❌ 增加部署依赖（Redis 必须可用），且 [project_memory](../../../) 提到 Redis host 配置易踩坑；推迟到后续独立 change。
- **Alternative B: 仅 nginx/Cloudflare 网关层限流** —— ❌ 应用层无防护不专业；多实例部署时网关与实例解耦后行为不一致。

**Trade-off:** 多实例部署时内存 store 各自计数，限流不精确（同一 IP 在 N 个实例上可发 N×60 次）——已知风险，Redis 后续补。

### Decision 5: 复用现有 `*ResponseDto`，不新建 public DTO

5 个模块的响应 DTO 已通过 `@Exclude()` 排除自增 `id`，且**不含**敏感字段（无成本价、库存、内部备注、审计字段 `createdById`/`updatedById`；`filters.annb`/`bynb`/`gencode` 经 Q5a grilling 确认为产品技术参数非敏感；`compatibility` JSON 全量暴露是 B2C 适配查询的核心目的）。

**Why:** 新建 `PublicEquipmentResponseDto` 等专用 DTO 是过度工程——5 个模块都要复制 DTO 文件，且字段集与现有 DTO 完全一致，仅多一层 `@Exclude` 装饰。匿名路径的"信息泄露"防护由 Decision 2 的 `status='enabled'` 过滤保证（不返回 disabled 记录），而非靠 DTO 字段裁剪。

## Risks / Trade-offs

- **[Risk] `@Public()` 误用导致非预期接口开放** → Mitigation: 装饰器文件加 JSDoc 警告 "仅用于真正公开的 GET 接口，禁止挂在写操作上"；code review 关注；可选加 ESLint 规则禁止 `@Public()` 与 `@Post`/`@Patch`/`@Delete` 同方法共存（本轮不强加）。
- **[Risk] 23 处 controller 迁移引入回归** → Mitigation: 纯机械字符串替换（同一 4 件套 → `AccessGuard`），顺序语义在编排守卫内保持原序；e2e 验证登录路径行为未变；`grep` 验证无残留 4 件套。
- **[Risk] 协作式编排守卫的顺序错误**（如误调 Roles 在 Jwt 前，`request.user` 尚未填充） → Mitigation: `access.guard.spec.ts` 显式断言调用顺序；ADR 记录顺序不变量。
- **[Risk] 内存限流多实例不一致** → Mitigation: 已知；ADR 记录；后续 Redis 补丁；部署文档注明"多实例下限流为 N×配额"。
- **[Risk] 匿名访客通过 query 参数绕过 status 强制** → Mitigation: service 在 `visibility='anonymous'` 路径**无视** `query.status` 直接覆盖为 `'enabled'`，且不暴露 service 内部行为给客户端。
- **[Risk] 公开接口暴露内部业务规模（如总记录数 total）** → Mitigation: 接受。`total` 字段是分页必需，暴露目录总量在 B2C 场景无敏感性（与"商品总数公开"语义一致）。
- **[Trade-off] 同一 URL 行为随 token 变化** → 接受。新人困惑由 ADR-0005 + Swagger 描述弥补。
- **[Trade-off] `filter-types.service.ts:findAllEnabled` 既有违反 AGENTS.md 问题未修** → 接受。本轮 scope 聚焦匿名访问，既有问题留待独立重构。

## Migration Plan

1. **增量上线**：URL 不变，登录用户与前端无感知；匿名能力是新增能力，无 BREAKING。AccessGuard 迁移本身对 23 处调用方行为零变化（同序编排）。
2. **回滚策略**：移除 5 个 controller GET 方法上的 `@Public()` 装饰即关闭匿名访问（AccessGuard 短路不再触发）；如需完整回滚守卫编排，将 23 处 `@UseGuards(AccessGuard)` 还原为 4 件套字符串即可（纯机械逆替换）。service `opts` 参数与 BaseService 方法为可选/protected，回滚后无调用方仍可工作。
3. **部署顺序**：先合并 AccessGuard + 23 处迁移（向后兼容、行为零变化），再合并 BaseService visibility + service 签名扩展（可选参数，零影响），最后挂 `@Public()` 装饰器 + ThrottlerGuard 激活匿名访问。可分 3 个 PR 上线，降低爆炸半径。
4. **配置开关**：可选——通过 `FeatureFlagGuard` 给匿名访问加 `@FeatureFlag('anonymousEquipmentAccess')` 开关，部署后管理员可一键关闭（参照 `@FeatureFlag('register')` 模式）。本轮**不强制**实现，作为可选项由实施者判断。

## Open Questions

无——grilling 阶段（Round 1-3）已穷尽所有 material ambiguity。
