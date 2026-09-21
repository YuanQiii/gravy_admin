# 架构约定

本文件只保留**架构层**的约定：模块结构、关键目录、双应用职责边界、分页查询。

> 具体规则各有其家，本文件不复述——复述必然漂移（本文件曾因此长期保留一条已被取代的守卫写法，见 `AGENTS.md`「已知缺陷与待确认」）：
>
> - 硬规则与守卫用法 → `AGENTS.md` 的「开发硬规则」
> - DTO / Swagger / 响应投影 → [dto-swagger.md](dto-swagger.md)
> - 权限码与扫描 → [permissions.md](permissions.md)
> - 统一响应结构 → [response-format.md](response-format.md)
> - schema / 迁移 / 级联 / 事务 → [database.md](database.md)
> - 日志与审计 → [coding.md](coding.md)

## 模块结构

业务模块通常包含：`module-name.module.ts`、`controller.ts`、`service.ts`、`dto/`、`response.dto.ts`。

## 关键目录

- `packages/core/src/prisma/`：Nest Prisma Module / PrismaService（`@Global()`，经 `@gvray/core` 桶导出）。
- `prisma/`：`schema.prisma` / `seed.ts` / `seeds/`，**schema 与 seed 的唯一所有者**（详见 [database.md](database.md)）。
- `packages/core/src/shared/services/base.service.ts`：通用分页/查询辅助 / `VisibilityOpts` 三分流，按现有模式复用，不强制继承。

## 双应用职责边界

- **apps/admin**（运营端）：`system/*`、`equipment/*`、`customer/addresses`、`inquiry/*` 等管理端点；挂载全量横切（OperationLog / FeatureFlag / RolesGuard / PermissionsGuard / JwtAuthGuard）。
- **apps/mall**（商城端）：匿名浏览（`/filters`、`/equipment`、`/catalogs`、`/brands`、`/filter-types`）+ 客户自助（`/auth`、`/addresses`、`/inquiries`、`/favorites`、`/history`）；只挂 RequestLog / Response / HttpException / Throttler，**不**挂 OperationLog / FeatureFlag。
- 共享内核：`@gvray/core`（基础设施）、`@gvray/domain`（equipment 五件套 + inquiry 的 providers-only 领域服务）。依赖方向见 `AGENTS.md` 的路径 alias 规则。

## 分页与查询

- 分页参数使用 `PaginationDto` / `PaginationSortDto`，`pageSize` 上限 100。
- 查询条件构建优先复用 `BaseService.buildWhere({ contains, equals, boolean, date })`。
