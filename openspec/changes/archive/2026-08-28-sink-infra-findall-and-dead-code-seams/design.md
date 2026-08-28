# Design: sink-infra-findall-and-dead-code-seams

> 术语沿用 codebase-design 词汇表（deep module / seam / locality / leverage / deletion test）。动机见 [proposal.md](proposal.md)。

## Context

- **TokenService 死代码**（[token.service.ts](../../src/modules/auth/token.service.ts)）：`touchSession`（L146，标注 `@deprecated 使用 touchSessionByJti 代替`）与 `heartbeat`（L380）为同一段逻辑的两次复制；全仓 `grep` 确认无调用方。现役心跳路径是 `session-heartbeat.interceptor.ts:33` → `touchSessionByJti(jti)`（经 `atJtiMap` 反向索引定位 RT）。两者删去不影响任何调用边。
- **TokenService 硬编码键前缀**：`getAllOnlineUserIds`（L360）用字符串 `'auth:sessions:*'` 做 `scanIterator` 模式；而 `RedisKeys.auth.sessionsSet`（[redis-key.constant.ts:10](../../src/redis/constants/redis-key.constant.ts#L10)）产出 `auth:sessions:${userId}`。二者同源同构，但一个硬编码、一个走常量——迁移/改名时一处漏即 SCAN 匹配不到现役集合。
- **BaseService 分页死代码**（[base.service.ts](../../src/shared/services/base.service.ts)）：`paginateWithResponse`（L230）与 `paginateWithSortAndResponse`（L304）全仓无调用方；它们独占 `ResponseUtil.paginated` 与 `PaginationResponse` 的 import。现役分页调用全部走 `paginateWithSort`（11 处 consumer）或 `getPaginationState` 直接内联；`paginate` 被 `paginateWithSort`/`paginateWithSortAndResponse` 内部复用。
- **Equipment B2C findAll 双重筛选**（[equipment.service.ts](../../src/modules/equipment/equipment/equipment.service.ts)）：`findAll`（L116）构建 Prisma 形态 `where`（deletedAt/keyword→OR/brandId/catalogId/engineEnergy/status + `applyVisibility` 强制 status='enabled'），B2C 分支 `findAllWithWeightedSort`（L163）再把同一批筛选**逐字段重推导**为 raw SQL `conditions`：`where.status/brandId/catalogId/engineEnergy` 各自 push，keyword 则改读 `query.keyword` 直拼 ILIKE。`count()` 用 Prisma `where`，列表用 raw `conditions` → 同一筛选有两份实现，新增 query 参数须同步两处。

## Goals / Non-Goals

**Goals:**

- 删除两处确认死亡的代码（TokenService、BaseService 各 2 个方法）与其因此失效的 import，缩小表面、消除"它在用吗？"的误读成本。
- Redis 键前缀单一来源：`auth:sessions:${userId}` 与 SCAN 模式由同一常量派生，杜绝漂移。
- Equipment B2C 的 Prisma `where` 与 raw `conditions` 收敛为单一筛选来源，列表与 count 不再可能发散。

**Non-Goals:**

- 不改 API 路由、权限码、DTO 结构、错误码语义；不动 `Paginate` 的响应结构。
- 不迁移 filters/catalogs service 里相同的 `where`/`conditions` 双重构建（同模式，但属独立 scope，见 Open Questions）。
- 不重构 `runWeightedSort` 深模块本身（机制不动，只收敛 equipment 侧喂给它的条件来源）。
- 不新增覆盖死代码的"删除测试"单测（删除即无调用方，靠 `grep` 归零验证；equipment 行为靠既有 27 例 e2e 锚定）。

## Decisions

### D1: 删除 TokenService `touchSession` / `heartbeat`

两个均零调用方；`touchSessionByJti` 保留并被 `session-heartbeat.interceptor` 引用。删除后该类心跳收敛为单一方法（删两个 ~35 行的过时副本）。
- 备选：保留 `heartbeat` 作为 `touchSessionByJti` 的非 jti 包装（拒绝——无调用边，纯死码留着只有误读成本）。

### D2: Redis 键前缀单一来源

在 [redis-key.constant.ts](../../src/redis/constants/redis-key.constant.ts) 增加模块级只读常量 `AUTH_SESSIONS_KEY_PREFIX = 'auth:sessions:'`；`RedisKeys.auth.sessionsSet` 改为 `${AUTH_SESSIONS_KEY_PREFIX}${userId}`，并 export 该常量。`token.service.getAllOnlineUserIds` 用 `${AUTH_SESSIONS_KEY_PREFIX}*` 做 SCAN 模式。
- 保证：改名前缀只需改常量一处，`sessionsSet` 与 SCAN 同时生效。
- 备选：在 token.service 内切片 `sessionsSet('')` 前缀（拒绝——`sessionsSet('')` 是误用性的临时值，语义晦涩）；直接复用现字符串而只注释同源（拒绝——仍两处字面量）。

### D3: 删除 BaseService `paginateWithResponse` / `paginateWithSortAndResponse`

两方法零调用方，删除后同步移除 `ResponseUtil` 与 `PaginationResponse`（仅它们使用）两个 import。保留 `paginate`（现役内部层）与 `paginateWithSort`（11 处现役）与 `getPaginationState`（8 处现役）。`PaginationDto`/`PaginationSortDto` import 仍被 `getPaginationState`/`paginateWithSort` 使用，保留。
- 备选：保留这层"统一格式包装"以备复用（拒绝——11 处 consumer 全走 `plainToInstance` 自定义包络，无复用先例，属 speculative generality）。

### D4: Equipment B2C 筛选单一来源（Prisma `where` 为唯一源）

`findAll` 继续只构建一份 Prisma `where`（含 `deletedAt`、keyword→`OR`、brandId/catalogId/engineEnergy/status 与 `applyVisibility`）。`findAllWithWeightedSort` 改为**由 `where` 单向推导** `conditions`，不再读 `query.keyword` 直拼：
- 抽出私有 helper `buildWeightedConditions(where)`：从 `where` 归一化产出参数化 SQL 条件（deletedAt → `"deletedAt" IS NULL`；status/brandId/catalogId/engineEnergy 存在即 push；keyword → 从 `where.OR` 读出两个 `contains` 字段拼 `model/brandName ILIKE`）。
- `count()` 仍用同一份 `where`。→ 列表 `WHERE` 与 `count` 同一来源，新增字段只需改 `findAll` 一处 + helper 映射一处（保持一处可扩展点）。
- keyword 的 Prisma `contains: { mode: 'insensitive' }` 与 SQL `ILIKE` 语义等价，pass-through 保持既有 SQL 不变。
- 行为零变更：既有 27 例 equipment e2e 逐字通过即验收。
- 备选：改为声明式 filter spec 同时产出 `where` 与 `conditions`（拒绝——对两个现有字段集属过度抽象，且改动面大，风险/收益不匹配本变更）；把条件构建下沉进 `runWeightedSort`（拒绝——条件是最脆的注入点，属 equipment 私有知识）。

## Risks / Trade-offs

- [equipment 条件构建重构触碰 27 例 e2e] → 只做"where→conditions"单向归一化，SQL 逐字保持；e2e 全绿为验收门槛；若 e2e 红则回退该 task 单独排查。
- [keyword 从 query.keyword 改读 where.OR 后语义漂移] → `OR` 恒含 model/brandName 两项同 `mode:'insensitive'`，与 ILIKE 等价；helper 显式只取这两项，不泛化。
- [删除 BaseService 方法若某处经 `super.paginateWithResponse` 调用被 grep 漏] → 删除前 `grep -r "paginateWithResponse\|paginateWithSortAndResponse" src/` 归零复核；`tsc --noEmit` 兜底（未定义成员引用即编译错误）。
- [cluster：delete D1 时 `heartbeat` 别名残留] → 删除 `touchSession`/`heartbeat` 后 `grep "\.touchSession\|\.heartbeat(" src/` 归零；`revokeRefreshToken` 等仍在用方法不动。

## Migration Plan

纯代码重构，无部署/数据迁移。回滚 = revert 单个 commit。

## Open Questions

- 是否把 D4 的单一来源模式同步推广到 filters/catalogs 的 `findAllWithWeightedSort`（现为同款双重构建）？——本变更收敛 equipment 一处以最小化触碰面；推广列为独立后续变更，不影响本变更的充分性。