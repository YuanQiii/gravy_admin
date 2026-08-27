## Context

gvray 的 equipment / filter / catalog / brand / filter_type / equipment_filter 业务表 schema 已在 `add-equipment-inquiry-customer-domains` 变更中建立。当前 `gvray_admin` 库中这些表为空（仅 `equipment_brands` 1 条手工测试记录）。源数据来自另一项目 `soybean-admin-nest-backend` 的 pg_dump（17MB，PG 16.3/17.6，owner=soybean），与 gvray schema 不兼容：

- 主键：源 `bigint` 自增序列 → 目标 UUID 字符串（`@default(uuid())`）
- 状态：源 `is_active boolean` / `status='ENABLED'`（大写）→ 目标 `status varchar(16)` 小写值
- 枚举：源 PG enum 类型（`EqmEngineEnergyEnum`、`EqmFilterTypeEnum`）→ 目标 `varchar(32)` / `text`
- 日期：源 `date` → 目标 `timestamp(3)`
- 全文检索：源有 `search_vector tsvector` + GIN trigram + jsonb_path_ops 索引 → 目标 schema 无对应列
- 审计：源无 `createdById`/`updatedById` → 目标所有业务表均要求（FK → users.userId，可空）

直接 `psql -f` 加载会失败：源 SQL 的 `\restrict`、`OWNER TO soybean`、`setval`、sequence 语句与 gvray 库不兼容，且表名/列名/PK 类型全不同。需要 staging + ETL 中间层完成转换。

## Goals / Non-Goals

**Goals:**

- 把 6 张源表的 ~16 万条数据原子化导入 gvray 业务表
- 维持跨表 FK 完整性（`equipment.brand_id`、`equipment.catalog_id`、`equipment_filters.equipment_id`、`equipment_filters.filter_id` 通过 mapping 表重映射到新 UUID）
- 提供可验证、可回滚的 dry-run → COMMIT 两阶段流程
- 不污染 `prisma/schema.prisma`：staging 表与 mapping 表都用 `TEMP TABLE`（事务内可见、自动清理）

**Non-Goals:**

- 不引入全文检索能力（`search_vector`、GIN trigram、jsonb_path_ops 索引）—— 独立架构决策
- 不导入空表（`af_inq_*`、`af_usr_addresses/favorites/history`）与 6 条测试用户（`af_usr_users`）
- 不修改 `prisma/schema.prisma` 或 NestJS 业务代码
- 不重建源库的 PG enum 类型（目标用 `varchar` / `text` 替代）
- 不追溯真实数据创建者（审计字段置 NULL）

## Decisions

### D1: Staging 表 + 纯 SQL ETL（vs Prisma ORM 脚本 / 直接改写 SQL 文件）

**Choice**: 在 gvray 库内建 `af_eqm_*` 临时 staging 表（保留 bigint id 维持源 FK），用 `psql` 加载源数据（剥离 owner/sequence/setval），再用 `INSERT...SELECT` + 临时 mapping 表做批量转换。

**Rationale**: 16 万条数据用纯 SQL `INSERT...SELECT` 秒级完成；Prisma ORM 对 165k 条对象映射开销大（5-10x 慢）；直接改写 SQL 文件需在 COPY 块内重映射 UUID，极难正确。

**Alternatives**:
- Prisma + TypeScript ETL：可读性好但慢；分批事务复杂
- 直接改写 SQL 文件：UUID 在 COPY 块内重映射极难正确

### D2: `gen_random_uuid()` + 临时 mapping 表（vs UUID v5 确定性 / 复用源 UUID 列）

**Choice**: 每行用 `gen_random_uuid()` 生成新 UUID，并在 `TEMP TABLE mapping_*` 中存 `(source_bigint, target_uuid)` 维持跨表 FK 一致性。

**Rationale**: dry-run 与正式跑两次 UUID 不同不影响验证（每次 TRUNCATE+INSERT 全新数据）；不引入 UUID v5 哈希碰撞风险与额外依赖。

**Exception**: `filters.photo_uuid` / `drawing_uuid` 是文件资产 UUID，**保留源原值**（避免丢失已上传文件的引用关系）。

**Alternatives**:
- UUID v5 确定性生成：可重现但需引入 pgcrypto 或自定义函数，dry-run 与正式跑一致但收益有限
- 复用源 UUID 列：仅 filters 有 photo_uuid/drawing_uuid，与主键无关，不适用

