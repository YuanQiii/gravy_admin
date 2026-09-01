## Why

Data-scope（数据权限）先被"建模"却从未"生效"：`DataScopeService` 里的强制执行方法（`getUserDataScope`、`buildDataScopeQuery` 及其三个私有 helper）经 grep 核实对外零调用，属于自包含死代码——业务查询从未把数据权限条件写进 `where`，且业务表没有 `departmentId` 可过滤。保留这套永不执行的"幽灵"逻辑会误导后续开发者以为数据权限已生效（语义下沉到错误的地方）。

## What Changes

- 删除零调用的强制执行方法：`DataScopeService.getUserDataScope`、`buildDataScopeQuery`、以及只被它们使用的私有方法 `getUserDepartmentId`、`getUserDepartmentAndChildIds`、`getChildDepartmentIds`。
- **保留**可用的管理端 API 与数据结构：`DataScopeService.assignDataScopeToRole`、`getRoleDataScope`、`DataScope` 枚举、`Role.dataScope` 与 `RoleDepartment` 关联、roles 控制器的分配/查询接口均不动（外部行为不变，**BREAKING**：无）。
- 在文档中把"data-scope 当前是记录型元数据、未接入任何业务查询"声明为显式已知边界（CONTEXT.md），避免再次误判为已生效特性。

> 本变更为纯死代码删减，无 spec 级行为变更，故 `.openspec.yaml` 声明 `skip_specs: true`。

## Capabilities

### New Capabilities

无（纯重构，不引入新能力）。

### Modified Capabilities

无（无 spec 级行为变化，已通过 `skip_specs: true` 显式退出 specs）。

## Impact

- 代码：`src/modules/system/roles/services/data-scope.service.ts` 删除 5 个方法（含 3 个私有）；其余文件（roles.service、roles.controller、roles.module、dto、schema）零改动。
- 行为：外部 API 与数据权限分配语义不变。
- 文档：`CONTEXT.md` 增加 data-scope 未生效的边界声明。