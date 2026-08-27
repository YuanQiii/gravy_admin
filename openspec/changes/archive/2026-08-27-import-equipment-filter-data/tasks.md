## 1. 备份与前置准备

- [x] 1.1 `.gitignore` 追加 `prisma/backups/` 条目，创建 `prisma/backups/` 目录；验证：`git check-ignore prisma/backups/test.txt` 返回该路径（确认忽略生效）、目录存在
- [x] 1.2 用 `pg_dump` 备份当前 `gvray_admin` 库到 `prisma/backups/gvray_admin_pre_migration_<YYYYMMDD_HHMMSS>.sql`，验证：文件大小 > 0（PowerShell `(Get-Item <file>).Length`）、文件头包含 `PostgreSQL database dump`、通过 MCP postgres 执行 `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'` 与库中实际表数一致确认备份时点状态

## 2. 迁移脚本骨架（staging + mapping 表）

- [x] 2.1 创建 `prisma/scripts/migrate_af_eqm_to_gvray.sql` 脚本骨架（**不放 `prisma/migrations/`——Prisma Migrate 保留目录**），包含 `\set ON_ERROR_STOP on` + `BEGIN;` + 6 张 `TEMP TABLE staging_af_eqm_*`（保留 bigint id，列定义与源 SQL 一致）+ 5 张 `TEMP TABLE mapping_*`（`source_id bigint, target_id uuid`）+ 末尾 `\if :commit COMMIT; \else ROLLBACK; \endif` 变量开关，验证：`psql -f` 执行完整脚本后无错误且数据未落库（默认 ROLLBACK 生效）
- [x] 2.2 在脚本中内联源 SQL 的 6 张相关表的 `CREATE TABLE` + `COPY ... FROM stdin; ... \.` 数据块（仅保留这 6 张表，剥离 `\restrict`、`OWNER TO soybean`、`setval`、`SEQUENCE`、`CREATE INDEX`、`ALTER TABLE ... OWNER TO`、其他表的 DDL/DML），验证：dry-run 中 staging 表行数与源 SQL 的 COPY 行数一致（brands ≈3224、catalogs ≈49、filter_types=8、filters ≈10484、equipment ≈132268、equipment_filters ≈121133）

## 3. 冲突与 dangling 探测

- [x] 3.1 在脚本中加入 unique 列重复探测 SQL：`equipment_brands.name`/`slug`、`equipment_catalogs.name`/`code`、`filter_types.name`/`code`、`filters.model`、`filters.gencode`（非 NULL）、`equipment.[brandName, model]`、`equipment_filters.[equipmentId, filterId]`，每项输出 `SELECT col, COUNT(*) ... HAVING COUNT(*)>1`，验证：dry-run 输出中每项探测查询都有对应结果区块（0 行时输出空结果集标记）
- [x] 3.2 在脚本中加入 dangling FK 探测 SQL：`equipment.brand_id` / `catalog_id` 与 `mapping_brands` / `mapping_catalogs` LEFT JOIN WHERE target_id IS NULL；`equipment_filters.equipment_id` / `filter_id` 与对应 mapping 表 LEFT JOIN，验证：dry-run 输出 dangling 行数（即使为 0）
- [x] 3.3 在 staging 加载后、mapping 表生成后执行 dry-run 跑探测块（`psql -f script.sql`，默认 ROLLBACK），把冲突与 dangling 数量与样本前 5 条输出给用户，验证：报告可读、数字与 staging 行数自洽

## 4. ETL 转换实现