### D3: 审计字段 createdById/updatedById 置 NULL（vs 映射到 admin / 创建专用 migration 用户）

**Choice**: 全部置 NULL，schema 允许（`String?`）。

**Rationale**: 这些数据真实创建者不是 gvray 任何 admin 用户；强行映射到某 superadmin 会污染 `OperationLog` 归因；将来在 `OperationLog` 单独记录"批量导入"事件即可追溯。

**Alternatives**:
- 映射到 superadmin userId：错误归因
- 新建专用 "migration" 系统用户：增加 schema 复杂度，无收益

### D4: 跳过全文检索列与索引（vs 通过 Prisma migration 引入）

**Choice**: 不导入 `search_vector` 列、不重建 GIN trigram / jsonb_path_ops 索引。

**Rationale**: gvray 当前查询逻辑不使用 PG 全文检索（Prisma schema 未声明 `searchVector`）；引入全文检索是独立架构决策（涉及 schema 变更、查询代码改造、migration），不应捆绑在数据迁移中。

**Alternatives**: 通过 Prisma migration 给目标表新增 `searchVector` 列与索引后导入 —— 应作为独立 ADR 与 migration 处理。

### D5: 状态字段映射规则

- 源有 `is_active=true` → 目标 `status='enabled'`
- 源有 `is_active=false` → 目标 `status='disabled'`
- 源无 `is_active`（仅 `deleted_at`）→ 目标 `status='enabled'`（默认值）
- `deleted_at IS NOT NULL` 的记录仍按上述规则填 `status`，并保留 `deletedAt`

适用表：`brands` / `catalogs` / `filter_types` 有 `is_active`；`filters` / `equipment` / `equipment_filters` 无 `is_active`。

### D6: 类型转换规则

- `date` → `timestamp(3)`：`::timestamp` 自动补 `00:00:00.000`（适用 `equipment.production_date_start` / `end`）
- PG enum → `text` / `varchar(32)`：`::text`（适用 `filters.type_name`、`equipment.engine_energy`）
- `numeric(p,s)` → `Decimal(p,s)`：直接（PG 类型一致）
- `tsvector`：跳过（目标无对应列）

### D7: 软删除记录全部迁移（vs 只迁移活跃记录）

**Choice**: 全部迁移，保留 `deletedAt`。

**Rationale**: 软删记录可能仍被外部引用或审计需要；目标 schema 同样支持软删除语义。unique 冲突（如 `equipment.[brandName, model]` 不区分 `deletedAt`）通过 dry-run 探测暴露。

**Alternatives**: 跳过 `deleted_at IS NOT NULL` 记录 —— 丢失历史资产。

### D8: dangling 引用处置

- `equipment.brand_id` dangling → 目标 `brand_id` 置 NULL（schema 允许）
- `equipment.catalog_id` dangling → 目标 `catalog_id` 置 NULL
- `equipment_filters.equipment_id` / `filter_id` dangling → 丢弃该 junction 行（无意义）
- dry-run 阶段全量报告 dangling 数量

### D9: 冲突处置策略

- unique 冲突：暂停，把冲突明细前 N 条给用户看，等用户定夺（保留首条 / 合并 / 全部跳过）
- dangling：按 D8 自动处置（语义已明示），自动继续
- dry-run 阶段一次性跑完所有冲突与 dangling 探测

### D10: dry-run → COMMIT 两阶段执行

**Choice**: 全程单事务包裹。脚本末尾用 psql 变量开关控制事务结局：`\if :commit COMMIT; \else ROLLBACK; \endif`。dry-run 跑 `psql -f script.sql`（默认 ROLLBACK）；用户确认后跑 `psql -v commit=true -f script.sql`（COMMIT）。**两次跑的是同一个文件、一个字节不改**。

**Rationale**: `AGENTS.md` 硬规则"未经确认不运行数据库迁移"。两阶段保证零惊喜；用变量开关而非"改脚本末尾的 ROLLBACK 为 COMMIT"，确保 dry-run 验证的脚本与正式提交的脚本完全一致（避免编辑引入差异）。

## Risks / Trade-offs

