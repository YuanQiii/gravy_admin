# b2c Specification

## Purpose
TBD - created by archiving change whitelist-pagination-sort-params. Update Purpose after archive.

## Requirements

### Requirement: 分页排序参数白名单校验

系统 SHALL 在共享基类 `PaginationSortDto`（`@gvray/core`）上对所有分页排序列表端点的 `sortOrder` 与 `sortBy` 实施白名单校验。该基类是 `b2c`、`customer`、`inquiry`、`equipment`、`rbac`（admin）全部列表端点 DTO 的唯一继承点，因此本 Requirement 经该基类对所有列表端点全局生效。`sortOrder` SHALL 仅接受 `asc` 或 `desc`；`sortBy` SHALL 仅接受各域 DTO 声明的可排序字段白名单（`allowedSortBy`）之内的值。白名单之外或枚举之外的取值 SHALL 返回 **400**，且响应 SHALL 不回显任何内部异常 message、字段名或查询片段。合法取值的响应语义与改造前保持一致。各域 DTO 通过覆盖一行 `allowedSortBy` 字段声明其白名单，基类 SHALL 提供默认白名单 `['createdAt','updatedAt']`。

#### Scenario: 非法 sortOrder 返回 400 而非 500

- **WHEN** 匿名访客请求 `GET /filters?sortOrder=DROP`
- **THEN** 系统返回 400，响应为参数错误提示，HTTP 状态码不为 500，且响应体不包含 Prisma 异常 message

#### Scenario: 白名单外 sortBy 返回 400 且不回显内部信息

- **WHEN** 匿名访客请求 `GET /filters?sortBy=__proto__`
- **THEN** 系统返回 400，响应不包含任何内部异常 message、schema 字段名或 SQL 片段；该请求不会触达 Prisma `orderBy` 执行

#### Scenario: 合法 sortBy 与 sortOrder 正常返回

- **WHEN** 已登录或匿名访客请求 `GET /filters?sortBy=createdAt&sortOrder=desc`
- **THEN** 系统返回 200，分页结构为 `{ items, total, page, pageSize }`，排序按声明字段与方向执行，行为与改造前一致

#### Scenario: B2C 浏览加权排序忽略 sortBy 且通过白名单

- **WHEN** 匿名访客请求 `GET /filters?sortBy=sortOrder`（B2C 浏览域走加权排序、忽略 `sortBy`）
- **THEN** 系统返回 200，按加权排序返回（信息齐全记录优先），且 `sortOrder` 处于该 DTO 白名单内故校验通过，与既有的「忽略 sortBy」语义一致，不返回 400
