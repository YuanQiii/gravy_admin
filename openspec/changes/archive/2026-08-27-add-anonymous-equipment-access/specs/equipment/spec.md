## ADDED Requirements

### Requirement: 匿名访客只读访问设备目录

系统 SHALL 允许无 `Authorization: Bearer <token>` 头的匿名访客（CONTEXT.md 定义的 *Anonymous Visitor*）访问以下 5 个子模块的 GET 接口：

- `GET /equipment/brands` 与 `GET /equipment/brands/:id`
- `GET /equipment/catalogs` 与 `GET /equipment/catalogs/:id`
- `GET /equipment/filter-types`、`GET /equipment/filter-types/options` 与 `GET /equipment/filter-types/:id`
- `GET /equipment/equipment` 与 `GET /equipment/equipment/:id`
- `GET /equipment/filters` 与 `GET /equipment/filters/:id`

在匿名调用路径上系统 SHALL 强制只返回 `status = 'enabled' AND deletedAt IS NULL` 的记录；匿名访客请求 `status = 'disabled'` 或 `deletedAt != null` 的记录 SHALL 返回 404。登录调用路径（携带有效 JWT）SHALL 维持现有行为不变——即仍可按 `query.status` 任意筛选、仍可访问 disabled 记录。响应字段集 SHALL 与登录用户完全相同（不裁剪字段、不引入专用 public DTO）；因匿名调用只返回 enabled 记录，响应中各记录的 `status` 字段值 SHALL 恒为 `'enabled'`，无信息泄露。匿名访客对 POST/PATCH/DELETE 写操作 SHALL 仍返回 401（未挂 `@Public()` 的方法保持原守卫行为）。

#### Scenario: 匿名访客浏览品牌列表

- **WHEN** 未携带 Authorization 头的访客请求 `GET /equipment/brands?page=1&pageSize=10`
- **THEN** 系统返回 200，`items` 仅包含 `status = 'enabled' AND deletedAt IS NULL` 的品牌
- **AND** 响应结构 `{ items, total, page, pageSize }` 与登录用户一致

#### Scenario: 匿名访客请求禁用记录

- **WHEN** 未携带 Authorization 头的访客请求 `GET /equipment/brands/:id`，其中 `:id` 对应一条 `status = 'disabled'` 的记录
- **THEN** 系统返回 404，错误信息与现有"不存在"语义一致

#### Scenario: 匿名访客请求已软删除记录

- **WHEN** 未携带 Authorization 头的访客请求 `GET /equipment/filters/:id`，其中 `:id` 对应一条 `deletedAt != null` 的记录
- **THEN** 系统返回 404，与现有"不存在"语义一致

#### Scenario: 登录用户行为不变

- **WHEN** 携带有效 JWT 的管理员请求 `GET /equipment/brands?status=disabled`
- **THEN** 系统返回 200，`items` 包含 `status = 'disabled' AND deletedAt IS NULL` 的品牌，与改造前完全一致

#### Scenario: options 下拉接口对匿名开放

- **WHEN** 未携带 Authorization 头的访客请求 `GET /equipment/filter-types/options`
- **THEN** 系统返回 200，返回 `status = 'enabled' AND deletedAt IS NULL` 的精简字段列表（`filterTypeId`/`name`/`code`/`sortOrder`）

#### Scenario: 匿名访客访问写操作仍被拒绝

- **WHEN** 未携带 Authorization 头的访客请求 `POST /equipment/filters`
- **THEN** 系统返回 401 Unauthorized（写方法未挂 `@Public()`，原守卫链正常拦截）

### Requirement: 公开接口限流保护

系统 SHALL 对所有匿名访问开放的 GET 接口施加每分钟 60 次的限流，防止高频爬虫拖挂数据库。限流配额按 IP + 接口 URL 计数，不区分请求是否携带 JWT（即登录用户调用同一公开接口也共享此配额）。系统其他未挂公开限流装饰器的接口 SHALL 受全局默认配额（每分钟 1000 次）约束。超过配额时系统 SHALL 返回 429 Too Many Requests 并在响应头中包含 `Retry-After`。

#### Scenario: 公开接口限流触发

- **WHEN** 同一 IP 在 60 秒内调用任一公开 GET 接口超过 60 次
- **THEN** 系统返回 429 Too Many Requests，响应头包含 `Retry-After`
- **AND** TTL 窗口内后续请求持续返回 429

#### Scenario: 全局默认限流

- **WHEN** 同一 IP 在 60 秒内调用非公开接口（如 `POST /auth/login`、`POST /equipment/filters`）超过 1000 次
- **THEN** 系统返回 429 Too Many Requests
