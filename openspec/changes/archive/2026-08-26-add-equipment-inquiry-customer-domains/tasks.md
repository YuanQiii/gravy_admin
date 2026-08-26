## 1. Prisma schema 与数据库同步

- [x] 1.1 在 `prisma/schema.prisma` 末尾新增 12 个 model：`EquipmentBrand`、`EquipmentCatalog`、`FilterType`、`Filter`、`Equipment`、`EquipmentFilter`、`Inquiry`、`InquiryLine`、`Customer`、`CustomerAddress`、`CustomerFavorite`、`CustomerHistory`，遵循 design.md D2 命名与 D6/D7 onDelete/updatedAt 策略，业务表加 `createdById`/`updatedById` 审计字段（按 Q12 B 方案）
- [x] 1.2 运行 `pnpm prisma:generate` 验证 schema 语法合法，无类型错误
- [x] 1.3 用户确认后运行 `pnpm db:reset`（开发环境）或 `prisma db push` 同步表结构，验证 12 张表 + 索引 + FK 在 PostgreSQL 中正确创建

## 2. 共享常量、权限码与软删除服务

- [x] 2.1 新建 `src/shared/constants/equipment.constant.ts`，定义 `EQUIPMENT_ENGINE_ENERGY`（diesel/petrol/electric/hybrid/natural_gas）、`EQUIPMENT_STATUS`，导出常量数组与类型
- [x] 2.2 新建 `src/shared/constants/inquiry.constant.ts`，定义 `INQUIRY_STATUS`（draft/submitted/quoted/expired）、`INQUIRY_STATUS_TRANSITIONS`（合法流转矩阵）、`INQUIRY_NO_PREFIX='INQ'`，导出 `isValidStatusTransition(from, to)` 工具函数
- [x] 2.3 新建 `src/shared/constants/customer.constant.ts`，定义 `CUSTOMER_STATUS`
- [x] 2.4 编辑 `src/shared/constants/permissions.constant.ts`，追加 11 组权限码常量：`equipment:brand:*`、`equipment:catalog:*`、`equipment:filter:*`、`equipment:filter-type:*`、`equipment:equipment:*`、`inquiry:inquiry:*`、`inquiry:inquiry-line:*`、`customer:customer:*`、`customer:address:*`、`customer:favorite:*`、`customer:history:*`（list/create/read/update/delete 或子集，history 无 create/update）
- [x] 2.5 新建 `src/shared/services/soft-delete.service.ts`（架构深化，详见 ADR 0003）：3 方法 `assertUniqueActive(model, field, value, opts?)` / `softDelete(model, idField, id)` / `handleUniqueError(error, errorPrefix)`；内部查未软删除记录（抛 `{prefix}_DUPLICATED`）+ 查软删除记录（抛 `{prefix}_DUPLICATED_SOFT_DELETED`）；P2002 兜底转译；错误码后缀私有常量
- [x] 2.6 新建 `src/shared/services/soft-delete.module.ts`（`@Global() @Module({ providers: [SoftDeleteService], exports: [SoftDeleteService] })`），在 `app.module.ts` imports 注册
- [x] 2.7 新建 `src/shared/services/soft-delete.service.spec.ts`，6 核心场景：无占用/活跃占用/软删除占用/excludeId 排除自身/softDelete 设 deletedAt/handleUniqueError 区分 P2002 与非 P2002，mock Prisma delegate

## 3. equipment 模块骨架

- [x] 3.1 创建 `src/modules/equipment/brands/` 目录与文件骨架（dto/create-brand.dto.ts、query-brand.dto.ts、update-brand.dto.ts、brand-response.dto.ts、batch-delete-brands.dto.ts、brands.controller.ts、brands.service.ts、brands.module.ts），brands.service 注入 `SoftDeleteService`，create/update 调 `assertUniqueActive`、create catch P2002 调 `handleUniqueError`、remove 调 `softDelete`（D4），controller 用 `@RolesGuard`/`@PermissionsGuard` + 权限码 `equipment:brand:*`
- [x] 3.2 创建 `src/modules/equipment/catalogs/` 同结构骨架，service 注入 `SoftDeleteService` 处理软删除与唯一性（同 3.1 模式）
- [x] 3.3 创建 `src/modules/equipment/filter-types/` 同结构骨架，service 注入 `SoftDeleteService` 处理软删除与唯一性（同 3.1 模式）
- [x] 3.4 创建 `src/modules/equipment/filters/` 同结构骨架，service 注入 `SoftDeleteService`（同 3.1 模式）+ ILIKE 模糊搜索（spec: 模糊搜索滤清器）+ `typeName` 启用校验（spec: 校验 type_name）
- [x] 3.5 创建 `src/modules/equipment/equipment/` 同结构骨架，service 注入 `SoftDeleteService`（同 3.1 模式）+ 创建时从 brand/catalog 快照 `brandName`/`catalogName`（spec: 创建设备快照字段）+ `engineEnergy` 枚举校验（spec: 引擎能源枚举值）
- [x] 3.6 在 `equipment.service.ts` 添加 `attachFilters(equipmentId, filterIds[])`、`detachFilter(equipmentId, filterId)`、`listFilters(equipmentId)` 方法，实现 spec: 设备-滤清器多对多关联（幂等挂载、硬删卸载）
- [x] 3.7 创建 `src/modules/equipment/equipment.module.ts` 聚合 5 子模块，导入 `PrismaService`，导出子模块

