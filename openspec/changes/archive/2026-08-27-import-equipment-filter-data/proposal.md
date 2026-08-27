## Why

gvray 的 equipment / filter / catalog / brand / filter_type / equipment_filter 业务表 schema 已在 `add-equipment-inquiry-customer-domains` 变更中建立，但当前数据库这些表为空（仅 `equipment_brands` 有 1 条手工测试记录）。需要从外部项目 `soybean-admin-nest-backend` 的 pg_dump 文件中导入约 16 万条真实品牌 / 目录 / 类型 / 滤清器 / 设备 / 设备-滤清器关联数据，使 gvray 库具备可演示、可联调、可压测的真实业务数据基线，支撑后续 equipment / filter / inquiry / customer 域功能的开发与验收。

## What Changes

- 将 `prisma/soybean-admin-nest-backend_af_eqm_equipment_catalogs_2026-08-26_161358.sql`（17MB pg_dump，PostgreSQL 16.3/17.6）中的 6 张有数据表迁移到 gvray 业务表：
  - `af_eqm_brands` (~3224) → `equipment_brands`
  - `af_eqm_equipment_catalogs` (~49) → `equipment_catalogs`
  - `af_eqm_filter_types` (8) → `filter_types`
  - `af_eqm_filters` (~10484) → `filters`
  - `af_eqm_equipment` (~132268) → `equipment`
  - `af_eqm_equipment_filters` (~121133) → `equipment_filters`
- **跳过** 空表（`af_inq_inquiries` / `af_inq_inquiry_lines` / `af_usr_addresses` / `af_usr_favorites` / `af_usr_history`）与仅含 6 条测试数据的 `af_usr_users`（不污染 `customers` 表）
- **TRUNCATE** 现有 `equipment_brands` 中 1 条手工测试记录（`??????-CAT` / `test-cat`）；CASCADE 仅影响空表，无数据丢失
- 通过临时 staging 表 + 纯 SQL `INSERT...SELECT` ETL 完成：bigint 主键 → UUID 重映射、`is_active` → `status` 转换、`date` → `timestamp` 转换、PG enum → text 转换
- **跳过** 源表的 `search_vector` tsvector 列、GIN trigram 索引、jsonb_path_ops 索引（目标 schema 无对应列，全文检索能力引入是独立架构决策）
- 审计字段 `createdById` / `updatedById` 全部置 NULL（数据真实创建者非 gvray 任何 admin 用户，强行归因会造成操作日志错误）
- 全程单事务包裹：`pg_dump` 备份当前库 → dry-run（事务内 ETL + 冲突/dangling 探测 + `ROLLBACK`）→ 报告用户确认 → 同一脚本重跑并 `COMMIT`

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无。本次变更为纯数据导入，不改变任何 spec-level 行为（不新增 / 修改 API 契约、业务规则、schema 字段、权限码）。`equipment` / `customer` / `inquiry` capability 的 spec 已在 `add-equipment-inquiry-customer-domains` 变更中定义，本次仅填充既有 schema 的数据，行为契约不变。

## Impact

- **受影响代码**：新增 `prisma/scripts/migrate_af_eqm_to_gvray.sql` 一次性迁移脚本（staging 建表 + 源数据加载 + ETL 转换 + 冲突探测），不进入 NestJS 运行时。**注**：脚本不放 `prisma/migrations/`（Prisma Migrate 保留目录，非迁移 SQL 会干扰 `prisma migrate status`）。**范围扩充**（apply 阶段用户确认）：迁移数据暴露了预先存在的 Decimal 序列化缺陷，需在 `FilterResponseDto` / `EquipmentResponseDto` 的 Decimal 字段加 `@Transform`（详见 tasks 5.3）
- **受影响数据库**：`gvray_admin`（本地开发库，localhost:5432，postgres 用户）。6 张业务表数据填充，11 张其他业务表保持空
- **依赖**：源 SQL 文件已就位于 `prisma/soybean-admin-nest-backend_af_eqm_equipment_catalogs_2026-08-26_161358.sql`
- **备份**：迁移前 `pg_dump gvray_admin` 备份到 `prisma/backups/gvray_admin_pre_migration_<timestamp>.sql`（admin 域数据小，秒级完成）
- **风险**：
  - 16 万条数据迁移，跨表 FK 完整性通过临时 mapping 表（`source_bigint → new_uuid`）保证
  - unique 约束冲突（`equipment.[brandName, model]`、`filters.model`、`filters.gencode`、`equipment_filters.[equipmentId, filterId]` 等）与 dangling 引用（`equipment.brand_id` / `catalog_id`、`equipment_filters.equipment_id` / `filter_id`）需在 dry-run 阶段全量探测，冲突项暂停待用户确认、dangling 按既定规则自动处置（equipment 置 NULL、equipment_filters 丢弃）
- **回滚**：单事务 `ROLLBACK` 即时还原；已 `COMMIT` 后用 `pg_dump` 备份文件还原
