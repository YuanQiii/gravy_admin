## Purpose

提供滤清器设备目录域的数据模型与 CRUD 行为契约：管理设备品牌、设备目录、滤清器类型、滤清器与设备档案，以及设备与滤清器之间的多对多关联，供后台运营人员维护滤清器选型数据库。

## Requirements

### Requirement: 设备品牌管理

系统 SHALL 提供设备品牌（EquipmentBrand）的 CRUD 接口，每个品牌包含名称（唯一）、slug（唯一）、状态、排序字段；名称与 slug 在未软删除记录中 SHALL 唯一。品牌被设备引用时 SHALL 禁止硬删除（外键 `onDelete: Restrict`），运营人员可软删除（设置 `deletedAt`）。

#### Scenario: 创建品牌成功

- **WHEN** 运营人员提交合法的品牌名称与 slug

- **THEN** 系统创建品牌记录，`status` 默认为 `"enabled"`，返回生成的 `brandId` (UUID)

- **AND** 不返回自增 `id`

#### Scenario: 名称冲突

- **WHEN** 提交的品牌名称已存在于未软删除记录中

- **THEN** 系统返回 409 Conflict，错误码 `EQUIPMENT_BRAND_NAME_DUPLICATED`

#### Scenario: 删除被引用的品牌

- **WHEN** 运营人员硬删除一个被 `Equipment.brandId` 引用的品牌

- **THEN** 数据库外键约束拒绝删除，系统返回 409 Conflict

### Requirement: 设备目录管理

系统 SHALL 提供设备目录（EquipmentCatalog）的 CRUD 接口，包含名称（唯一）、code（唯一）、描述；名称与 code 在未软删除记录中 SHALL 唯一。目录被设备引用时 SHALL 禁止硬删除。

#### Scenario: 创建目录

- **WHEN** 运营人员提交合法名称与 code

- **THEN** 系统创建目录记录，返回 `catalogId` (UUID)

#### Scenario: code 重复

- **WHEN** 提交的 code 已存在于未软删除记录中

- **THEN** 系统返回 409 Conflict，错误码 `EQUIPMENT_CATALOG_CODE_DUPLICATED`

### Requirement: 滤清器类型管理

系统 SHALL 提供滤清器类型（FilterType）的 CRUD 接口，作为滤清器分类的字典。每个类型包含名称（唯一）、code（唯一）、描述、`sortOrder`、`status`。类型被滤清器引用时 SHALL 禁止硬删除。

#### Scenario: 列出启用类型

- **WHEN** 前端请求滤清器类型下拉数据

- **THEN** 系统返回 `status = "enabled"` 且 `deletedAt IS NULL` 的类型列表，按 `sortOrder` 升序

### Requirement: 滤清器管理

系统 SHALL 提供滤清器（Filter）的 CRUD 接口，字段包含：`model`（唯一）、`typeName`（引用 FilterType 的 code）、`gencode`（唯一）、体积/重量/尺寸（`volume`、`weight`、`dimensionD1`..`D3`、`D7`、`D8`、`h1`..`h3`）、`annb`、`bynb`、`photoUuid`、`drawingUuid`、`compatibility`（JSON，默认 `{}`）、`sortOrder`、`status`。`model` 与 `gencode` 在未软删除记录中 SHALL 唯一。

#### Scenario: 模糊搜索滤清器

- **WHEN** 运营人员按 `model` 或 `gencode` 关键词搜索（不区分大小写）

- **THEN** 系统返回 `model ILIKE '%kw%' OR gencode ILIKE '%kw%'` 的未软删除记录，分页结构为 `{ items, total, page, pageSize }`

#### Scenario: 创建滤清器校验 type\_name

- **WHEN** 提交的 `typeName` 不存在于 `FilterType.code` 启用列表中

- **THEN** 系统返回 400 Bad Request，错误码 `EQUIPMENT_FILTER_TYPE_INVALID`

#### Scenario: compatibility 默认值

- **WHEN** 创建滤清器未提供 `compatibility` 字段

- **THEN** 系统存储 `"{}"`，Prisma 返回空对象

### Requirement: 设备档案管理

系统 SHALL 提供设备（Equipment）的 CRUD 接口，字段包含：`brandId`（可空，引用 EquipmentBrand）、`brandName`（冗余快照，非空）、`model`（非空）、`productionDateStart`/`productionDateEnd`（date，可空）、`engineBrand`、`engineType`、`power`（numeric(10,2)）、`engineEnergy`（String 常量值，小写：diesel/petrol/electric/hybrid/natural\_gas）、`catalogId`（可空，引用 EquipmentCatalog）、`catalogName`（冗余快照，非空）、`status`。`(brandName, model)` 组合在未软删除记录中 SHALL 唯一。

#### Scenario: 创建设备快照字段

- **WHEN** 运营人员提交 `brandId` 与 `catalogId` 创建设备

- **THEN** 系统从关联表读取 `brand.name` 与 `catalog.name` 写入 `brandName`/`catalogName` 快照字段，保证后续品牌/目录改名不影响历史设备记录

#### Scenario: 引擎能源枚举值

- **WHEN** 提交的 `engineEnergy` 不在常量 `EQUIPMENT_ENGINE_ENERGY` 列表中