## 4. inquiry 模块骨架

- [x] 4.1 创建 `src/modules/inquiry/inquiries/` 骨架，service 注入 `SoftDeleteService` 处理软删除与唯一性（同 3.1 模式）+ 状态流转校验（spec: 询价单状态流转，用 `isValidStatusTransition`）+ 状态变更时记录 `submittedAt`/`quotedAt`/`expiresAt`
- [x] 4.2 在 `inquiries.service.ts` 实现 `generateInquiryNo()` 方法（design.md D5：`pg_advisory_xact_lock` + 当月最大序号 + 1 + 3 次重试），在 `create()` 内调用并在事务内写入
- [x] 4.3 创建 `src/modules/inquiry/inquiry-lines/` 骨架，service 注入 `SoftDeleteService`（同 3.1 模式）+ 创建时从 Filter 快照 `productName`/`model`/`typeName` 写入明细（spec: 添加明细行）
- [x] 4.4 创建 `src/modules/inquiry/inquiry.module.ts` 聚合 2 子模块

## 5. customer 模块骨架

- [x] 5.1 创建 `src/modules/customer/customers/` 骨架，service 注入 `SoftDeleteService` 处理软删除与唯一性（同 3.1 模式，username/email/phone/openid/unionid 多字段校验，spec: 客户唯一约束与软删除）+ 列表查询时脱敏 `openid`/`unionid`（spec: 客户与管理员查询隔离，前 4 后 4）+ 响应 DTO 用 `plainToInstance({ excludeExtraneousValues: true })` 排除 `password`/`id`
- [x] 5.2 创建 `src/modules/customer/addresses/` 骨架，service 注入 `SoftDeleteService`（同 3.1 模式）+ 事务内切换默认地址（spec: 设置默认地址）
- [x] 5.3 创建 `src/modules/customer/customer-activity/` 骨架，含 `favorites.controller.ts`、`history.controller.ts`、`customer-activity.service.ts`、`customer-activity.module.ts`；service 实现 favorites 幂等创建/硬删（spec: 重复收藏幂等）+ history upsert 语义（spec: 重复浏览更新时间）+ history 分页查询（spec: 查询浏览历史分页）
- [x] 5.4 创建 `src/modules/customer/customer.module.ts` 聚合 3 子模块

## 6. 模块注册

- [x] 6.1 编辑 `src/app.module.ts`，在 imports 数组中注册 `EquipmentModule`、`InquiryModule`、`CustomerModule`，验证应用启动无错误

## 7. Seed 与菜单

- [x] 7.1 编辑 `prisma/seeds/permissions.ts`，追加 11 组权限码的 seed 写入逻辑（与现有权限 seed 模式一致），用户确认后运行 `pnpm prisma:seed` 验证权限写入
- [x] 7.2 编辑 `prisma/seeds/menus.ts`，追加 3 个新模块的菜单树（每个模块 1 个目录 + 1 个菜单项，绑定权限码），运行 `pnpm prisma:seed` 验证菜单写入
- [x] 7.3 不写入任何业务 seed 数据（决策 Q20：含 `filter_types` 字典），由后台 CRUD 录入

## 8. 文档

- [x] 8.1 新建 `CONTEXT.md`（项目根），按 domain-modeling 技能格式记录术语表：业务术语（`Customer`（B2C 消费者）、`User`（后台员工，RBAC）、`Inquiry`（询价单）、`InquiryLine`（询价明细）、`Filter`（滤清器）、`FilterType`（滤清器类型字典）、`Equipment`（设备档案）、`EquipmentCatalog`（设备目录）、`EquipmentBrand`（设备品牌），明确 `Customer` vs `User` 边界）+ 技术词汇小节（`SoftDeleteService`：横切服务，集中处理有 deletedAt 字段的 model 的软删除与唯一性校验，详见 ADR 0003）
- [x] 8.2 新建 `docs/adr/0002-independent-customer-model.md`，按 ADR 格式记录"为何独立 Customer 而非合并入 User"——B2C 与 RBAC 边界、微信 openid/unionid、审计字段不匹配、未来扩展性；列替代方案（合并入 User、丢弃用户域）与拒绝理由
- [x] 8.3 新建 `docs/adr/0003-centralize-soft-delete-service.md`，记录 SoftDeleteService 集中化决策（架构深化评审候选 1）：上下文（9 service 复制软删除逻辑致 locality 丧失）、决策（3 方法深 module，@Global 注入）、替代方案（复制/复合唯一约束/全局 P2002 过滤器/加到 BaseService）与拒绝理由、后果（9 service 依赖、P2002 兜底、不迁移 PermissionsService）

## 9. 验证

- [x] 9.1 运行 `pnpm build` 验证 TypeScript 编译无错误
- [x] 9.2 运行 `pnpm test` 验证现有单元测试无回归（如有针对 schema 的测试需更新 fixture）
- [x] 9.3 启动 `pnpm start:dev`，通过 Swagger UI（http://localhost:3000/api）冒烟测试：创建品牌→创建目录→创建滤清器类型→创建滤清器→创建设备→挂载滤清器→创建询价单（验证书号生成 `INQ{YYYYMM}-0001`）→创建客户→添加地址→收藏→浏览历史 upsert
- [x] 9.4 运行 `openspec validate --change add-equipment-inquiry-customer-domains --strict` 验证 OpenSpec 文档一致性
