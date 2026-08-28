# Tasks: sink-user-mutation-seams

> 依赖顺序：先缓存服务（D3），再 UsersService 收敛（D1/D2），最后调用点迁移与验证。纯重构，验证以既有单测全绿 + 交叉 grep 归零为准。

## 1. PermissionCacheService 意图化（D3）

- [x] 1.1 在 `src/redis/permission-cache.service.ts` 新增 `invalidateUser(userId)`（包装现 `del` 逻辑），`del` 降为 private；确认 `set/get` 保持 public 不变，`pnpm build` 通过
- [x] 1.2 注入 `PrismaService`，新增 `invalidateRole(roleId)`（迁入 roles.service `invalidateRoleUserCache` 机制：查 userRole → 逐 userId 失效），并补充单测（userRole 查询 mock 一处 + 逐 user 失效断言 + Redis 不可用静默降级）
- [x] 1.3 `grep -rn "permissionCache\.del\|\.del(" src/redis/permission-cache.service.ts` 确认 `del` 仅剩内部调用；PermissionCacheService 现有单测全绿

## 2. UsersService 投影收敛（D1）

- [x] 2.1 在 `src/modules/system/users/users.service.ts` 新增模块级 `USER_RESPONSE_SELECT` 常量（含 `description`）与私有 `findUserForResponse(userId)`（null → NotFoundException）；`findAll` 复用同形状但不含 description 的 `USER_LIST_SELECT`（用户决策：列表负载最小化）、`findOne` 委托 helper，`tsc --noEmit` 通过
- [x] 2.2 create/update/resetPassword 三处 ~40 行回查块替换为 `findUserForResponse` 调用；users.service 单测中对应 mock 断言（findUnique 调用形状）同步更新且全绿
- [x] 2.3 单测补 4 端点（update/resetPassword/assignRoles/removeRoles）返回 `description` 的断言（漂移对齐验证，D1）

## 3. UsersService 守卫收敛（D2）

- [x] 3.1 新增私有 `assertRoleMutationAllowed(userId, currentUserId, roleIds)`（回查 404 → 不能改自己 → `checkSuperAdminHierarchy` → `validateRoleIds`）；`assignRoles`/`removeRoles` 前半段替换为该调用，后半段保留各自超管专属守卫与关联写入，`tsc --noEmit` 通过
- [x] 3.2 assignRoles/removeRoles 的回查块替换为 `findUserForResponse`（与 2.2 同模式）；`permissionCache.del` 两处改 `invalidateUser`；update L575 的条件失效同步改 `invalidateUser`
- [x] 3.3 为 `assertRoleMutationAllowed` 补四分支单测（404 / 改自己 / 层级拦截 / roleIds 非法）；既有 assign/remove 单测逐条保留（守卫行为不变）

## 4. roles / online-users 调用点迁移（D3 收尾）

- [x] 4.1 `src/modules/system/roles/roles.service.ts`：删除私有 `invalidateRoleUserCache`，3 处调用（L361/L476/L531）改 `invalidateRole(roleId)`；roles 单测 mock 断言同步替换且全绿（无独立 roles 单测，失效逻辑由 permission-cache spec 覆盖）
- [x] 4.2 `src/modules/system/online-users/online-users.service.ts`：kickUser 改 `invalidateUser(userId)`；对应单测同步且全绿

## 5. 全局验证

- [x] 5.1 `grep -rn "permissionCache\.del" src/` 归零；`grep -rn "plainToInstance(UserResponseDto" src/modules/system/users/users.service.ts` 仅剩 helper 与 findAll 两处
- [x] 5.2 `pnpm test` 全绿（54 passed）；`tsc --noEmit` 通过；e2e 无新增回归（equipment 27 passed，app.e2e 仅剩已记录的历史 GET / 失败）
- [x] 5.3 文档同步：CONTEXT.md 技术词汇表新增「User response projection / Role-mutation guard / Permission-cache invalidation」三条目（含 `remove()` 缓存失效缺口 TODO 线索，见 design Risks 第 4 条）