- [x] 4.1 实现 `brands` ETL：`INSERT INTO equipment_brands (brand_id, name, slug, sort_order, status, deleted_at, created_at, updated_at, created_by_id, updated_by_id) SELECT m.target_id, s.name, s.slug, 0, CASE WHEN s.is_active THEN 'enabled' ELSE 'disabled' END, s.deleted_at, s.created_at, s.updated_at, NULL, NULL FROM staging_af_eqm_brands s JOIN mapping_brands m ON s.id = m.source_id`，验证：dry-run 中 `SELECT COUNT(*) FROM equipment_brands` = staging 行数、抽样 5 条 status 字段正确
- [x] 4.2 实现 `catalogs` ETL：`status='enabled'`、`sort_order=0`、`createdById`/`updatedById` NULL，验证：dry-run 行数一致、抽样 status='enabled'
- [x] 4.3 实现 `filter_types` ETL：含 `is_active→status` 转换、`sort_order` 直接映射，验证：dry-run 中 8 条记录全部入表、code 列无重复（AIR_FILTER/CABIN_AIR_FILTER/...）
- [x] 4.4 实现 `filters` ETL：`photo_uuid`/`drawing_uuid` **保留源原值**（不重新生成）、`type_name::text`、跳过 `search_vector`、`status='enabled'`、`sort_order` 直接映射、`compatibility` jsonb 直接映射，验证：dry-run 抽样 5 条 photo_uuid/drawing_uuid 与源一致、type_name 为文本值（AIR_FILTER 等）
- [x] 4.5 实现 `equipment` ETL：`brand_id`/`catalog_id` 通过 mapping_brands/mapping_catalogs join（LEFT JOIN dangling 置 NULL，**行本身仍插入**）、`production_date_start`/`end` 用 `::timestamp` 转换、`engine_energy::text`、跳过 `search_vector`、`status='enabled'`、`sort_order=0`、`brand_name`/`catalog_name`/`engine_brand`/`engine_type`/`power` 直接映射，验证：dry-run 中 `SELECT COUNT(*) FROM equipment` = staging 行数（dangling 不减行）；另单独验证 `SELECT COUNT(*) FROM equipment e LEFT JOIN mapping_brands mb ON e.brand_id = mb.target_id WHERE e.brand_id IS NULL` 的行数与 3.2 探测的 dangling brand 数一致（置 NULL 生效）；抽样 production_date_start 为 timestamp 类型
- [x] 4.6 实现 `equipment_filters` ETL：`equipment_id`/`filter_id` 通过 mapping join（用 `WHERE EXISTS` 过滤 dangling 行直接丢弃）、`deleted_at` NULL、`id` 自增，验证：dry-run 中 target 行数 = staging - dangling_discarded（此表才有丢弃语义）、抽样 5 条 (equipmentId, filterId) 均能在 equipment/filters 表中找到
- [x] 4.7 整体验证：每张目标表 `SELECT COUNT(*)` 与对应 staging 一致（equipment_filters 按 4.6 的丢弃公式调整），FK 完整性检查 `SELECT COUNT(*) FROM equipment e LEFT JOIN equipment_brands b ON e.brand_id = b.brand_id WHERE e.brand_id IS NOT NULL AND b.brand_id IS NULL` = 0，admin 域表（users/roles/menus/permissions/departments）行数与备份时点一致未受影响

## 5. dry-run 与最终 COMMIT

- [x] 5.1 完整 dry-run：`psql -f prisma/scripts/migrate_af_eqm_to_gvray.sql`（默认 ROLLBACK），输出完整报告（6 张表行数对比表、冲突明细前 5 条、dangling 数、抽样 5 条转换后记录、FK 完整性检查结果）给用户，验证：报告可读、行数与源 SQL 估算一致、无 PG 错误（`\set ON_ERROR_STOP on` 未触发中止）、跑完后目标表仍为空（ROLLBACK 生效）
- [x] 5.2 用户确认后，**同一脚本文件不做任何修改**，执行 `psql -v commit=true -f prisma/scripts/migrate_af_eqm_to_gvray.sql`（`\if :commit` 开关生效 COMMIT），验证：COMMIT 成功、`SELECT COUNT(*)` 各表行数与 dry-run 报告一致、`pnpm start:dev` 可正常启动且 equipment/filter 相关 API 能查询到迁移数据
- [x] 5.3 （范围扩充，用户已确认）修复 Prisma Decimal 序列化缺陷：class-transformer 对无 `@Type()` 元数据的 Decimal 对象执行 `new Decimal(undefined)` 导致 500（`@Transform` 不生效——它在内层 transform 崩溃之后才应用）。在 `FilterResponseDto`（volume/weight/dimensionD1-D3/H1-H3 共 9 字段）与 `EquipmentResponseDto`（power）加 `@Type(() => Number)` 走原语转换路径（null 原样保留），验证：`GET /equipment/filters?page=1&pageSize=3` 返回 200 且含非 NULL Decimal 行（DB 统计 2842 行）、抽查一条 power 非 NULL 的 equipment 详情返回 200

## 6. 收尾与文档

- [x] 6.1 在 `docs/adr/` 创建 `0004-import-equipment-filter-data.md`，记录迁移决策（grill 共识、staging+SQL ETL vs Prisma、gen_random_uuid vs UUID v5、审计 NULL、跳过 FTS、跳过空表/测试用户、dangling 处置、dry-run→COMMIT 变量开关、脚本放 `prisma/scripts/` 避开 Prisma Migrate 保留目录），验证：ADR 文件存在、遵循现有 ADR 0001-0003 格式
- [x] 6.2 确认 CONTEXT.md 无需更新：本次是纯数据导入，不引入新领域概念（staging/mapping/dangling 是一次性迁移实现细节，按约定**不写入** glossary）；仅当迁移暴露真实业务术语（如新枚举值、新业务实体）时才更新，验证：逐条核对 CONTEXT.md 现有条目与迁移后数据无冲突（如 filter type code 值域与 glossary 一致）
