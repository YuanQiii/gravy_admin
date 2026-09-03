-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PermissionOrigin" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MenuType" AS ENUM ('CATALOG', 'MENU');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "gender" VARCHAR(16),
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "departmentId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "roleId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "dataScope" INTEGER NOT NULL DEFAULT 1,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" SERIAL NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_departments" (
    "id" SERIAL NOT NULL,
    "roleId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "permissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "httpMethod" TEXT,
    "description" TEXT,
    "origin" "PermissionOrigin" NOT NULL DEFAULT 'SYSTEM',
    "deletedAt" TIMESTAMP(3),
    "mutable" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" SERIAL NOT NULL,
    "menuId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MenuType" NOT NULL,
    "permissionCode" TEXT,
    "code" TEXT,
    "path" TEXT,
    "icon" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "parentMenuId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "manager" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" SERIAL NOT NULL,
    "positionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_positions" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_types" (
    "id" SERIAL NOT NULL,
    "typeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictionary_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_items" (
    "id" SERIAL NOT NULL,
    "itemId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictionary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configs" (
    "id" SERIAL NOT NULL,
    "configId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'string',
    "group" TEXT NOT NULL DEFAULT 'system',
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_logs" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "result" VARCHAR(16) NOT NULL,
    "loginType" TEXT NOT NULL DEFAULT 'username',
    "failReason" TEXT,
    "location" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "nickname" TEXT,
    "module" TEXT,
    "action" TEXT,
    "resource" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query" JSONB,
    "body" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "result" VARCHAR(16) NOT NULL,
    "message" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" SERIAL NOT NULL,
    "noticeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" VARCHAR(16) NOT NULL DEFAULT 'notice',
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notice_reads" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notice_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_brands" (
    "id" SERIAL NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "equipment_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_catalogs" (
    "id" SERIAL NOT NULL,
    "catalogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "equipment_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filter_types" (
    "id" SERIAL NOT NULL,
    "filterTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "filter_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filters" (
    "id" SERIAL NOT NULL,
    "filterId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "gencode" TEXT,
    "volume" DECIMAL(10,3),
    "weight" DECIMAL(10,3),
    "dimensionD1" DECIMAL(10,2),
    "dimensionD2" DECIMAL(10,2),
    "dimensionD3" DECIMAL(10,2),
    "dimensionD7" TEXT,
    "dimensionH1" DECIMAL(10,2),
    "dimensionH2" DECIMAL(10,2),
    "dimensionH3" DECIMAL(10,2),
    "dimensionD8" TEXT,
    "annb" TEXT,
    "bynb" TEXT,
    "photoUuid" TEXT,
    "drawingUuid" TEXT,
    "compatibility" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" SERIAL NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "brandId" TEXT,
    "brandName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "productionDateStart" TIMESTAMP(3),
    "productionDateEnd" TIMESTAMP(3),
    "engineBrand" TEXT,
    "engineType" TEXT,
    "power" DECIMAL(10,2),
    "engineEnergy" VARCHAR(32),
    "catalogId" TEXT,
    "catalogName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_filters" (
    "id" SERIAL NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" SERIAL NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "inquiryNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "totalAmount" DECIMAL(12,2),
    "customerId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "shippingAddressId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_lines" (
    "id" SERIAL NOT NULL,
    "inquiryLineId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "filterId" TEXT,
    "productName" TEXT NOT NULL,
    "model" TEXT,
    "typeName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),
    "subtotal" DECIMAL(12,2),
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "inquiry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "nickName" TEXT NOT NULL,
    "avatar" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "openid" TEXT,
    "unionid" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" SERIAL NOT NULL,
    "addressId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "detailAddress" TEXT NOT NULL,
    "zipCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_favorites" (
    "id" SERIAL NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_history" (
    "id" SERIAL NOT NULL,
    "historyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_userId_key" ON "users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_roleId_key" ON "roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_roleKey_key" ON "roles"("roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_departments_roleId_departmentId_key" ON "role_departments"("roleId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_permissionId_key" ON "permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "menus_menuId_key" ON "menus"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "menus_code_key" ON "menus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "menus_path_key" ON "menus"("path");

-- CreateIndex
CREATE UNIQUE INDEX "departments_departmentId_key" ON "departments"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_positionId_key" ON "positions"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_key" ON "positions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_positions_userId_positionId_key" ON "user_positions"("userId", "positionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_types_typeId_key" ON "dictionary_types"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_types_code_key" ON "dictionary_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_types_name_key" ON "dictionary_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_items_itemId_key" ON "dictionary_items"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "configs_configId_key" ON "configs"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "configs_key_key" ON "configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenId_key" ON "refresh_tokens"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "operation_logs_createdAt_idx" ON "operation_logs"("createdAt");

-- CreateIndex
CREATE INDEX "operation_logs_userId_idx" ON "operation_logs"("userId");

-- CreateIndex
CREATE INDEX "operation_logs_module_idx" ON "operation_logs"("module");

-- CreateIndex
CREATE INDEX "operation_logs_action_idx" ON "operation_logs"("action");

-- CreateIndex
CREATE INDEX "operation_logs_result_idx" ON "operation_logs"("result");

-- CreateIndex
CREATE INDEX "operation_logs_requestId_idx" ON "operation_logs"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "notices_noticeId_key" ON "notices"("noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_notice_reads_userId_noticeId_key" ON "user_notice_reads"("userId", "noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_brands_brandId_key" ON "equipment_brands"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_brands_name_key" ON "equipment_brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_brands_slug_key" ON "equipment_brands"("slug");

-- CreateIndex
CREATE INDEX "equipment_brands_deletedAt_idx" ON "equipment_brands"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_catalogs_catalogId_key" ON "equipment_catalogs"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_catalogs_name_key" ON "equipment_catalogs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_catalogs_code_key" ON "equipment_catalogs"("code");

-- CreateIndex
CREATE INDEX "equipment_catalogs_deletedAt_idx" ON "equipment_catalogs"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "filter_types_filterTypeId_key" ON "filter_types"("filterTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "filter_types_name_key" ON "filter_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "filter_types_code_key" ON "filter_types"("code");

-- CreateIndex
CREATE INDEX "filter_types_deletedAt_idx" ON "filter_types"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "filters_filterId_key" ON "filters"("filterId");

-- CreateIndex
CREATE UNIQUE INDEX "filters_model_key" ON "filters"("model");

-- CreateIndex
CREATE UNIQUE INDEX "filters_gencode_key" ON "filters"("gencode");

-- CreateIndex
CREATE INDEX "filters_deletedAt_idx" ON "filters"("deletedAt");

-- CreateIndex
CREATE INDEX "filters_typeName_idx" ON "filters"("typeName");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_equipmentId_key" ON "equipment"("equipmentId");

-- CreateIndex
CREATE INDEX "equipment_deletedAt_idx" ON "equipment"("deletedAt");

-- CreateIndex
CREATE INDEX "equipment_brandId_idx" ON "equipment"("brandId");

-- CreateIndex
CREATE INDEX "equipment_catalogId_idx" ON "equipment"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_brandName_model_key" ON "equipment"("brandName", "model");

-- CreateIndex
CREATE INDEX "equipment_filters_deletedAt_idx" ON "equipment_filters"("deletedAt");

-- CreateIndex
CREATE INDEX "equipment_filters_filterId_idx" ON "equipment_filters"("filterId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_filters_equipmentId_filterId_key" ON "equipment_filters"("equipmentId", "filterId");

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_inquiryId_key" ON "inquiries"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_inquiryNo_key" ON "inquiries"("inquiryNo");

-- CreateIndex
CREATE INDEX "inquiries_deletedAt_idx" ON "inquiries"("deletedAt");

-- CreateIndex
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");

-- CreateIndex
CREATE INDEX "inquiries_customerId_idx" ON "inquiries"("customerId");

-- CreateIndex
CREATE INDEX "inquiries_createdById_idx" ON "inquiries"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_lines_inquiryLineId_key" ON "inquiry_lines"("inquiryLineId");

-- CreateIndex
CREATE INDEX "inquiry_lines_deletedAt_idx" ON "inquiry_lines"("deletedAt");

-- CreateIndex
CREATE INDEX "inquiry_lines_inquiryId_idx" ON "inquiry_lines"("inquiryId");

-- CreateIndex
CREATE INDEX "inquiry_lines_filterId_idx" ON "inquiry_lines"("filterId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customerId_key" ON "customers"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_username_key" ON "customers"("username");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phoneNumber_key" ON "customers"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "customers_openid_key" ON "customers"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "customers_unionid_key" ON "customers"("unionid");

-- CreateIndex
CREATE INDEX "customers_deletedAt_idx" ON "customers"("deletedAt");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_addresses_addressId_key" ON "customer_addresses"("addressId");

-- CreateIndex
CREATE INDEX "customer_addresses_deletedAt_idx" ON "customer_addresses"("deletedAt");

-- CreateIndex
CREATE INDEX "customer_addresses_customerId_idx" ON "customer_addresses"("customerId");

-- CreateIndex
CREATE INDEX "customer_addresses_isDefault_idx" ON "customer_addresses"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "customer_favorites_favoriteId_key" ON "customer_favorites"("favoriteId");

-- CreateIndex
CREATE INDEX "customer_favorites_filterId_idx" ON "customer_favorites"("filterId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_favorites_customerId_filterId_key" ON "customer_favorites"("customerId", "filterId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_history_historyId_key" ON "customer_history"("historyId");

-- CreateIndex
CREATE INDEX "customer_history_filterId_idx" ON "customer_history"("filterId");

-- CreateIndex
CREATE INDEX "customer_history_visitedAt_idx" ON "customer_history"("visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_history_customerId_filterId_key" ON "customer_history"("customerId", "filterId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("departmentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("roleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("permissionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_departments" ADD CONSTRAINT "role_departments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("roleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_departments" ADD CONSTRAINT "role_departments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("departmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_departments" ADD CONSTRAINT "role_departments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_departments" ADD CONSTRAINT "role_departments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_parentMenuId_fkey" FOREIGN KEY ("parentMenuId") REFERENCES "menus"("menuId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("departmentId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_positions" ADD CONSTRAINT "user_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_positions" ADD CONSTRAINT "user_positions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("positionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_positions" ADD CONSTRAINT "user_positions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("roleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dictionary_types" ADD CONSTRAINT "dictionary_types_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dictionary_types" ADD CONSTRAINT "dictionary_types_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dictionary_items" ADD CONSTRAINT "dictionary_items_typeCode_fkey" FOREIGN KEY ("typeCode") REFERENCES "dictionary_types"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_items" ADD CONSTRAINT "dictionary_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dictionary_items" ADD CONSTRAINT "dictionary_items_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "configs" ADD CONSTRAINT "configs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "configs" ADD CONSTRAINT "configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_notice_reads" ADD CONSTRAINT "user_notice_reads_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "notices"("noticeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_brands" ADD CONSTRAINT "equipment_brands_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment_brands" ADD CONSTRAINT "equipment_brands_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment_catalogs" ADD CONSTRAINT "equipment_catalogs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment_catalogs" ADD CONSTRAINT "equipment_catalogs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filter_types" ADD CONSTRAINT "filter_types_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filter_types" ADD CONSTRAINT "filter_types_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filters" ADD CONSTRAINT "filters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filters" ADD CONSTRAINT "filters_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "equipment_brands"("brandId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "equipment_catalogs"("catalogId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment_filters" ADD CONSTRAINT "equipment_filters_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("equipmentId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "equipment_filters" ADD CONSTRAINT "equipment_filters_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "filters"("filterId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "customer_addresses"("addressId") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiry_lines" ADD CONSTRAINT "inquiry_lines_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("inquiryId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiry_lines" ADD CONSTRAINT "inquiry_lines_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "filters"("filterId") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiry_lines" ADD CONSTRAINT "inquiry_lines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inquiry_lines" ADD CONSTRAINT "inquiry_lines_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("customerId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("customerId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "filters"("filterId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_history" ADD CONSTRAINT "customer_history_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("customerId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_history" ADD CONSTRAINT "customer_history_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "filters"("filterId") ON DELETE CASCADE ON UPDATE RESTRICT;

