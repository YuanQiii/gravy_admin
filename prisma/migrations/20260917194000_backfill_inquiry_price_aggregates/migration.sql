-- 回填询价单价格聚合（derive-inquiry-price-aggregates 4.2/4.3）：
-- subtotal = quantity × unitPrice；totalAmount = Σ(未软删明细行 subtotal)。
-- 幂等：WHERE 只命中与派生规则不符的行 —— 干净库上为 no-op（dev 库 2026-09-17
-- 核查：0 差异行），用于收敛生产环境的历史不一致数据。
-- 列名为 Prisma 原样 camelCase（未做 snake_case 映射），须带双引号。

-- 1) 明细行：仅回填 unitPrice 非空的行；unitPrice 为空的行保持原值不动
--    （历史手工值若非空则保留，运维侧已记录口径）。
UPDATE "inquiry_lines"
SET "subtotal" = "quantity" * "unitPrice"
WHERE "unitPrice" IS NOT NULL
  AND ("subtotal" IS NULL OR "subtotal" <> "quantity" * "unitPrice");

-- 2) 询价单合计：仅重算「存在可计算明细」的询价单；无明细或各行 subtotal
--    全空的询价单保持原值（不凭空置 NULL，避免丢失无派生依据的历史金额）。
UPDATE "inquiries" i
SET "totalAmount" = agg.total
FROM (
  SELECT "inquiryId", SUM("subtotal") AS total
  FROM "inquiry_lines"
  WHERE "deletedAt" IS NULL AND "subtotal" IS NOT NULL
  GROUP BY "inquiryId"
) agg
WHERE i."inquiryId" = agg."inquiryId"
  AND (i."totalAmount" IS NULL OR i."totalAmount" <> agg.total);