- **THEN** 系统返回 400 Bad Request，错误码 `EQUIPMENT_EQUIPMENT_ENGINE_ENERGY_INVALID`

### Requirement: 设备-滤清器多对多关联

系统 SHALL 提供设备与滤清器之间的多对多关联（EquipmentFilter 关联表）管理接口，关联表字段仅 `id`、`equipmentId`、`filterId`、`createdAt`，无 `updatedAt`/软删除（事件型记录）。`(equipmentId, filterId)` SHALL 唯一。关联随主体硬删而级联删除（`onDelete: Cascade`）。

#### Scenario: 设备挂载滤清器

- **WHEN** 运营人员调用"设备挂载滤清器"接口，提交 `equipmentId` 与 `filterId` 列表

- **THEN** 系统在事务内批量插入 `EquipmentFilter` 记录，已存在的关联跳过（幂等）

#### Scenario: 设备卸载滤清器

- **WHEN** 运营人员调用"设备卸载滤清器"接口，提交 `equipmentId` 与 `filterId`

- **THEN** 系统硬删除对应 `EquipmentFilter` 记录，返回 204

#### Scenario: 查询设备的滤清器列表

- **WHEN** 运营人员查询某设备的滤清器

- **THEN** 系统返回该设备关联的所有未软删除 Filter 记录（通过 EquipmentFilter join）

### Requirement: 软删除与唯一约束共存

所有 equipment 域业务表（EquipmentBrand、EquipmentCatalog、FilterType、Filter、Equipment）SHALL 支持 `deletedAt` 软删除。唯一约束（如 `model`、`name`、`code`）SHALL 仅在数据库层面保证全局唯一（不区分软删除状态）；Service 层 SHALL 在创建/恢复时校验"未软删除记录中无同名"，以避免软删除记录阻塞新建同名实体。

#### Scenario: 软删除后重建同名品牌

- **WHEN** 品牌名 "Bosch" 已被软删除，运营人员再次创建 "Bosch"

- **THEN** Service 层校验通过（未软删除记录中无 "Bosch"），系统创建新记录；数据库唯一约束因旧记录的 `name` 仍存在而冲突

- **AND** 系统返回 409 Conflict，错误码 `EQUIPMENT_BRAND_NAME_DUPLICATED_SOFT_DELETED`，提示运营人员恢复旧记录或使用不同名称

### Requirement: 匿名访客只读访问设备目录

系统 SHALL 允许无 `Authorization: Bearer <token>` 头的匿名访客（CONTEXT.md 定义的 *Anonymous Visitor*）通过 **`b2c/`** **前缀**访问以下 5 个子模块的只读接口（B2C 公开浏览域，见 `b2c/browse` capability）：

- `GET /b2c/brands` 与 `GET /b2c/brands/:id`

- `GET /b2c/catalogs` 与 `GET /b2c/catalogs/:id`

- `GET /b2c/filter-types`、`GET /b2c/filter-types/options` 与 `GET /b2c/filter-types/:id`

- `GET /b2c/equipment` 与 `GET /b2c/equipment/:id`

- `GET /b2c/filters` 与 `GET /b2c/filters/:id`

在 `b2c/` 调用路径上系统 SHALL 强制只返回 `status = 'enabled' AND deletedAt IS NULL` 的记录；匿名访客请求 `status = 'disabled'` 或 `deletedAt != null` 的记录 SHALL 返回 404。**后台** **`equipment/*`** **路径不再对匿名访客开放**：后台只读接口仅对携带有效 JWT 的登录用户开放，维持原有行为不变——即仍可按 `query.status` 任意筛选、仍可访问 disabled 记录。B2C 响应字段集 SHALL 与登录用户完全相同（不裁剪字段、不引入专用 public DTO）；因 B2C 调用只返回 enabled 记录，响应中各记录的 `status` 字段值 SHALL 恒为 `'enabled'`，无信息泄露。匿名访客对 POST/PATCH/DELETE 写操作 SHALL 仍返回 401（未挂 `@Public()` 的方法保持原守卫行为）。

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

### Requirement: 公开接口限流保护

系统 SHALL 对所有匿名访问开放的 GET 接口施加每分钟 60 次的限流，防止高频爬虫拖挂数据库。限流配额按 IP + 接口 URL 计数，不区分请求是否携带 JWT（即登录用户调用同一公开接口也共享此配额）。系统其他未挂公开限流装饰器的接口 SHALL 受全局默认配额（每分钟 1000 次）约束。超过配额时系统 SHALL 返回 429 Too Many Requests 并在响应头中包含 `Retry-After`。

#### Scenario: 公开接口限流触发

- **WHEN** 同一 IP 在 60 秒内调用任一公开 GET 接口超过 60 次

- **THEN** 系统返回 429 Too Many Requests，响应头包含 `Retry-After`

- **AND** TTL 窗口内后续请求持续返回 429

#### Scenario: 全局默认限流

- **WHEN** 同一 IP 在 60 秒内调用非公开接口（如 `POST /auth/login`、`POST /equipment/filters`）超过 1000 次

- **THEN** 系统返回 429 Too Many Requests

<br />
