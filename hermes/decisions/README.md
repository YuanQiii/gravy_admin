# Decisions — 决策逻辑

历史决策索引（**完整清单以 [docs/adr/](../../docs/adr/) 为准**，此处只给结论）与最近变更的决策摘要。**决策不是文档**——每条的"正反面/触发条件"是重点，避免重复推翻或重复踩否决。

---

## ADR 索引（权威版本在 [docs/adr/](../../docs/adr/)，此处只给结论）

| ADR | 结论 | 关联 |
|-----|------|------|
| 0001 | 从 MySQL 迁到 PostgreSQL（原生外键） | migrate-mysql-to-postgresql |
| 0002 | Customer 独立于后台 User，不并入 | independent-customer-model |
| 0003 | 软删除逻辑收敛到 `SoftDeleteService` 单点 | centralize-soft-delete-service |
| 0004 | 设备/滤芯数据来自遗留 pg_dump 导入 | import-equipment-filter-data |
| 0005 | 公开设备目录浏览：`@Public()` + 协作编排 `AccessGuard` + `BaseService.applyVisibility/assertVisible`；`VisibilityOpts` 三分流（`anonymous/b2c/admin`，删 `authenticated`）；加权排序扩展 + 下沉 `runWeightedSort` 深模块 | add-anonymous-equipment-access、add-equipment-inquiry-customer-domains、sink-b2c-weighted-sort-mechanism |
| 0006 | 结构化日志下沉为 `packages/core/src/logging/` 深模块，无抽象 Logger 接口；request interceptor 产 access log | add-structured-logging-collection |
| 0007 | 数据库引导下沉 `packages/core/src/bootstrap/` 深模块（DI），CLI 薄 adapter `scripts/db-bootstrap.ts` | migration-driven-schema-sync |
| 0008 | 基线漂移闸门 `DriftReport`（no drift/has drift/error）三态契约 + 镜像 prisma 载荷白名单（含 schema+migrations，排除 scripts/backups） | migration-driven-schema-sync |
| 0009 | 独立 B2C Customer JWT 认证域，realm 隔离，`SessionStore` 深接缝 + 薄适配器 | add-b2c-customer-auth-and-test-users |
| 0010 | 仓库内 Monorepo 双应用（`apps/admin` + `apps/mall`）+ 共享内核 `@gvray/core` / `@gvray/domain` | ADR 未记变更名 |
| 0011 | 客户域授权＝纯所有权模型（不引角色/权限码）；access 无状态、登出只撤 refresh、login/refresh 仅 IP 限流 | unify-customer-availability-gate（补充说明） |
| 0012 | 微信静默登录按 `openid` 建号，与账密账号**不关联不合并**；换取层 `WechatCode2SessionClient` 归 mall | ADR 未记变更名 |
| 0013 | 浏览历史每客户上限 100（同事务淘汰）；`recordView` 反转为 fire-and-forget 脱离响应链 | take-history-write-off-request-path |
| 0014 | 询价状态机补 `cancelled`，客户可提交/取消；明细行复用 `assertFilterBrowseable` + 上限 50；价格聚合改为服务端派生 | expose-inquiry-lines-in-detail、resolve-inquiry-expiry-semantics、derive-inquiry-price-aggregates |
| 0015 | `Inquiry` 冗余收货地址快照（创建时冻结），`shippingAddressId` 降级为溯源引用，保留 `ON DELETE SET NULL` | unify-soft-delete-mechanics |
| 0016 | `CustomerAddress` 有意硬删（删 schema 上的 `deletedAt` 列），删除唯一入口 `CustomerAddressDeletionService` | unify-soft-delete-mechanics |

## 最近变更决策摘要

### add-b2c-customer-auth-and-test-users（ADR 0009）
- 独立认证域：`POST customer/auth/login|refresh|logout`；凭证任一（username/email/phoneNumber）+ 密码。
- 抽**纯 Redis `SessionStore` 深接缝**（`store/verify/revoke(subjectId, token, meta, ns)`），不懂 User/Customer、不碰 Prisma。
- 后台 `TokenService` 与 `CustomerTokenService` 均为其薄适配器：后台沿用 `user` ns + 保留 `prisma.refreshToken` DB 归档；客户用 `customer` ns、纯 Redis、无 DB 归档（B2C 会话易失态）。两域 ns 隔离。
- 两域**共用同一签密钥**（YAGNI；触发：需单独轮换密钥时改按 realm 可注入）。
- **两套 JWT 校验本期不收敛**：`authenticateByRealm` 接缝只有 customer 一个消费者→假设接缝，缓做；两套只共享 realm 常量。触发：后台认证迁移/出现第二消费者。
- B2C 浏览保持匿名（不扩展 visibility）；登录态仅服务收藏/历史。会话互斥：customer token 进不了后台，后台 token 进不了 customer。
- 测试账号仅 `NODE_ENV=development`，2 条，密码 `123456`。

### add-hot-brands
- `EquipmentBrand` 增 `isHot Boolean @default(false)`、`hotOrder Int?`（单 migration）——不用 `sortOrder` 复用（互扰），不建关联表（单布尔够）。
- 生效设备数 `equipment groupBy({by:['brandId']})`，where 经 `applyVisibility(anonymous)` 注入 `status='enabled'` + `deletedAt=null`，不硬编码字面量。
- 合并排序**抽纯函数** `rankHotBrands(brands, deviceCounts, limit)`（[hot-ranking.ts](../../packages/domain/src/equipment/brands/hot-ranking.ts)），排序不变量单点，`findHot` 不复述。
- 路由与权限：`GET /equipment/brands/hot`（公开、声明在 `:id` 前、@Public+@Throttle）；`POST /equipment/brands/hot-status`（`equipment:hotBrand:update` + operation-log，单条批量同端点）；`BrandResponseDto` 带 `isHot/hotOrder`（`equipment:hotBrand:view` 载体）；普通 `UpdateBrandDto` **不**承载热门字段。

---

## 决策记录惯例
新变更归档后，把"关键决策 + 否决项 + 触发条件"回填到 `decisions/`（可新建 `YYYY-MMDD-topic.md` 或并入本文件的"最近变更"节）。否决项只保留"为何否决 + 何时复活"。