# 数据库与 schema

> 承接「改 schema / 迁移 / 级联行为 / 事务」这类任务。
> **容器启动时如何同步 schema**（db-bootstrap、fail-closed、dev 与生产的差异）归 [deployment.md](deployment.md)，此处不重复。

## 变更路径

| 场景 | 路径 |
| --- | --- |
| 开发改 `schema.prisma` | `pnpm prisma:migrate:dev`（生成 + 应用迁移）——**开发侧唯一的 schema 路径** |
| 生产应用已提交迁移 | admin 容器启动时自动 `migrate deploy`，不需要手工介入 |
| 首次为既有库接入迁移历史 | `pnpm prisma:migrate:baseline`（一次性；前置条件是线上 diff 为空） |

- **生产禁跑 `prisma db push`**（根文件的硬规则）；`prisma/migrations/` 是唯一权威的 schema 变更历史，**不要手工修改已提交的迁移文件**。
- `prisma/` 是 schema 的**单一所有者**：`schema.prisma` / `seed.ts` / `seeds/` 都在根目录，应用与包通过相对路径消费——不要在 `apps/*` 或 `packages/*` 下另建 schema 或第二份 seed。

## 级联是 DB 级的，不是应用级的

- `prisma/schema.prisma` **未声明** `relationMode`（Prisma 默认 `foreignKeys`）——关系约束由数据库**原生外键**实现：`prisma/migrations/0_init/migration.sql` 建出真实 `FOREIGN KEY`，并带 `ON DELETE SET NULL` / `CASCADE` / `RESTRICT`。
- **后果**：任何绕过 Prisma Client 的删除同样会触发级联。例如硬删 `customer_addresses` 会把 `inquiries.shippingAddressId` 置空。
- 所以删数据前**先查这张表被谁外键引用**，依据是 `migration.sql` 或 `schema.prisma` 的关系字段——不要只看 Prisma 模型那一侧。
- 相关决策：[ADR 0015](../../docs/adr/0015-inquiry-shipping-address-snapshot.md)（询价为什么快照地址）、[ADR 0016](../../docs/adr/0016-customer-address-hard-delete.md)（地址为什么硬删）。

## 事务

- 多表写入使用 `this.prisma.$transaction(...)`。**判据**：同一请求内对 **≥2 张表**有写操作，或写之前需先读并据此决定写什么（先查后判 / 条件更新 / 计数与写入耦合）时，必须包事务；**单表单条写入不需要**。
- ⚠️ 这条规范**无强制手段**，且与现状脱节——不要把邻近代码的写法当作正确示范。现状数据与复核方式记在 `AGENTS.md` 的「已知缺陷与待确认」，本文件只管判据。
