# Proposal: sink-infra-findall-and-dead-code-seams

> 架构评审（2026-08-28）候选 3 + 4 + 5。纯重构：删除已确认无调用方的死代码，修复两处维护性硬编码/重复实现。行为零变更，无 delta specs（`skip_specs: true`）。

## Why

同一份评审在 UsersService 之后还识别出三处已量化的浅层摩擦，其中两处是"确认死亡的代码仍在维，产生噪音与误读成本"，一处是 B2C 加权排序路径内同段筛选以两种形态重复维护、存在未来漂移风险：

1. **TokenService 死代码 + 硬编码键前缀**：`touchSession`（标注 `@deprecated`）与 `heartbeat` 两方法在 `src/` 全仓无任何调用方，且与现役 `touchSessionByJti` 逐字重写同一段逻辑（续期 RT Hash / sessionsSet 的 TTL）。`getAllOnlineUserIds` 用硬编码字符串 `'auth:sessions:*'` 做 SCAN 模式，而项目其余 redis key 全部经 `RedisKeys.auth.sessionsSet(...)` 常量生成——模式与常量是同源同构，散落一处即可漂移。
2. **BaseService 分页死代码**：`paginateWithResponse` / `paginateWithSortAndResponse` 两方法全仓无调用方（现役调用只经 `paginateWithSort`，`getPaginationState` 直接内联分页）。它们独占 `ResponseUtil.paginated` 与 `PaginationResponse` 的 import 依赖。
3. **Equipment B2C findAll 双重筛选实现**：`findAll` 先按 Prisma 形态构建 `where`（含 `applyVisibility` 强制 status），随后 B2C 分支 `findAllWithWeightedSort` 再把同一批筛选**逐字段重推导**为 raw SQL `conditions`。同一筛选由两处维护：新增一个 query 参数需同步改 `where` 与 `conditions` 两处，漏一处即列表与 count 结果不一致。

## What Changes

- **TokenService 移除死代码**：删除 `touchSession`（含 `@deprecated`）与 `heartbeat`；保留 `touchSessionByJti`（session-heartbeat.interceptor 在用）。
- **TokenService 修复 Redis key 硬编码**：`getAllOnlineUserIds` 的 SCAN 模式从 `'auth:sessions:*'` 改为由 `RedisKeys.auth.sessionsSet` 同源派生（新增只读前缀常量，或复用现常量），消灭模式字符串漂移。
- **BaseService 移除死代码**：删除 `paginateWithResponse` 与 `paginateWithSortAndResponse`；同步移除因此不再使用的 `ResponseUtil` import 与 `PaginationResponse` import。保留 `paginate` / `paginateWithSort` / `getPaginationState`（分别在用或内部调用）。
- **Equipment findAll 筛选单一化**：B2C 加权路径的 raw `conditions` 与 `findAll` 的 Prisma `where` 收敛为单一筛选来源——`findAllWithWeightedSort` 由构建好的 `where` 经**一处**映射产出 `conditions`，mapping 集中，新增字段只改一处。行为（过滤结果、翻页 total、排序）仍与现状逐字一致。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——纯重构，无 spec 级行为变更，`.openspec.yaml` 设置 `skip_specs: true`）

## Impact

- **代码**：
  - `src/modules/auth/token.service.ts`（删 2 方法；键前缀与常量同源）
  - `src/modules/system/online-users/online-users.service.ts`（核对 `getAllOnlineUserIds` 调用点签名不变，无需改动）
  - `src/shared/services/base.service.ts`（删 2 方法 + 2 个已失效 import）
  - `src/modules/equipment/equipment/equipment.service.ts`（findAll 筛选来源单一化）
  - 可选：`src/redis/constants/redis-key.constant.ts`（新增 sessions 前缀只读常量）
- **测试**：上述文件的 spec 同步核对；equipment e2e（`test/equipment-anonymous.e2e-spec.ts` 27 例）应逐字通过，证明 B2C 筛选/排序行为不变；BaseService/TokenService 无独立单测则不新增 mock。
- **不影响**：API 路由/Swagger、权限码、DTO 结构、错误码语义、数据库 schema、部署配置、前端。`session-heartbeat.interceptor`、auth/online-users 的现役调用路径均不受影响。