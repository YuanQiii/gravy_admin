## Why

`PaginationSortDto` 的 `sortBy`（`packages/core/src/shared/dtos/pagination.dto.ts:83-84`，`sortBy?: string` 无校验）与 `sortOrder`（`:92-93`，仅 `@IsOptional()`，无 `@IsIn(['asc','desc'])`）直接进入 Prisma `orderBy`。`?sortBy=__proto__` 或 `?sortOrder=DROP` 会触发 Prisma 校验异常，被 `HttpExceptionFilter` 的「非 `HttpException`」分支（`packages/core/src/core/filters/http-exception.filter.ts:50-52`）以 `instanceof Error` 捕获并返回 **500** 且**原样回显** `exception.message`（含字段名/查询片段）。匿名访客一条 query 即可触发 500 并窥探 schema 字段名，同时产生无谓错误日志噪声。根因是 DTO 层契约缺失（白名单），与报告同条建议的另一子项「非预期异常响应收敛」根因不同，后者属错误响应泄密面，见下方 Non-Goal。

## What Changes

- **(a) DTO 层入参白名单（本次范围，契约修复）**
  - 在共享基类 `PaginationSortDto` 上为 `sortOrder` 补 `@IsIn(['asc','desc'])`，将 `?sortOrder=DROP` 这类非法方向从 500 收敛为 **400**。**BREAKING**：非法 `sortOrder` 响应语义由 500（内部错误）变为 400（参数错误）。
  - 在共享基类 `PaginationSortDto` 上引入单一自定义校验 `@Validate(IsAllowedSortBy)`，约束 `sortBy` 必须落在可排序字段白名单内；白名单以基类可覆盖字段 `allowedSortBy: string[]`（默认 `['createdAt','updatedAt']`）声明，每个域 DTO 仅用一行覆盖该字段列表（如 `allowedSortBy = ['sortOrder','createdAt','updatedAt','model']`）。非法 `sortBy` 返回 **400**，不再透传至 Prisma。**BREAKING**：此前「任意字符串」被接受（随后 500）的契约不再成立，非法 `sortBy` 现返回 400。
  - 该基类是全部 16 个分页排序 DTO 的唯一继承点，因此无需在每个域重复 `@IsIn` 样板即可全局覆盖。
- **(b) 非预期异常的响应收敛（不在本次范围 → Non-Goal）**：`HttpExceptionFilter` 非 `HttpException` 分支在生产环境仅返回泛化文案、原始 message 仅进日志的改造，见下方 Non-Goal 与建议独立变更名。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `b2c`：ADDED Requirement「分页排序参数白名单校验」。该 Requirement 约束共享基类 `PaginationSortDto`（`@gvray/core`）的排序入参契约；因基类是 `b2c` 浏览端点（`QueryFilterDto`/`QueryEquipmentDto`/`QueryCatalogDto`/`QueryBrandDto`/`QueryFilterTypeDto`）与 `customer`/`inquiry`/`equipment`/`rbac` 全部列表端点的唯一继承点，本变更经该基类全局生效，影响面见 Impact。

## Impact

- 代码：`packages/core/src/shared/dtos/pagination.dto.ts`（`PaginationSortDto` 增 `allowedSortBy` 字段与 `sortOrder` 的 `@IsIn`、新增自定义校验器 `IsAllowedSortBy` 或置于 `packages/core/src/shared/validators/`）、`packages/core/src/shared/services/base.service.ts:223-241`（`paginateWithSort` 已通过 `getOrderBy` 消费 `sortBy`/`sortOrder`，无需改动）。
- 全局继承 `PaginationSortDto` 的 16 个源 DTO（均需补一行 `allowedSortBy`，验证见各域字段）：
  - `packages/domain`：`QueryFilterDto`、`QueryEquipmentDto`、`QueryCatalogDto`、`QueryBrandDto`、`QueryFilterTypeDto`、`QueryInquiryDto`、`QueryInquiryLineDto`
  - `apps/mall`：`QueryAddressDto`（mall/addresses）、`QueryFavoriteDto`、`QueryHistoryDto`（customer-activity）
  - `apps/admin`：`QueryUserDto`、`QueryPermissionDto`、`QueryNoticeDto`、`QueryMenuDto`、`QueryAddressDto`（admin/addresses）、`QueryCustomerDto`
- 端点：上述 DTO 对应的全部列表端点（含 `b2c` 公开的 `GET /filters`、`/equipment`、`/catalogs`、`/brands`、`/filter-types`）。
- 配置/部署：无新增配置项；`ValidationPipe` 现状（`configure-app.ts:51-58`：`whitelist/transform/forbidNonWhitelisted` 已启用）已能将校验失败转为 400，本次仅在 DTO 层补全约束。
- 非 Goal 影响：`HttpExceptionFilter`（`packages/core/src/core/filters/http-exception.filter.ts:50-52`）本次不改动。
