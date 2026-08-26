## Context

参见 `proposal.md - Why`：外部源库 schema 已稳定且自洽，本变更将其 12 张表（3 业务域）迁移并入 GVRAY Admin。

约束（来自项目现状与已锁定的 28 个决策）：

- 当前 Prisma schema 已有 22 个 model（管理员体系、字典、配置、日志、通知），用 `Int` 自增主键 + `{entity}Id String @unique @default(uuid())` UUID 业务 ID；camelCase 列名；`status String @default("enabled") @db.VarChar(16)`；多数业务表有 `createdById`/`updatedById` 审计字段指向 `User.userId`；零 Prisma enum；零 FTS 基础设施；`prisma db push`（无 migrations 目录）。
- 源库用 bigint 序列自增、snake_case 列名、`af_*` 表前缀、PostgreSQL 原生 enum、tsvector+pg_trgm+触发器、`is_active`/`status` 混用、`deleted_at` 全表软删除。
- 已锁定决策（grilling 4 轮 28 题）：3 个新顶层模块（`equipment`/`inquiry`/`customer`）；独立 `Customer` 模型（不合并入 `User`）；丢 FTS 用 `ILIKE`；`String`+常量代替 enum；全部迁移表软删除；后台管理表加审计字段，B2C/关联表不加；`inquiries.created_by` 拆为 `customerId` + `createdById` 双字段；询价号应用层生成 `INQ{YYYYMM}-{4位序号}`；`photo_uuid`/`drawing_uuid` 保留为 `String?`；关联表沿用 `Int` 自增 + 复合唯一约束模式；不 seed 业务数据；写 `CONTEXT.md` + `ADR 0002`。

## Goals / Non-Goals

**Goals:**

- 将 12 张外部表迁移为符合项目约定的 Prisma model，与现有 22 个 model 风格一致
- 提供完整的模块骨架（controller/service/dto/module）供后续业务逻辑填充
- 建立权限码常量与菜单 seed，使新模块立即可挂载到 RBAC 体系
- 用 `CONTEXT.md` 明确 `Customer` vs `User` 边界，用 `ADR 0002` 记录独立 Customer 决策

**Non-Goals:**

- 不实现文件上传/对象存储集成（`photoUuid`/`drawingUuid` 仅作 String 字段，URL 拼接由 Service 层未来实现）
- 不实现微信 OAuth 登录流程（仅建模 `openid`/`unionid` 字段，登录流程后续模块实现）
- 不实现询价单定时过期任务（`quoted → expired` 流转的人工触发接口本期提供，定时任务后续补）
- 不引入全文搜索基础设施（决策 Q7 已说明）
- 不写入业务 seed 数据（决策 Q20 已说明，含 `filter_types` 字典）
- 不实现 B2C 客户自助注册/登录接口（本期仅建模与管理后台 CRUD，自助 API 后续做）
- 不重构现有 `User` 模型或 RBAC 体系

## Decisions

### D1. 模块布局：3 个顶层模块 + 10 个子模块

`src/modules/equipment/`（5 子模块：brands/catalogs/filter-types/filters/equipment）
`src/modules/inquiry/`（2 子模块：inquiries/inquiry-lines）
`src/modules/customer/`（3 子模块：customers/addresses/favorites+history 合一，因 history 仅 upsert+查询，与 favorites 共享 service 减少文件）

**替代方案**：合并为单个 `src/modules/catalog/`（拒绝——业务域边界清晰，合并让 service 过大）；嵌套 `src/modules/system/`（拒绝——非系统管理域）。

**取舍**：`favorites` 与 `history` 在 customer 模块下放同一 `customer-activity.service.ts`（两个 controller 共享一个 service），减少 5 文件。这偏离"每实体一模块"惯例，但二者字段极简、共享 `customerId` 上下文，合并合理。

### D2. Prisma schema 命名与映射

- 表名：`@@map("equipment_brands")`、`@@map("equipment_catalogs")`、`@@map("filter_types")`、`@@map("filters")`、`@@map("equipment")`、`@@map("equipment_filters")`、`@@map("inquiries")`、`@@map("inquiry_lines")`、`@@map("customers")`、`@@map("customer_addresses")`、`@@map("customer_favorites")`、`@@map("customer_history")`
- 字段名：camelCase，无 `@map`（与现有 `User.userId` 等一致）；DB 列名即 camelCase
- 业务 ID：`brandId`/`catalogId`/`filterTypeId`/`filterId`/`equipmentId`/`inquiryId`/`inquiryLineId`/`customerId`/`addressId`/`favoriteId`/`historyId`，均 `String @unique @default(uuid())`；关联表（`EquipmentFilter`）仅 `id Int` 自增，无业务 ID

