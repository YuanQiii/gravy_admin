## 1. 共享基类校验器与白名单字段

- [ ] 1.1 在 `packages/core/src/shared/validators/is-allowed-sort-by.validator.ts` 新增 `ValidatorConstraint` 实现 `IsAllowedSortByConstraint`：对未提供（undefined/null/空串）的 `sortBy` 放行；否则校验其值 ∈ `(args.object as PaginationSortDto).allowedSortBy`，否则返回 false 并产出可排序字段清单 message。验证：单测该约束，对落在白名单内/外与省略三种情况断言 true/false。
- [ ] 1.2 在 `packages/core/src/shared/dtos/pagination.dto.ts` 的 `PaginationSortDto` 新增实例字段 `allowedSortBy: string[] = ['createdAt','updatedAt']`；`sortBy` 增加 `@IsOptional()` + `@Validate(IsAllowedSortByConstraint)`；`sortOrder` 增加 `@IsIn(['asc','desc'])`（`message` 中文）。验证：`tsc --noEmit` 通过；`core` 包构建无误。
- [ ] 1.3 在 `packages/core/src/index.ts` 导出 `IsAllowedSortByConstraint` / 校验器装饰器（如需供域复用）。验证：构建后 `@gvray/core` 可被 domain/apps 解析导入。

## 2. 各域 DTO 覆盖 allowedSortBy

- [ ] 2.1 为 `packages/domain` 的 7 个 DTO（`QueryFilterDto`/`QueryEquipmentDto`/`QueryCatalogDto`/`QueryBrandDto`/`QueryFilterTypeDto`/`QueryInquiryDto`/`QueryInquiryLineDto`）各覆盖 `allowedSortBy`，列出该 Prisma 模型真实可排字段（含 B2C 浏览 DTO 的 `sortOrder`）。验证：单测对每个 DTO `new XDto().allowedSortBy` 含其默认排序字段。
- [ ] 2.2 为 `apps/mall` 的 3 个 DTO（`QueryAddressDto`/`QueryFavoriteDto`/`QueryHistoryDto`）覆盖 `allowedSortBy`。验证：单测断言覆盖值含对应 Service 使用的 `defaultSortBy`。
- [ ] 2.3 为 `apps/admin` 的 6 个 DTO（`QueryUserDto`/`QueryPermissionDto`/`QueryNoticeDto`/`QueryMenuDto`/admin `QueryAddressDto`/`QueryCustomerDto`）覆盖 `allowedSortBy`。验证：单测断言覆盖值含对应 `defaultSortBy`。

## 3. 校验 defaultSortBy 与白名单一致

- [ ] 3.1 核对全部 `paginateWithSort(model, query, where, include, defaultSortBy)` 调用（grep `paginateWithSort`），确认每个调用的 `defaultSortBy` ∈ 对应 DTO 的 `allowedSortBy`；不一致则把该字段补入白名单。验证：脚本/人工清单确认无遗漏调用。
- [ ] 3.2 确认 B2C 浏览 `FiltersService.findAll` 在 `isB2cVisibility` 分支忽略 `sortBy` 走加权排序，且 `QueryFilterDto.allowedSortBy` 含 `sortOrder`，使 `?sortBy=sortOrder` 仍通过校验（保留 `b2c/browse`「加权排序生效」场景）。验证：对 `GET /filters?sortBy=sortOrder` 断言返回 200 而非 400。

## 5. 架构审查采纳项（候选 1/2/3 推荐项）

- [ ] 5.1（候选 1 · Strong）改造 `getOrderBy`/`paginateWithSort`：默认排序字段取自 `allowedSortBy` 主字段，移除独立的 `defaultSortBy` 字符串参数；DTO 成为白名单与默认的唯一真相源。验证：单测断言省略 `sortBy` 时回退到该 DTO 白名单首项，且 16 个调用点无需各自传字符串。
- [ ] 5.2（候选 2 · Worth exploring）删除 `packages/core/src/shared/dtos/pagination.dto.ts:57-73` 的 `SortDto`；删除前 grep 确认无继承者与类型引用，若有则将其契约折入 `PaginationSortDto`。验证：`@gvray/core` 构建通过且无残留引用。
- [ ] 5.3（候选 3 · Speculative）以声明式 `@SortWhitelist(['field',...])` 装饰器替换实例字段耦合：白名单在声明时闭包捕获并直接传入 `IsAllowedSortBy`，校验器自包含、不读 `args.object.allowedSortBy`。验证：单测断言校验器不依赖子类实例化即可拿到白名单；若实现成本过高可回退 D2 实例字段方案（对外行为一致）。

## 4. 端到端验证

- [ ] 4.1 匿名请求 `GET /filters?sortOrder=DROP` 断言返回 400 且响应体不含 Prisma 异常 message。验证：集成/E2E 用例通过。
- [ ] 4.2 匿名请求 `GET /filters?sortBy=__proto__` 断言返回 400 且不触达 Prisma `orderBy`、不回显内部信息。验证：E2E 用例通过。
- [ ] 4.3 合法 `?sortBy=createdAt&sortOrder=desc` 断言返回 200、排序生效。验证：E2E 用例通过。
- [ ] 4.4 运行现有 `b2c`/`customer`/`inquiry`/`equipment`/`rbac` 列表端点测试套件，确认无回归（合法排序字段不变）。验证：相关测试全绿。
