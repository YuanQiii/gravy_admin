# Design: sink-user-mutation-seams

> 术语沿用 codebase-design 词汇表（deep module / seam / locality / leverage / deletion test）。动机见 [proposal.md](proposal.md)。

## Context

- **User 投影现状**：`findUnique + select{userRoles/department/userPositions} + plainToInstance(UserResponseDto)` 的 ~40 行块在 [users.service.ts](../../src/modules/system/users/users.service.ts) 出现 **7 处**（create L227 / findAll L326 / findOne L383 / update L532 / resetPassword L618 / assignRoles L766 / removeRoles L862）。已实证一处**投影漂移**：create/findAll/findOne 的 select 含 `description: true`，而 update/resetPassword/assignRoles/removeRoles 4 处不含——这 4 个端点即使库里有值也返回 `description: undefined`（`UserResponseDto.description` 为 `@Expose()` 可选字段，[user-response.dto.ts:55-58](../../src/modules/system/users/dto/user-response.dto.ts#L55-L58)）。
- **守卫阶梯现状**：`assignRoles`（L707–813）与 `removeRoles`（L816–909）共享前半段：用户回查 → 不能改自己 → `checkSuperAdminHierarchy` → `validateRoleIds`；差异仅在超管专属守卫（授超管权限 vs 保底 2 超管）与关联写入方式。
- **缓存失效现状**：`PermissionCacheService`（[permission-cache.service.ts](../../src/redis/permission-cache.service.ts)，67 行）暴露原始 `set/get/del`。失效调用点共 **7 处 / 3 文件**：users.service 3 处（update-改状态时 L575、assignRoles L808、removeRoles L904）、roles.service 3 处（经私有 `invalidateRoleUserCache` L361/L476/L531，内部查 userRole 后循环 `del`）、online-users.service 1 处（kickUser L102）。
- **附带发现**：`remove()`（L665–）删除用户后**未**失效权限缓存——存量 JWT 在 TTL 内仍可命中旧权限码。

## Goals / Non-Goals

**Goals:**

- User 投影（select 形状 + DTO 转换）与超管守卫阶梯各自收敛为单一私有 seam，删除 7 处复制粘贴中的 6 处（findAll 保留列表自有形状，但复用 select 常量）。
- 权限缓存失效策略意图化：`invalidateUser` / `invalidateRole`，变更路径自失效；`del` 降为内部实现。
- 单测 seam 与接口对齐：投影与守卫阶梯各获得直接单测面，不再经 7 个端点间接验证。

**Non-Goals:**

- 不改 API 路由、权限码、响应 DTO 结构、错误码语义。
- 不迁移 `remove()` 缓存失效缺口（属 JWT 生命周期问题，独立变更处理，见 Risks）。
- 不动 `PermissionsGuard` 的 `set/get` 读路径。
- 不重构 UsersService 其余部分（status 守卫、部门/岗位关联逻辑等仅机械搬移，不改写）。

## Decisions

### D1: `USER_RESPONSE_SELECT` 常量 + `findUserForResponse(userId)` 私有方法

- 模块级私有常量 `USER_RESPONSE_SELECT`（含 `description`，形状 = 单实体回查投影）；`findUserForResponse(userId)` = `findUnique + USER_RESPONSE_SELECT + plainToInstance + null 即 NotFoundException`。
- 5 个单实体站点（create/update/resetPassword/assignRoles/removeRoles/findOne）委托 helper；`findOne` 收缩为单行。回查站点（刚写完必然存在）不受 null 分支影响。
- **列表投影刻意独立**：分页 `findAll` 复用同形状但不含 `description` 的 `USER_LIST_SELECT`（用户决策——列表负载最小化，不必为普通列表多传 description 标量字段）。`description` 仅单实体回查返回。
- **漂移对齐（本变更唯一刻意的可观察行为差异）**：update/resetPassword/assignRoles/removeRoles 4 端点开始返回真实 `description`（修复漂移；保留漂移则 helper 无法收敛，违背重构目的）。e2e/单测同步断言。
- 备选：按站点保留各自 select（拒绝——7 份漂移就是现状病灶）；提公共 base method（拒绝——User 投影是 users 模块私有知识，不应上浮 BaseService）。

### D2: `assertRoleMutationAllowed(userId, currentUserId, roleIds)` 私有方法

收敛共享前半段：用户回查 404 → 不能改自己 → `checkSuperAdminHierarchy` → `validateRoleIds`。两个方法各自保留真实差异：assignRoles 的"非超管不能授超管 + 拆除目标超管需保底 2 个"，removeRoles 的"移除超管角色需保底 2 个"。既有私有方法（`checkSuperAdminHierarchy`/`containsSuperAdminRole`/`countSuperAdminUsers`）不动。
- 备选：合并 assign/remove 为单一 `setRoles`（拒绝——两方法路由/权限码/语义不同，属接口合并越权；本变更只收敛实现不合并接口）。

### D3: `PermissionCacheService` 新增 `invalidateUser` / `invalidateRole`，`del` 私有化

- `invalidateUser(userId)`：现 `del` 的语义化包装（同 key、同静默降级）。
- `invalidateRole(roleId)`：将 roles.service 私有 `invalidateRoleUserCache` 的机制（查 `userRole` → 逐 userId 失效）**下沉**进 PermissionCacheService——"谁受角色变更影响"是缓存失效策略知识，归缓存模块所有（locality：审计点唯一）。需注入 `PrismaService`（已 `@Global()`，无新增模块依赖）。roles.service 删除该私有方法，3 处调用改一行 `invalidateRole(roleId)`。
- `del` 改 private（`invalidateUser`/`invalidateRole` 内部复用）；`set/get` 保持 public（PermissionsGuard 读路径不变）。
- 调用点迁移：users.service 3 处 → `invalidateUser`；roles.service 3 处 → `invalidateRole`；online-users kickUser → `invalidateUser`。
- 备选：`invalidateRole` 留在 roles.service、缓存服务只加 `invalidateUsers(ids[])`（拒绝——失效范围决策仍散布调用方，seam 仍浅）；Global P2002 式自动失效（拒绝——无事件源，纯臆测 seam）。

### D4: 测试 seam

- `findUserForResponse`：行为测（null → 404；投影含 description/roles/department/positions），经既有 users.service 单测改造断言，不新增 mock 面。
- `assertRoleMutationAllowed`：四分支直接单测（404 / 改自己 / 层级 / roleIds 非法）。
- `PermissionCacheService`：`invalidateUser` 复用 del 既有降级用例；`invalidateRole` 新增（userRole 查询 → 逐 user 失效；Prisma 注入 mock 一处）。
- 既有 users/roles/online-users 单测：mock 目标从 `permissionCache.del` 改为 `invalidateUser`/`invalidateRole`，断言语义不变。

## Risks / Trade-offs

- [4 端点开始返回 description] → 属漂移修复而非回归；e2e 补断言；前端 DTO 结构未变（可选字段从 undefined 变有值）。
- [invalidateRole 注入 Prisma 使缓存模块依赖 DB] → 依赖方向可接受（Prisma 为全局基础设施）；换来的 locality 是失效策略单点审计。
- [assignRoles/removeRoles 守卫搬移时漏一条] → 机械搬移 + 既有单测逐条保留；grilling 阶段已逐行比对两方法差异。
- [remove() 缓存失效缺口被"发现但未修"] → 记录为后续独立变更（涉及删除用户后 JWT 撤销联动，超出本变更边界）；在本变更 ADR/CONTEXT 中留 TODO 线索。
- [del 私有化若残留外部调用] → `grep permissionCache.del` 归零验证（迁移后仅 invalidateUser/invalidateRole 内部调用）。

## Migration Plan

纯代码重构，无部署/数据迁移。回滚 = revert 单个 commit。

## Open Questions

（无）
