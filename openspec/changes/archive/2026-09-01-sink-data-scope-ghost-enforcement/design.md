## Context

`DataScopeService`（`src/modules/system/roles/services/data-scope.service.ts`）暴露两类职责：

- **管理端（真实在用）**：`assignDataScopeToRole`、`getRoleDataScope`，被 `RolesService` 用于角色数据权限的分配/查询。
- **强制执行（幽灵）**：`getUserDataScope`、`buildDataScopeQuery` 及三个私有 helper。经 grep 核实这些方法互为内部引用、对外零调用；且业务表（Equipment/Inquiry/Filter 等）没有 `departmentId` 列，无法按部门过滤。见 proposal.md - Why。

约束：删除前已 grep 归零调用方；保留结构（`Role.dataScope`、`RoleDepartment`、dto、controller 路由）不动，保证外部行为不变。

## Goals / Non-Goals

**Goals:**

- 从 `DataScopeService` 移除强制执行路径的全部 5 个方法。
- 保留管理端分配/查询 API 的签名与行为不变。
- 在 CONTEXT.md 声明 data-scope 为"记录型元数据、未接入业务查询"的显式边界。

**Non-Goals:**

- 不接通任何业务查询强制 data-scope（需要给业务表加 `departmentId`/owner 列，属后续独立变更）。
- 不改 `Role.dataScope` 字段、`RoleDepartment` 表、roles 控制器路由或 dto。
- 不新增测试（无行为变更，删死代码后仅靠既有测试 + 构建 + e2e 回归把关）。

## Decisions

- **直接删除而非保留+标注**：proposal 已决定删除。理由：方法与私有 helper 自包含、零外部引用，保留带 `@deprecated` 标注的残缺执行代码比彻底删除更容易被误用；项目 pitfalls「死代码删除」主张 grep 归零后删除。备选“加注释保留”被否：仍会误导读者以为可接入。
- **只动 service 一个文件**：`DataScope/枚举`、`assignDataScopeToRole`、`getRoleDataScope` 仍引用 `PrismaService` 与 `NotFoundException`，因此 `@Injectable`、构造函数、`DataScope` 枚举均保留；仅删除强制执行方法体及其不再使用的私有方法。`roles.service.ts` 对 `DataScopeService` 的注入与两处调用（739、757 行）不受影响。

## Risks / Trade-offs

- [误删仍被外部引用的方法] → 已 grep 全仓，`buildDataScopeQuery`/`getUserDataScope` 及三个私有方法仅出现在本文件内相互调用，无外部消费者；删除后再次 grep 归零确认。
- [编译残留未用导入] → 删除后确认 `DataScopeService` 仍用 `PrismaService`、`NotFoundException`，不产生未用导入。
- [文档与实现漂移] → CONTEXT.md 新增的边界声明与本次删除语义一致；后续若要真正启用 data-scope 会再次 grep 评估。