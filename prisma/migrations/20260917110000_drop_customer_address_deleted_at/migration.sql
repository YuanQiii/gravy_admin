-- CustomerAddress 删除语义明确化为「有意硬删」（unify-soft-delete-mechanics / ADR 0016）：
-- 该列从未被任何写入路径赋值（读路径的 deletedAt 判断是永不为真的死条件），
-- 删除唯一入口为 CustomerAddressDeletionService（硬删）。

-- 防御性清理：删除潜在残留软删行，避免删列后它们"复活"为可见数据。
-- dev 库核查（2026-09-17）：命中 0 行（只读核查 SQL 见变更 tasks 3.1 备注）。
DELETE FROM "customer_addresses" WHERE "deletedAt" IS NOT NULL;

-- 删除索引与列
DROP INDEX IF EXISTS "customer_addresses_deletedAt_idx";
ALTER TABLE "customer_addresses" DROP COLUMN "deletedAt";