### D3. 枚举值常量文件

新增 3 个常量文件，与 `permissions.constant.ts` 同目录：

- `src/shared/constants/equipment.constant.ts`：`EQUIPMENT_ENGINE_ENERGY`（diesel/petrol/electric/hybrid/natural_gas）、`EQUIPMENT_STATUS`（enabled/disabled）
- `src/shared/constants/inquiry.constant.ts`：`INQUIRY_STATUS`（draft/submitted/quoted/expired）、`INQUIRY_STATUS_TRANSITIONS`（合法流转矩阵）、`INQUIRY_NO_PREFIX`（"INQ"）、`INQUIRY_NO_FORMAT`（"YYYYMM"）
- `src/shared/constants/customer.constant.ts`：`CUSTOMER_STATUS`（enabled/disabled）

源库大写枚举值（`'DRAFT'`/`'DIESEL'` 等）迁移时统一转小写，匹配现有 `"enabled"` 风格。

### D4. 软删除与唯一约束校验集中化（SoftDeleteService）

源库部分索引（`WHERE deleted_at IS NULL`）Prisma 不支持。原计划在每个新 service 内联手写 `findFirst({ where: { name, deletedAt: null } })` 校验 + 错误码生成——会在 9 个 service 里逐字复制，locality 丧失（bug 修一处漏八处）。

经架构深化评审（详见 ADR 0003），改为集中到一个深 module `SoftDeleteService`：

- **位置**：`src/shared/services/soft-delete.service.ts` + `soft-delete.module.ts`（`@Global()`，与 PrismaModule 同模式）
- **Interface（3 方法）**：
  - `assertUniqueActive(model, field, value, opts?: {excludeIdField?, excludeIdValue?})`：内部查未软删除记录（命中抛 `ConflictException({prefix}_DUPLICATED)`）+ 查软删除记录（命中抛 `ConflictException({prefix}_DUPLICATED_SOFT_DELETED)`）。更新场景传 `excludeIdField/excludeIdValue` 排除自身。
  - `softDelete(model, idField, id)`：设 `deletedAt = new Date()`
  - `handleUniqueError(error, errorPrefix)`：P2002 → 抛 `ConflictException({prefix}_DUPLICATED)`；非 P2002 透传
- **并发策略**：DB 唯一约束作最后防线（不加 advisory lock）。`assertUniqueActive` 诊断软删除冲突；活跃记录冲突由 DB P2002 触发，调用方在 create 时用 `handleUniqueError` 兜底转译。接受 TOCTOU 极小概率窗口（admin 规模无问题）。
- **错误码**：调用方传前缀（如 `EQUIPMENT_BRAND_NAME`），Service 内部拼私有常量后缀 `_DUPLICATED` / `_DUPLICATED_SOFT_DELETED`。异常 message 用英文错误码（遵守 AGENTS.md）。
- **兼容性**：仅服务有 `deletedAt` 字段的 model（9 个业务表），约定非类型约束。事件型表（equipment_filters/favorites/history）不调用。
- **Scope**：不迁移现有 PermissionsService（其软删除模式不同，仅查询过滤无创建校验；本期限定新 9 service）。
- **索引**：每张软删除表加 `@@index([deletedAt])` 加速过滤。
- **测试**：6 核心场景（无占用/活跃占用/软删除占用/excludeId/softDelete/handleUniqueError P2002 区分），mock Prisma delegate。

**拒绝的替代方案**：(1) 9 份复制（拒绝，locality 丧失）；(2) `@unique([name, deletedAt])` 复合唯一约束（拒绝，Prisma 表达力受限 + 语义混乱）；(3) 全局 Prisma P2002 过滤器（拒绝，丢模块级错误码语义）；(4) 把方法加到 BaseService（拒绝，BaseService 已偏胖，god class 非深化）。详见 ADR 0003。

### D5. 询价单编号生成（事务内重试）

