## MODIFIED Requirements

### Requirement: 匿名访客只读访问设备目录

系统 SHALL 允许无 `Authorization: Bearer <token>` 头的匿名访客（CONTEXT.md 定义的 *Anonymous Visitor*）通过 **`b2c/` 前缀**访问以下 5 个子模块的只读接口（B2C 公开浏览域，见 `b2c/browse` capability）：

- `GET /b2c/brands` 与 `GET /b2c/brands/:id`
- `GET /b2c/catalogs` 与 `GET /b2c/catalogs/:id`
- `GET /b2c/filter-types`、`GET /b2c/filter-types/options` 与 `GET /b2c/filter-types/:id`
- `GET /b2c/equipment` 与 `GET /b2c/equipment/:id`
- `GET /b2c/filters` 与 `GET /b2c/filters/:id`

在 `b2c/` 调用路径上系统 SHALL 强制只返回 `status = 'enabled' AND deletedAt IS NULL` 的记录；匿名访客请求 `status = 'disabled'` 或 `deletedAt != null` 的记录 SHALL 返回 404。**后台 `equipment/*` 路径不再对匿名访客开放**：后台只读接口仅对携带有效 JWT 的登录用户开放，维持原有行为不变——即仍可按 `query.status` 任意筛选、仍可访问 disabled 记录。B2C 响应字段集 SHALL 与登录用户完全相同（不裁剪字段、不引入专用 public DTO）；因 B2C 调用只返回 enabled 记录，响应中各记录的 `status` 字段值 SHALL 恒为 `'enabled'`，无信息泄露。匿名访客对 POST/PATCH/DELETE 写操作 SHALL 仍返回 401（未挂 `@Public()` 的方法保持原守卫行为）。

#### Scenario: 匿名访客浏览品牌列表

- **WHEN** 未携带 Authorization 头的访客请求 `GET /b2c/brands?page=1&pageSize=10`
- **THEN** 系统返回 200，`items` 仅包含 `status = 'enabled' AND deletedAt IS NULL` 的品牌
- **AND** 响应结构 `{ items, total, page, pageSize }` 与登录用户一致

#### Scenario: 匿名访客请求禁用记录

- **WHEN** 未携带 Authorization 头的访客请求 `GET /b2c/brands/:id`，其中 `:id` 对应一条 `status = 'disabled'` 的记录
- **THEN** 系统返回 404，错误信息与现有"不存在"语义一致

#### Scenario: 匿名访客请求已软删除记录

- **WHEN** 未携带 Authorization 头的访客请求 `GET /b2c/filters/:id`，其中 `:id` 对应一条 `deletedAt != null` 的记录
- **THEN** 系统返回 404，与现有"不存在"语义一致

#### Scenario: 登录用户行为不变

- **WHEN** 携带有效 JWT 的管理员请求 `GET /equipment/brands?status=disabled`
- **THEN** 系统返回 200，`items` 包含 `status = 'disabled' AND deletedAt IS NULL` 的品牌，与改造前完全一致

#### Scenario: 匿名访客访问后台路径被拒

- **WHEN** 未携带 Authorization 头的访客请求 `GET /equipment/brands`
- **THEN** 系统返回 401 Unauthorized（后台路径不再挂 `@Public()`）

#### Scenario: options 下拉接口对匿名开放

- **WHEN** 未携带 Authorization 头的访客请求 `GET /b2c/filter-types/options`
- **THEN** 系统返回 200，返回 `status = 'enabled' AND deletedAt IS NULL` 的精简字段列表（`filterTypeId`/`name`/`code`/`sortOrder`）

#### Scenario: 匿名访客访问写操作仍被拒绝

- **WHEN** 未携带 Authorization 头的访客请求 `POST /equipment/filters`
- **THEN** 系统返回 401 Unauthorized（写方法未挂 `@Public()`，原守卫链正常拦截）