- [16 万条数据 ETL 性能] → Mitigation: 纯 SQL `INSERT...SELECT` 批量操作，预计秒级；不引入 ORM 开销
- [unique 约束冲突中止 ETL] → Mitigation: dry-run 先全量探测，冲突明细暴露给用户，0 冲突则直接走 INSERT
- [dangling FK 损坏数据] → Mitigation: 自动处置策略已定（置 NULL / 丢弃），dry-run 报告数量
- [事务超长致锁表] → Mitigation: `gvray_admin` 是本地开发库，无并发业务；事务内仅触及空业务表，无锁竞争
- [COMMIT 后发现问题需回滚] → Mitigation: `pg_dump` 备份作为最后兜底
- [源 SQL 含 `\restrict` 与 `OWNER TO soybean` 导致 psql 加载失败] → Mitigation: 脚本预处理剥离 `\restrict`、`OWNER TO`、`setval`、sequence 等无关语句
- [无法追溯真实数据创建者] → Trade-off: 审计字段 NULL；后续在 `OperationLog` 单独记录"批量导入"事件
- [丢失全文检索能力] → Trade-off: gvray 当前不使用 PG 全文检索；将来作为独立架构决策引入
- [17MB 双份存储] → Trade-off: 源 pg_dump 文件（17MB）与内联其 COPY 数据的迁移脚本（~17MB）同时在仓库中。可接受（一次性成本）；备选是脚本用 `\i` 引用独立抽取的数据文件，但会引入两文件耦合。另：`prisma/backups/` 备份目录需加入 `.gitignore`，避免含业务数据的备份被提交
- [脚本误放 `prisma/migrations/` 干扰 Prisma Migrate] → Mitigation: 脚本放在 `prisma/scripts/`（`prisma/migrations/` 是 Prisma Migrate 保留目录）

## Migration Plan

0. **gitignore**：`.gitignore` 追加 `prisma/backups/`（防止含业务数据的备份文件被提交）
1. **备份**：`pg_dump gvray_admin > prisma/backups/gvray_admin_pre_migration_<timestamp>.sql`
2. **预处理源 SQL**：生成 `prisma/scripts/migrate_af_eqm_to_gvray.sql`（**不放 `prisma/migrations/`**——Prisma Migrate 保留目录），内含
   - `\set ON_ERROR_STOP on`
   - `BEGIN;`
   - 建 6 张 `TEMP TABLE staging_af_eqm_*`（保留 bigint id）
   - 内联源 SQL 的 CREATE TABLE + COPY 数据块（剥离 owner/sequence/setval）
   - 建 5 张 `TEMP TABLE mapping_*`（`source_id bigint, target_id uuid`）
   - 末尾 `\if :commit COMMIT; \else ROLLBACK; \endif` 变量开关（见 D10）
3. **加载源数据到 staging**：脚本内 `COPY` 语句把源数据加载到 staging 表
4. **生成 mapping 表**：每表 `INSERT INTO mapping_* SELECT id, gen_random_uuid() FROM staging_*`
5. **冲突探测**（dry-run 报告）：
   - 各源表 unique 列重复探测（`SELECT col, COUNT(*) HAVING COUNT(*)>1`）
   - dangling FK 探测（`LEFT JOIN mapping_* WHERE target_id IS NULL`）
   - 输出冲突 / dangling 数量与样本
6. **执行 ETL**（按依赖顺序）：
   - `brands` → `catalogs` → `filter_types` → `filters` → `equipment` → `equipment_filters`
   - 每表 `INSERT INTO target SELECT ... FROM staging JOIN mapping_*`
   - junction 表 dangling 行用 `WHERE EXISTS (SELECT 1 FROM mapping_equipment ...)` 过滤
7. **验证**：行数对比（staging vs target）、抽样 5 条转换后记录、FK 完整性检查
8. **dry-run 阶段**：`psql -f script.sql`（默认 ROLLBACK）；输出报告给用户
9. **用户确认后**：`psql -v commit=true -f script.sql`（同一文件，COMMIT）

## Rollback

- dry-run 阶段：`ROLLBACK` 自动还原（staging/mapping 是 `TEMP TABLE` 自动清理，`TRUNCATE` 也回滚）
- `COMMIT` 后：用 `prisma/backups/gvray_admin_pre_migration_<timestamp>.sql` 还原（`psql -f` 重放备份）

## Open Questions

无。所有决策已通过 grill 流程与用户达成共识。
