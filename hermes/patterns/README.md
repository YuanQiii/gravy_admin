# Patterns — 工程模式

可复用的架构不变量与深模块骨架。每条 = 一句话用途 + 关键形状 + 指向既有先例。**改到对应面时先读这里。**

---

## 1. 深模块 & 薄适配器

- **模式**：把"大而具体的机制"放进接口小、实现大的深模块；业务模块变成薄适配器，只传数据/声明，不承载机制逻辑。
- **先例**：
  - 加权排序 → `runWeightedSort(prisma, spec)`（[weighted-sort.ts](../src/modules/equipment/weighted-sort.ts)），service 只留字段权重表/conditions/count thunk。
  - 热门排序 → `rankHotBrands(brands, deviceCounts, limit)`（[hot-ranking.ts](../src/modules/equipment/brands/hot-ranking.ts)），纯函数、零 prisma，排序不变量单点。
  - Redis 会话 → `SessionStore` 深接缝（`store/verify/revoke(subjectId, token, meta, ns)`），`TokenService`/`CustomerTokenService` 是薄适配器，realm 差异收敛在适配器。
  - 结构化日志 → `src/logging/`、数据库引导 → `src/bootstrap/`（DI、可测，CLI 薄 adapter）。
- **判别（何时建 / 何时是"假设接缝"）**：机制被多个消费者复用才下沉；只有一个消费者→假设接缝，缓做（见 ADR 0009 中 `authenticateByRealm` 案例）。

## 2. 纯函数排序 & 三层稳定兜底

- **模式**：排序规则从 I/O 抽成纯函数（输入数据+map+limit → 有序输出），可脱离 prisma 直接单测；业务方法只做选题（query+聚合），不复述排序逻辑。
- **稳定兜底**：同分值用 `createdAt` 兜底保证翻页/多次请求稳定。
  - weighted: `weightedScore desc → sortOrder desc → createdAt desc`
  - hot: `hotOrder asc (null → MAX_SAFE_INTEGER, 等 NULLS LAST) → deviceCount desc → createdAt desc`，标记段恒在未标记段前，合并后 `slice(0, limit)`。
- **先例**：[rankHotBrands](../src/modules/equipment/brands/hot-ranking.ts)、[runWeightedSort](../src/modules/equipment/weighted-sort.ts)。

## 3. B2C 可见性三分流（写一次、多服务继承）

- **模式**：`VisibilityOpts = 'anonymous' | 'b2c' | 'admin'`；`B2C_VISIBILITIES = ['anonymous','b2c']`，一律 `includes()` 判断浏览域。`applyVisibility(where, opts)` 注入 `status='enabled'`（覆盖调用方 status，防 `?status=disabled` 绕过），`assertVisible(record, opts)` 对非 enabled 抛 NotFound。规则写在 `BaseService` 一次，子 service 一行调用。
- **先例**：[base.service.ts](../src/shared/services/base.service.ts#L66)、[isB2cVisibility](../src/shared/services/base.service.ts)。

## 4. 协作编排守卫（浅变深）

- **模式**：多守卫顺序不变量从 N 个调用点收敛进一个编排守卫 `AccessGuard`（注入 Jwt/GuestWrite/Roles/Permissions 按序调用）；`@Public()` 路由只 attempt Jwt 填充 `request.user`，其余守卫跳过。守卫作为编排器内部 seam 保留各自单测。
- **先例**：[access.guard.ts](../src/core/guards/access.guard.ts)、ADR 0005。

## 5. 认证域隔离（realm / namespace）

- **模式**：不同身份域用**命名空间**与**守卫互斥**隔离。Redis token 用前缀 ns（`user` vs `customer`）；各自 Guard 只认各自 token 的 realm；`JwtService` 复用但 payload 字段域相关（`userId` vs `customerId`）。
- **风险边界**：后台对 customer token 的拒绝若只靠"缺 roleKeys/status"是隐式防线，收敛时补显式 `realm=='user'` 校验（ADR 0009 安全项）。
- **先例**：[SessionStore] / [CustomerTokenService](../src/modules/customer/customer-auth/customer-token.service.ts)。

## 6. DTO 包络过滤（不泄漏自增 id / 敏感字段）

- **模式**：Service 返回前 `plainToInstance(ResponseDto, raw, { excludeExtraneousValues: true })` 控制结构；自增 `id`/审计/敏感列用 `@Exclude` 或直接不进 DTO。公开响应只暴露业务 UUID（`brandId`）与外发字段（如热门品牌列表不含 `isHot/hotOrder` 运营字段）。
- **先例**：[brand-response.dto.ts](../src/modules/equipment/brands/dto/brand-response.dto.ts)、[hot-brand-response.dto.ts](../src/modules/equipment/brands/dto/hot-brand-response.dto.ts)。

## 7. 权限码域 & 只读/写分离

- **模式**：权限码用 `definePermission()` 注册常量（`{module}:{resource}:{action}`），seed 自动纳入；菜单种子手动绑定。写接口收敛专用端点（如 `POST /hot-status`）由 `update` 权限守卫，普通 CRUD 不承载该资源专属字段；读状态作为 `view` 权限载体放进既有响应 DTO。
- **先例**：[permissions.constant.ts](../src/shared/constants/permissions.constant.ts)、[menus.ts](../prisma/seeds/menus.ts)。