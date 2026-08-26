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

#### Scenario: 创建滤清器校验 type_name

- **WHEN** 提交的 `typeName` 不存在于 `FilterType.code` 启用列表中
- **THEN** 系统返回 400 Bad Request，错误码 `EQUIPMENT_FILTER_TYPE_INVALID`

#### Scenario: compatibility 默认值

- **WHEN** 创建滤清器未提供 `compatibility` 字段
- **THEN** 系统存储 `"{}"`，Prisma 返回空对象

### Requirement: 设备档案管理

系统 SHALL 提供设备（Equipment）的 CRUD 接口，字段包含：`brandId`（可空，引用 EquipmentBrand）、`brandName`（冗余快照，非空）、`model`（非空）、`productionDateStart`/`productionDateEnd`（date，可空）、`engineBrand`、`engineType`、`power`（numeric(10,2)）、`engineEnergy`（String 常量值，小写：diesel/petrol/electric/hybrid/natural_gas）、`catalogId`（可空，引用 EquipmentCatalog）、`catalogName`（冗余快照，非空）、`status`。`(brandName, model)` 组合在未软删除记录中 SHALL 唯一。

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
