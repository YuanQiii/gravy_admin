## Why

项目需要从外部数据源（`prisma/soybean-admin-nest-backend_af_eqm_filter_types_2026-08-26_132324.sql`）引入"滤清器设备目录 + 询价单 + B2C 客户行为"三个业务域的数据结构。当前 GVRAY Admin 仅有系统管理（用户/角色/权限/字典等）与监控模块，缺少业务领域模型；外部源库的 schema 已稳定且自洽，是迁移并纳入项目的时机。

## What Changes

- 新增 12 张业务表，分布在 3 个新模块，所有表遵循项目既有约定（`Int` 自增主键 + UUID 业务 ID、camelCase 列名、原生 FK、`@updatedAt`、软删除 `deletedAt` + `@@index([deletedAt])`）
- **`equipment` 模块**（6 张表）：`EquipmentBrand`、`EquipmentCatalog`、`FilterType`、`Filter`、`Equipment`、`EquipmentFilter`（设备-滤清器多对多关联）
- **`inquiry` 模块**（2 张表）：`Inquiry`、`InquiryLine`；询价单编号 `INQ{YYYYMM}-{4位序号}` 由应用层在事务内生成，catch 唯一约束冲突重试
- **`customer` 模块**（4 张表）：`Customer`（B2C 消费者，独立于 admin `User`，含微信 openid/unionid）、`CustomerAddress`、`CustomerFavorite`、`CustomerHistory`
- **状态字段统一**：源库的 `is_active boolean` 与 `status text 'ENABLED'` 统一为 `status String @default("enabled") @db.VarChar(16)`；源库大写枚举值（`'DRAFT'`/`'DIESEL'` 等）迁移为小写字符串
- **枚举策略**：源库 PostgreSQL 原生枚举（`EqmEngineEnergyEnum`/`EqmFilterTypeEnum`/`InquiryStatusEnum`）改为 `String` + `src/shared/constants/` 常量文件（与项目零 enum 现状一致）
- **丢弃全文搜索基础设施**：不迁移 `tsvector` 列、`pg_trgm` GIN 索引、维护触发器；改用 Prisma `contains(mode: 'insensitive')` / `ILIKE`，理由是项目使用 `prisma db push`（无 migrations 目录），引入扩展/触发器成本不匹配
- **审计字段**：后台管理表（brands/catalogs/filter_types/filters/equipment/inquiries/inquiry_lines）加 `createdById`/`updatedById` 指向 `User.userId`；B2C 自助表（customers/addresses/favorites/history）与关联表（equipment_filters）不加
- **权限码**：新增 `equipment:brand:*`、`equipment:catalog:*`、`equipment:filter:*`、`equipment:filter-type:*`、`equipment:equipment:*`、`inquiry:inquiry:*`、`inquiry:inquiry-line:*`、`customer:customer:*`、`customer:address:*`、`customer:favorite:*`、`customer:history:*` 常量到 `src/shared/constants/permissions.constant.ts`
- **Seed**：不写入任何业务数据（含 `filter_types` 字典），全部由后台 CRUD 录入
- 新增 `CONTEXT.md` 记录术语表（明确 `Customer` vs `User` 边界、`Inquiry` 状态流转）
- 新增 `docs/adr/0002-independent-customer-model.md` 记录"为何独立 Customer 而非合并入 User"决策

## Capabilities

### New Capabilities

- `equipment`: 滤清器设备目录域——品牌、设备目录、滤清器类型、滤清器、设备、设备-滤清器多对多关联的 CRUD 与查询
- `inquiry`: 询价单域——询价单及其明细的创建、状态流转（draft/submitted/quoted/expired）、编号生成、客户与联系人快照
- `customer`: B2C 客户域——客户（含微信 openid/unionid）、收货地址、收藏、浏览历史的管理

### Modified Capabilities

（无——本次为纯新增，不改动现有 system/auth/profile/dashboard 模块的 spec 行为）

## Impact

- **数据访问层**：`prisma/schema.prisma` 新增 12 个 model + 3 个常量文件（equipment/inquiry/customer 的 status 与 enum 值）；`prisma/seed.ts` 不写入业务数据
- **业务代码**：`src/modules/` 下新增 3 个顶层模块（`equipment/`、`inquiry/`、`customer/`），共 10 个子模块（5 equipment + 2 inquiry + 4 customer），每个含 `dto/` + controller + service + module
- **权限**：`src/shared/constants/permissions.constant.ts` 新增 11 组权限码常量；权限 seed 同步写入
- **菜单**：seed 脚本需为 3 个新模块添加菜单树（目录 + 菜单项）
- **依赖**：无新增 npm 依赖
- **数据库**：PostgreSQL，无 migrations 目录，沿用 `prisma db push`；无 FTS 扩展、无触发器、无序列
- **文档**：`CONTEXT.md`（新建）、`docs/adr/0002-*.md`（新建）
