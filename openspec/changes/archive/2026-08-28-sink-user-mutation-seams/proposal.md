# Proposal: sink-user-mutation-seams

> 架构评审（2026-08-28）候选 1 + 2 组合。纯重构：收敛 UsersService 复制粘贴的投影/守卫逻辑，并将权限缓存失效不变量从"调用方纪律"下沉为"变更路径自失效"。

## Why

UsersService（849 行）是系统管理域最热的非 equipment 文件，存在两类已被量化的浅层摩擦：

1. **User 投影复制粘贴 ×7**：`findUnique + select{…userRoles/department/userPositions…} + plainToInstance(UserResponseDto)` 的 ~40 行块在 create/update/assignRoles/removeRoles/resetPassword/status 切换等方法中逐字重复（[users.service.ts:270](../../src/modules/system/users/users.service.ts#L270) 等 7 处）。新增 User 字段需改 7 处，漏一处即该字段从部分响应中静默消失。`assignRoles`/`removeRoles`（L707–813 / L816–909）~70% 相同：相同的自查守卫、相同的超管层级阶梯（不能改自己 / 非超管不能授超管 / 至少保留 2 个超管）、相同的回查与缓存失效。

2. **权限缓存失效不变量跨 seam 泄漏**：不变量"任何改变 User 有效权限的变更必须失效 `perm:user:{userId}`"不归任何模块所有，靠 3 个文件 7 个调用点手工记住（users.service 3 处、roles.service 3 处经私有 `invalidateRoleUserCache`、online-users.service 1 处）。漏调的失败模式**静默且涉及安全**：被撤销的角色在最长 1 小时 TTL 内继续生效。PermissionCacheService 只暴露原始 `set/get/del`——调用方被迫知晓失效*策略*而非缓存*操作*。

## What Changes

- **UsersService 新增私有 `findUserForResponse(userId)`**：唯一拥有 User 关系投影（userRoles/department/userPositions select + DTO 转换）的地方，7 处调用点收敛为 7 行。
- **UsersService 新增私有 `assertRoleMutationAllowed(userId, currentUserId)`**：唯一拥有超管守卫阶梯不变量的地方；`assignRoles`/`removeRoles` 收缩为各自真实差异的 ~10 行（deleteMany+createMany vs deleteMany-in）。
- **PermissionCacheService 接口意图化**：新增 `invalidateUser(userId)`；roles.service 已有的私有 `invalidateRoleUserCache(roleId)`（查 userRole 后逐 userId 失效）下沉/对齐为 `invalidateRole(roleId)`。变更路径（users/roles mutations、online-users kickUser）统一经意图化方法自失效。
- **行为基本零变更，唯一例外为漂移修复**：路由、权限码、响应结构、错误码、失效范围与时机逐字保留；update/resetPassword/assignRoles/removeRoles 4 端点开始返回真实 `description`（现状因 select 漂移恒为 `undefined`，属既有 bug 的顺手修复，详见 design D1）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——纯重构，spec 级行为零变更，`.openspec.yaml` 设置 `skip_specs: true`）

## Impact

- **代码**：
  - `src/modules/system/users/users.service.ts`（主要改动，预计净减 ~200 行）
  - `src/modules/system/roles/roles.service.ts`（`invalidateRoleUserCache` 机制迁移）
  - `src/modules/system/online-users/online-users.service.ts`（kickUser 改用意图化失效）
  - `src/redis/permission-cache.service.ts`（新增意图化方法）
- **测试**：上述 4 文件对应 `*.spec.ts` 同步调整；投影与守卫阶梯各获得一个单测 seam（原先需经 7 个端点间接验证）。
- **不影响**：API 路由/Swagger、权限码常量、数据库 schema、部署配置、前端。
