## 1. Inquiry 删除机制统一（SoftDeleteService）

- [ ] 1.1 `packages/core/src/shared/services/soft-delete.service.ts` 新增 `softDeleteMany(model, idField, ids)`：`updateMany({ where: { [idField]: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } })`。验证：`tsc -p packages/core/tsconfig.json` 通过；单测覆盖「批量置 deletedAt」「已软删记录被跳过」。
- [ ] 1.2 `packages/domain/src/inquiry/inquiries/inquiries.service.ts` 的 `removeMany`（`:513-518`）改调 `this.softDelete.softDeleteMany(this.prisma.inquiry, 'inquiryId', ids)`，删除裸 `updateMany`。验证：`grep -n "softDeleteMany" inquiries.service.ts` 命中；`grep -n "updateMany" inquiries.service.ts` 在 removeMany 处不再出现 `deletedAt: new Date()` 写法。
- [ ] 1.3 单测：批量软删后查询不再返回这些记录；列表中含已软删 id 时幂等跳过不报错。验证：`pnpm test` 相关用例通过。

## 2. CustomerAddress 删除语义明确化（删列 + 清死条件）

- [ ] 2.1 `prisma/schema.prisma` 移除 `CustomerAddress.deletedAt`（`:787`）与 `@@index([deletedAt])`（`:803`）。验证：`grep -n "deletedAt" prisma/schema.prisma` 在 CustomerAddress 块内无命中（InquiryLine/Customer 等的 deletedAt 不受影响）。
- [ ] 2.2 Mall 读路径清理：`findMyAddresses`（`:73`）改 `where = { customerId }`；`assertOwned`（`:138`）改 `if (!address || address.customerId !== customerId)`。验证：`grep -n "deletedAt" apps/mall/src/modules/mall/addresses/customer-addresses.service.ts` 无命中。
- [ ] 2.3 Admin 读路径清理：`findAll`（`:61`）移除 `where.deletedAt = null`；`findOne`（`:82`）/`update`（`:97`）/`setDefault`（`:130`）/`remove`（`:153`）的存在性判断移除 `deletedAt` 分支，仅保留记录存在 + `customerId` 归属。验证：`grep -n "deletedAt" apps/admin/src/modules/addresses/addresses.service.ts` 无命中。
- [ ] 2.4 在 `packages/core` 新增 `ADDRESS_ACTIVE_WHERE` 常量（对标 `ACTIVE_FILTER_WHERE`，封装 `{ customerId }` 可见性谓词）；Mall `findMyAddresses`/`assertOwned` 与 Admin `findAll`/`findOne`/`update`/`setDefault`/`remove` 改为引用该常量，移除各自手写的 `where`/判断。验证：`grep -rn "ADDRESS_ACTIVE_WHERE" apps/mall apps/admin` 各读站点均命中；无残留 `deletedAt` 引用。
- [ ] 2.5 新增 `CustomerAddressDeletion` module，暴露 `removeForOwner(tx, customerId, addressId)` 与 `removeMany(ids)`（内部 `customerAddress.delete`/`deleteMany`）；Mall `removeForCustomer` 改用 `removeForOwner`（owner adapter），Admin `remove`/`removeMany` 改用 module（operator adapter），保留两信任维度不合并。验证：`grep -n "customerAddress.delete" apps/mall apps/admin` 仅出现在 module 内部；`pnpm test` 通过。
- [ ] 2.6 在删除 seam（`CustomerAddressDeletion` 与 schema 注释）处加 `DeleteStrategy.Hard` 显式标记（或引用一行 ADR），记录 CustomerAddress 为有意硬删 opt-out，避免死列回潮。验证：注释/标记存在；`grep -rn "deletedAt" apps/mall apps/admin packages` 对 CustomerAddress 无残留。
- [ ] 2.7 单测/e2e：删除默认地址后列表不返回该地址；二次删除/更新同一 `addressId` 返回 404；列表不因 `deletedAt` 过滤遗漏任何物理存在的地址。验证：`pnpm test:e2e` 地址相关套件全绿。

## 3. 迁移（删除 deletedAt 列，需用户显式确认）

- [ ] 3.1 **（迁移需用户显式确认后执行，属数据库变更，未经确认不跑）** 运行 `pnpm prisma:migrate:dev --name drop_customer_address_deleted_at` 生成迁移。验证：命令在用户确认后成功执行，`prisma/migrations/` 下新增迁移目录。
- [ ] 3.2 进入生成的 `migration.sql`，在 `DROP COLUMN "deletedAt"` 之前追加防御性 `DELETE FROM "customer_addresses" WHERE "deletedAt" IS NOT NULL;` 与注释说明「清理潜在残留软删行，避免删列复活」。验证：迁移文件同时含 `DELETE` 清理与 `ALTER TABLE "customer_addresses" DROP COLUMN "deletedAt"`；`pnpm prisma:generate` 通过。
- [ ] 3.3 本地 dev 库执行迁移并校验：无残留 `deletedAt` 行、列已移除、地址读写正常。验证：`psql` 执行 `\d customer_addresses` 确认无 `deletedAt` 列；`pnpm test` 通过。

## 4. 规格与文档同步

- [ ] 4.1 归档时由 `/opsx-archive` 将 `specs/inquiry/spec.md` 与 `specs/customer/spec.md` 的 delta 合并进主规格（本次不执行，仅标注）。验证：`openspec archive unify-soft-delete-mechanics` 后主规格含统一软删与硬删无 deletedAt 的约束。
- [ ] 4.2 复查 `AGENTS.md`/文档中若有「CustomerAddress 软删」相关描述，订正为硬删语义（仅改描述，不动 schema）。验证：`grep -rn "CustomerAddress" AGENTS.md docs/` 描述与硬删一致。

## 5. 校验

- [ ] 5.1 运行 `openspec validate unify-soft-delete-mechanics --strict` 通过。验证：命令退出码 0，无 MODIFIED 遗漏 scenario 等告警。
- [ ] 5.2 `pnpm build` 全量构建通过（core/domain/mall/admin）。验证：构建无类型错误。
