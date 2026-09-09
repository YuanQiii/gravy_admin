## Purpose

提供 B2C 公开浏览域的统一访问面：匿名访客与已登录客户通过 `b2c/` 前缀只读浏览滤清器、设备、目录、品牌与滤清器类型，行为与后台管理域隔离。

## ADDED Requirements

### Requirement: B2C 公开浏览端点

系统 SHALL 提供 `b2c/` 前缀下的只读浏览端点，覆盖滤清器、设备档案、设备目录、设备品牌与滤清器类型五个子域。匿名访客与已登录 B2C 客户 SHALL 可访问以下端点：

- `GET /b2c/filters` 与 `GET /b2c/filters/:id`
- `GET /b2c/equipment` 与 `GET /b2c/equipment/:id`
- `GET /b2c/catalogs` 与 `GET /b2c/catalogs/:id`
- `GET /b2c/brands`、`GET /b2c/brands/:id` 与 `GET /b2c/brands/hot`
- `GET /b2c/filter-types`、`GET /b2c/filter-types/options` 与 `GET /b2c/filter-types/:id`

以上端点 SHALL 对无 `Authorization: Bearer <token>` 头的匿名访客开放，不要求登录。B2C 浏览路径上系统 SHALL 强制只返回 `status = 'enabled' AND deletedAt IS NULL` 的记录；请求 `status = 'disabled'` 或已软删除的记录 SHALL 返回 404。B2C 浏览响应字段集 SHALL 与后台响应一致，各记录 `status` 恒为 `'enabled'`。B2C 端点 SHALL 仅提供只读能力，不提供任何写操作。

#### Scenario: 匿名访客浏览滤清器列表

- **WHEN** 未携带 Authorization 头的访客请求 `GET /b2c/filters?page=1&pageSize=10`
- **THEN** 系统返回 200，`items` 仅包含 `status = 'enabled' AND deletedAt IS NULL` 的滤清器，分页结构为 `{ items, total, page, pageSize }`

#### Scenario: 匿名访客请求禁用记录

- **WHEN** 未携带 Authorization 头的访客请求 `GET /b2c/filters/:id`，`:id` 对应一条 `status = 'disabled'` 的记录
- **THEN** 系统返回 404，与"不存在"语义一致

#### Scenario: 已登录客户浏览与匿名行为一致

- **WHEN** 已登录 B2C 客户（携带客户 access token）请求 `GET /b2c/filters`
- **THEN** 系统返回 200，过滤与排序行为与匿名访客完全一致（强制 enabled + B2C 加权排序）

#### Scenario: B2C 浏览端点写操作被拒

- **WHEN** 访客请求 `POST /b2c/filters`
- **THEN** 系统返回 401 Unauthorized 或 404（该端点不存在）

### Requirement: B2C 浏览排序与限流

系统 SHALL 在 `b2c/` 浏览路径上对滤清器、设备与目录应用非空加权排序（信息齐全优先），排序不受查询参数 `sortBy` 影响。系统 SHALL 对所有 B2C 公开浏览 GET 接口施加每分钟 60 次的限流配额（按 IP + 接口 URL 计数，不区分是否携带 JWT），超限返回 429 且响应头含 `Retry-After`。

#### Scenario: 加权排序生效

- **WHEN** 匿名访客请求 `GET /b2c/filters` 且带 `?sortBy=sortOrder`
- **THEN** 系统忽略 `sortBy`，按加权排序返回（信息齐全记录优先），与 `b2c/` 浏览语义一致

#### Scenario: B2C 浏览限流触发

- **WHEN** 同一 IP 在 60 秒内调用任一 B2C 公开 GET 端点超过 60 次
- **THEN** 系统返回 429 Too Many Requests，响应头包含 `Retry-After`

### Requirement: B2C 与后台浏览路径隔离

系统 SHALL 保证 B2C 浏览端点仅存在于 `b2c/` 前缀下，后台 `equipment/*` 路径 SHALL 不再暴露任何公开（`@Public()`）只读端点。后台 `equipment/*` 只读端点 SHALL 仅对携带有效后台 JWT 且具备相应权限码的登录用户开放，维持原有 `query.status` 任意筛选与访问 disabled 记录的能力。

#### Scenario: 后台路径不再公开

- **WHEN** 未携带 Authorization 头的访客请求 `GET /equipment/filters`
- **THEN** 系统返回 401 Unauthorized（后台路径不再挂 `@Public()`）

#### Scenario: 后台登录用户行为不变

- **WHEN** 携带有效后台 JWT 的管理员请求 `GET /equipment/filters?status=disabled`
- **THEN** 系统返回 200，`items` 包含 `status = 'disabled' AND deletedAt IS NULL` 的记录，与改造前一致
