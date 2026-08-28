# Tasks: sink-infra-findall-and-dead-code-seams

> 依赖顺序：先死代码与键前缀（候选 3/5，纯删除，零交叉），再 equipment 筛选单一化（候选 4，触碰 27 例 e2e），最后全局归零验证。纯重构，验证以既有单测全绿 + 交叉 grep 归零 + equipment e2e 全绿为准。

## 1. TokenService 死代码 + 键前缀同源（候选 3）

- [x] 1.1 删除 `src/modules/auth/token.service.ts` 的 `touchSession`（@deprecated）与 `heartbeat` 两方法，保留 `touchSessionByJti`;`grep -rn "\.touchSession\b\|\.heartbeat(" src/` 归零、`tsc --noEmit` 通过
- [x] 1.2 在 `src/redis/constants/redis-key.constant.ts` 新增并 export 模块级常量 `AUTH_SESSIONS_KEY_PREFIX = 'auth:sessions:'`，`RedisKeys.auth.sessionsSet` 复用它;`token.service.getAllOnlineUserIds` 的 SCAN 模式改用 `${AUTH_SESSIONS_KEY_PREFIX}*`;确认 `'auth:sessions:'` 字面量全仓仅剩常量定义一处

## 2. BaseService 分页死代码（候选 5）

- [x] 2.1 删除 `src/shared/services/base.service.ts` 的 `paginateWithResponse` 与 `paginateWithSortAndResponse` 两方法;`grep -rn "paginateWithResponse\|paginateWithSortAndResponse" src/` 归零、`tsc --noEmit` 通过
- [x] 2.2 移除因此失效的 `ResponseUtil` 与 `PaginationResponse` 两个 import（`PaginationDto`/`PaginationSortDto` 保留）;`tsc --noEmit` 通过且无未用 import 告警（eslint 收窄 base.service.ts）

## 3. Equipment B2C findAll 筛选单一化（候选 4）

- [x] 3.1 在 `src/modules/equipment/equipment/equipment.service.ts` 新增私有 `buildWeightedConditions(where)`：从 `where` 单向推导参数化 SQL `conditions`（deletedAt → `"deletedAt" IS NULL`;status/brandId/catalogId/engineEnergy 存在即 push;keyword 从 `where.OR` 读出 model/brandName 两项拼 ILIKE）;`findAllWithWeightedSort` 改调用它、不再读 `query.keyword` 直拼;`count()` 仍用同一 `where`;`tsc --noEmit` 通过
- [x] 3.2 行为验证:`pnpm test:e2e` 中 equipment 匿名域 27 例逐字通过（过滤/排序/翻页行为不变），其余 e2e 无新增回归

## 4. 全局验证

- [x] 4.1 交叉 grep 归零：`src/` 内 `'auth:sessions:'`（仅常量）、`paginateWithResponse|paginateWithSortAndResponse`、`\.touchSession\b|\.heartbeat(` 均无残留;确认 auth/online-users 现役调用（`touchSessionByJti`/`getAllOnlineUserIds`/`getUserSessions`/`paginateWithSort`/`getPaginationState`）未被破坏
- [x] 4.2 `pnpm test` 全绿（54 passed）;`tsc --noEmit` 通过;equipment e2e 27 passed;app.e2e 仅剩已记录的历史 GET / 失败
- [x] 4.3 文档同步：如需，CONTEXT.md 技术词汇表记录 Equipment `where→conditions` 单向推导 seam（D4），标注 filters/catalogs 同模式待后续变更