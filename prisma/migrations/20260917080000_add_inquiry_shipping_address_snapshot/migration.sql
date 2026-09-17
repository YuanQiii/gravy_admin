-- AlterTable：询价单增加收货地址快照字段（全部可空 —— 匿名询价与"未选地址"都是合法状态）
ALTER TABLE "inquiries" ADD COLUMN     "shippingReceiver" TEXT,
ADD COLUMN     "shippingPhone" TEXT,
ADD COLUMN     "shippingProvince" TEXT,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingDistrict" TEXT,
ADD COLUMN     "shippingDetailAddress" TEXT,
ADD COLUMN     "shippingZipCode" TEXT;

-- 存量回填：把「引用仍然存活」的询价单的收货地址内容复制进快照。
-- 已被 ON DELETE SET NULL 置空的历史单据**没有数据源**，保持 null —— 此处不臆造数据。
-- 引用被置空且无快照，与"客户当初没选地址"不可区分，这是历史数据的已知边界。
UPDATE "inquiries" AS i
SET "shippingReceiver"      = a."receiver",
    "shippingPhone"         = a."phone",
    "shippingProvince"      = a."province",
    "shippingCity"          = a."city",
    "shippingDistrict"      = a."district",
    "shippingDetailAddress" = a."detailAddress",
    "shippingZipCode"       = a."zipCode"
FROM "customer_addresses" AS a
WHERE i."shippingAddressId" = a."addressId";