```typescript
async generateInquiryNo(): Promise<string> {
  const prefix = `INQ${format(new Date(), 'yyyyMM')}-`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await this.prisma.inquiry.findFirst({
      where: { inquiryNo: { startsWith: prefix } },
      orderBy: { inquiryNo: 'desc' },
    });
    const next = (last ? parseInt(last.inquiryNo.slice(-4), 10) : 0) + 1;
    const candidate = `${prefix}${String(next).padStart(4, '0')}`;
    try {
      await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate}))`; // 事务内串行化
      return candidate;
    } catch { /* fallthrough */ }
  }
  throw new BusinessException('INQUIRY_NO_GENERATION_FAILED');
}
```

实际编号写入在创建 Inquiry 的 `$transaction` 内完成，唯一约束冲突时事务回滚并重试。`pg_advisory_xact_lock` 用于串行化同月编号生成（项目已使用 PostgreSQL，无兼容问题）。

**替代方案**：DB 序列（拒绝——需原生 SQL 迁移）；UUID 编号（拒绝——不可读，不商用）。

### D6. 外键 onDelete 策略（逐表）

| FK | onDelete | 理由 |
|---|---|---|
| equipment.brandId → brands | Restrict | 品牌被引用禁删，先解绑 |
| equipment.catalogId → catalogs | Restrict | 同上 |
| equipment_filters.equipmentId → equipment | Cascade | 关联表随主体删 |
| equipment_filters.filterId → filters | Cascade | 同上 |
| inquiries.customerId → customers | Restrict | 询价单归客户，删客户先解绑 |
| inquiries.shippingAddressId → addresses | SetNull | 地址删了询价单保留 |
| inquiries.createdById → users | Restrict | 管理员不可删（与项目惯例一致） |
| inquiry_lines.inquiryId → inquiries | Cascade | 主表删则明细删 |
| inquiry_lines.filterId → filters | SetNull | 滤清器删了明细保留 |
| addresses.customerId → customers | Cascade | 客户删则地址删 |
| favorites.customerId → customers | Cascade | 同上 |
| favorites.filterId → filters | Cascade | 同上 |
| history.customerId → customers | Cascade | 同上 |
| history.filterId → filters | Cascade | 同上 |

注：Q6 全软删除后 `Cascade` 实际很少触发（软删不触发 FK cascade），但硬删时作为最后防线。

### D7. updatedAt 策略

- 业务表（9 张：brands/catalogs/filter_types/filters/equipment/inquiries/inquiry_lines/customers/addresses）加 `updatedAt DateTime @updatedAt`
- 事件型表（3 张：equipment_filters/favorites/history）不加 `updatedAt`，源库本就无 `updated_at`，语义为"创建即定，删除即删"

### D8. 文件骨架清单

```
src/shared/services/
  soft-delete.service.ts      # 新增（D4 集中化深 module）
  soft-delete.module.ts       # 新增（@Global）
  soft-delete.service.spec.ts # 新增（6 核心场景）
  base.service.ts             # 不动

src/shared/constants/
  equipment.constant.ts        # 新增
  inquiry.constant.ts         # 新增
  customer.constant.ts        # 新增
  permissions.constant.ts     # 编辑，追加 11 组权限码

src/modules/equipment/
  equipment.module.ts          # 聚合 5 子模块
  brands/{dto/, brands.controller.ts, brands.service.ts, brands.module.ts}
  catalogs/{dto/, catalogs.controller.ts, catalogs.service.ts, catalogs.module.ts}
  filter-types/{dto/, filter-types.controller.ts, filter-types.service.ts, filter-types.module.ts}
  filters/{dto/, filters.controller.ts, filters.service.ts, filters.module.ts}
  equipment/{dto/, equipment.controller.ts, equipment.service.ts, equipment.module.ts}

src/modules/inquiry/
  inquiry.module.ts
  inquiries/{dto/, inquiries.controller.ts, inquiries.service.ts, inquiries.module.ts}
  inquiry-lines/{dto/, inquiry-lines.controller.ts, inquiry-lines.service.ts, inquiry-lines.module.ts}

src/modules/customer/
  customer.module.ts
  customers/{dto/, customers.controller.ts, customers.service.ts, customers.module.ts}
  addresses/{dto/, addresses.controller.ts, addresses.service.ts, addresses.module.ts}
  customer-activity/{favorites.controller.ts, history.controller.ts, customer-activity.service.ts, customer-activity.module.ts}

