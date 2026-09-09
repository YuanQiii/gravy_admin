# 项目结构详解

Monorepo 双应用 + 共享内核（ADR 0010）。结构总览：

```
apps/
├── admin/                  # Admin 应用（运营端，独立进程/端口/镜像/Swagger）
│   └── src/
│       ├── app.module.ts   # 挂载全量横切（OperationLog/FeatureFlag/RolesGuard/PermissionsGuard 等）
│       ├── main.ts         # Swagger + 端口（共享引导走 @gvray/core configureApp）
│       ├── core/           # admin 专属基础设施：JwtAuthGuard / RolesGuard / PermissionsGuard / jwt.strategy /
│       │                   #      SessionHeartbeatInterceptor（依赖 admin TokenService）
│       └── modules/        # 业务模块：auth / system / dashboard / profile / equipment / inquiry /
│                           #      customers / addresses ...
└── mall/                   # Mall 应用（商城端，独立进程/端口/镜像/Swagger）
    └── src/
        ├── app.module.ts   # 只挂 RequestLog/Response/HttpException/Throttler（无 OperationLog/FeatureFlag）
        ├── main.ts         # Swagger（标题 GVRAY Mall API）+ 端口
        ├── core/           # 客户认证基础设施：CustomerJwtGuard / customer-jwt.strategy / @CurrentCustomer()
        └── modules/
            ├── mall/       # 聚合：browse（filters/equipment/catalogs/brands/filter-types）
            │              #        + inquiries + addresses（匿名浏览 + 客户自助）
            ├── customer-auth/    # 客户认证（login/refresh/logout）
            └── customer-activity/# 客户收藏/浏览历史

packages/
├── core/                   # 共享内核 @gvray/core（唯一 import 面 = barrel index.ts）
│   └── src/
│       ├── core/           # decorators / filters / guards(公共) / interceptors / pipes / strategies / session
│       ├── shared/         # constants（权限码/敏感键/realm 等）、services（BaseService/VisibilityOpts 三分流）、utils
│       ├── prisma/         # Prisma Module / PrismaService（@Global()）
│       ├── logging/        # pino 结构化访问日志（RequestLogInterceptor / request-id middleware）
│       ├── redis/          # Redis 全局模块
│       └── bootstrap/      # bootstrapDatabase（db-bootstrap 深模块，ADR 0007）/ configureApp / baseline
└── domain/                 # 共享领域包 @gvray/domain（equipment 五件套 + inquiry 的 providers-only 服务与 DTO）

prisma/                     # Prisma Schema + migrations + seed（单一所有权，核心包相对路径消费）

scripts/                    # db-bootstrap.ts（薄 CLI）/ docker-build.ts / docker-deploy.ts ...
docker/                     # entrypoint.sh / nginx / 部署与构建脚本
openspec/                   # OpenSpec 变更提案与 specs
docs/                       # 文档 / ADR / 学习指南
```

## 启动命令

```bash
pnpm build                # build:packages → build:scripts → build:admin → build:mall
pnpm start:admin          # node dist/apps/admin/apps/admin/src/main.js
pnpm start:mall           # node dist/apps/mall/apps/mall/src/main.js
pnpm docker:dev:up        # dev compose 双 service（admin:3000，mall:3001）
pnpm docker:up            # 生产 compose 双 service
```

## Mall 路由旧→新映射（发布说明）

商城端在本次迁移中剥除历史路径前缀，并在类名/模块名统一 `b2c`→`mall`。**破坏性变更**，mall 调用方按下表同步：

| 旧路径（迁移前） | 新路径（迁移后） |
|---|---|
| `GET /b2c/filters` | `GET /filters` |
| `GET /b2c/filters/:id` | `GET /filters/:id` |
| `GET /b2c/equipment` | `GET /equipment` |
| `GET /b2c/equipment/:id` | `GET /equipment/:id` |
| `GET /b2c/catalogs` | `GET /catalogs` |
| `GET /b2c/catalogs/:id` | `GET /catalogs/:id` |
| `GET /b2c/brands` | `GET /brands` |
| `GET /b2c/brands/:id` | `GET /brands/:id` |
| `GET /b2c/brands/hot` | `GET /brands/hot` |
| `GET /b2c/filter-types` | `GET /filter-types` |
| `GET /b2c/filter-types/options` | `GET /filter-types/options` |
| `GET /b2c/filter-types/:id` | `GET /filter-types/:id` |
| `POST /customer/inquiries` | `POST /inquiries` ←B2C 客户询价 |
| `GET /customer/inquiries` | `GET /inquiries` |
| `GET /customer/inquiries/:id` | `GET /inquiries/:id` |
| `POST /customer/addresses` | `POST /addresses` ←客户自助收货地址 |
| `GET /customer/addresses` | `GET /addresses` |
| `PATCH /customer/addresses/:id` | `PATCH /addresses/:id` |
| `DELETE /customer/addresses/:id` | `DELETE /addresses/:id` |
| `POST /customer/auth/login` | `POST /auth/login` |
| `POST /customer/auth/refresh` | `POST /auth/refresh` |
| `POST /customer/auth/logout` | `POST /auth/logout` |
| `POST /customer/favorites` | `POST /favorites` |
| `GET /customer/history` | `GET /history` |

> 后台（Admin）路由零变化：`equipment/*`、`customer/addresses`、`inquiry/*`、`system/*` 等保持原样。