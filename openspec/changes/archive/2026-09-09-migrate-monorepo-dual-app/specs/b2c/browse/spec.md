# b2c/browse Delta

## MODIFIED Requirements

### Requirement: B2C 公开浏览端点

系统 SHALL 在 Mall 应用上提供无前缀的只读浏览端点，覆盖滤清器、设备档案、设备目录、设备品牌与滤清器类型五个子域。匿名访客与已登录 B2C 客户 SHALL 可访问以下端点：

- `GET /filters` 与 `GET /filters/:id`
- `GET /equipment` 与 `GET /equipment/:id`
- `GET /catalogs` 与 `GET /catalogs/:id`
- `GET /brands`、`GET /brands/:id` 与 `GET /brands/hot`
- `GET /filter-types`、`GET /filter-types/options` 与 `GET /filter-types/:id`

以上端点 SHALL 对无 `Authorization: Bearer <token>` 头的匿名访客开放，不要求登录。B2C 浏览路径上系统 SHALL 强制只返回 `status = 'enabled' AND deletedAt IS NULL` 的记录；请求 `status = 'disabled'` 或已软删除的记录 SHALL 返回 404。B2C 浏览响应字段集 SHALL 与后台响应一致，各记录 `status` 恒为 `'enabled'`。B2C 端点 SHALL 仅提供只读能力，不提供任何写操作。

#### Scenario: 匿名访客浏览滤清器列表

- **WHEN** 未携带 Authorization 头的访客请求 `GET /filters?page=1&pageSize=10`
- **THEN** 系统返回 200，`items` 仅包含 `status = 'enabled' AND deletedAt IS NULL` 的滤清器，分页结构为 `{ items, total, page, pageSize }`

#### Scenario: 匿名访客请求禁用记录

- **WHEN** 未携带 Authorization 头的访客请求 `GET /filters/:id`，`:id` 对应一条 `status = 'disabled'` 的记录
- **THEN** 系统返回 404，与"不存在"语义一致

#### Scenario: 已登录客户浏览与匿名行为一致

- **WHEN** 已登录 B2C 客户（携带客户 access token）请求 `GET /filters`
- **THEN** 系统返回 200，过滤与排序行为与匿名访客完全一致（强制 enabled + B2C 加权排序）

#### Scenario: B2C 浏览端点写操作被拒

- **WHEN** 访客请求 `POST /filters`
- **THEN** 系统返回 401 Unauthorized 或 404（该端点不存在）

### Requirement: B2C 浏览排序与限流

系统 SHALL 在 Mall 应用浏览路径上对滤清器、设备与目录应用非空加权排序（信息齐全优先），排序不受查询参数 `sortBy` 影响。系统 SHALL 对所有 B2C 公开浏览 GET 接口施加每分钟 60 次的限流配额（按 IP + 接口 URL 计数，不区分是否携带 JWT），超限返回 429 且响应头含 `Retry-After`。

#### Scenario: 加权排序生效

- **WHEN** 匿名访客请求 `GET /filters` 且带 `?sortBy=sortOrder`
- **THEN** 系统忽略 `sortBy`，按加权排序返回（信息齐全记录优先），与 Mall 浏览语义一致

#### Scenario: B2C 浏览限流触发

- **WHEN** 同一 IP 在 60 秒内调用任一 B2C 公开 GET 端点超过 60 次
- **THEN** 系统返回 429 Too Many Requests，响应头包含 `Retry-After`

### Requirement: B2C 与后台浏览路径隔离

系统 SHALL 保证 B2C 浏览端点仅存在于 Mall 应用（无路径前缀），Admin 应用的 `equipment/*` 路径 SHALL 不暴露任何公开（`@Public()`）只读端点。Admin 应用 `equipment/*` 只读端点 SHALL 仅对携带有效后台 JWT 且具备相应权限码的登录用户开放，维持原有 `query.status` 任意筛选与访问 disabled 记录的能力。

#### Scenario: 后台路径不再公开

- **WHEN** 未携带 Authorization 头的访客请求 Admin 应用的 `GET /equipment/filters`
- **THEN** 系统返回 401 Unauthorized（后台路径不挂 `@Public()`）

#### Scenario: 后台登录用户行为不变

- **WHEN** 携带有效后台 JWT 的管理员请求 Admin 应用的 `GET /equipment/filters?status=disabled`
- **THEN** 系统返回 200，`items` 包含 `status = 'disabled' AND deletedAt IS NULL` 的记录，与改造前一致