prisma/
  schema.prisma                # 编辑，新增 12 model
  seeds/menus.ts               # 编辑，追加 3 模块菜单树
  seeds/permissions.ts         # 编辑，追加 11 组权限码

CONTEXT.md                     # 新建
docs/adr/0002-independent-customer-model.md  # 新建
```

### D9. CONTEXT.md 与 ADR 0002

- `CONTEXT.md`（项目根，新建）：纯术语表，定义 `Customer`（B2C 消费者，含微信登录）、`User`（后台员工，RBAC）、`Inquiry`（询价单，状态 draft→submitted→quoted→expired）、`InquiryLine`（询价明细）、`Filter`（滤清器）、`FilterType`（滤清器类型，字典）、`Equipment`（设备档案）、`EquipmentCatalog`（设备目录）、`EquipmentBrand`（设备品牌）的边界。无实现细节。
- `docs/adr/0002-independent-customer-model.md`：记录"为何独立 Customer 而非合并入 User"——B2C 与 RBAC 边界、微信字段、审计字段不匹配、未来扩展性。其他决策（丢 FTS、String 代替 enum、软删除）属"匹配项目约定"，不配 ADR。

## Risks / Trade-offs

- **[数据库唯一约束与软删除冲突]** → 软删除记录占用唯一值，新建同名实体被 DB 拒绝。Service 层返回 `*_DUPLICATED_SOFT_DELETED` 错误码提示恢复或换名；未来若需"软删除后重建同名"，可改用复合唯一约束 `@unique([name, deletedAt])`，但本期不引入。
- **[ILIKE 搜索性能]** → 大数据量下 `ILIKE '%kw%'` 无法走索引。本期 admin 规模够用；未来可引入 `pg_trgm` 扩展 + GIN 索引（需新增原生 SQL 迁移工作流）。
- **[询价号并发冲突]** → 高并发下 `pg_advisory_xact_lock` 串行化同月编号生成可能成瓶颈。本期 admin 规模无问题；若 B2C 高并发下单，需评估改为 DB 序列。
- **[关联表无 updatedAt]** → 偏离项目其他关联表（UserRole 等有 updatedAt）。但源库语义为事件型记录，强行加 updatedAt 语义错位；接受此不一致。
- **[favorites/history 合并 service]** → 偏离"每实体一 service"惯例。二者字段极简、共享 customerId 上下文，合并减少文件膨胀；若未来逻辑分化可拆分。
- **[Customer 无审计字段]** → 偏离项目业务表惯例。但 B2C 自助注册/微信登录无操作管理员，加 createdById/updatedById 反而语义错位（必填则无值可填）；接受此不一致，与 ADR 0002 关联说明。
- **[不 seed filter_types 字典]** → 前端下拉初始为空，需管理员手动录入类型。Q20 已确认；可考虑后续提供"一键导入标准字典"接口。

## Migration Plan

1. 编辑 `prisma/schema.prisma` 新增 12 model，运行 `pnpm prisma:generate` 验证 schema 合法
2. 运行 `pnpm db:reset`（开发环境，需用户确认）或 `prisma db push` 同步表结构
3. 新增 3 个常量文件 + 编辑 `permissions.constant.ts`，运行 `pnpm prisma:seed` 写入权限与菜单（需用户确认）
4. 新建 `SoftDeleteService` + `SoftDeleteModule`（`@Global()`）+ 单测，注册到 `app.module.ts`（架构深化，详见 ADR 0003）
5. 新建 3 个模块目录骨架（controller/service/dto/module），9 个业务 service 注入 `SoftDeleteService` 处理软删除与唯一性校验，编辑 `app.module.ts` 注册新模块
6. 新建 `CONTEXT.md` 与 `docs/adr/0002-*.md` + `docs/adr/0003-*.md`
7. 运行 `pnpm build` 验证编译，启动应用 smoke test 关键 CRUD

**回滚**：删除新增 model → `prisma db push --force-reset` 重置；删除新增模块目录与常量文件；删除 SoftDeleteService/Module + 单测；删除 CONTEXT.md 与 ADR 0002/0003。无生产数据依赖。

## Open Questions

无。所有材料性决策已在 grilling 4 轮 28 题中由用户确认。
