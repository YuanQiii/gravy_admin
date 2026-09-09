-- AlterTable
ALTER TABLE "equipment_brands" ADD COLUMN     "hotOrder" INTEGER,
ADD COLUMN     "isHot" BOOLEAN NOT NULL DEFAULT false;
