# GVRAY Admin — Agent 指南

本文件是 agent 自动加载入口，只保留高优先级规则。详细规范按需读取，不在这里导入长文档。

## 项目概况

GVRAY Admin 是 NestJS 11 + TypeScript 后端，使用 Prisma 6 + PostgreSQL（数据库原生外键约束）、JWT 认证、RBAC 权限模型、Swagger/OpenAPI 和 Docker 部署。

## 关键目录

- `src/core/`：基础设施（decorators / guards / interceptors / filters / pipes / strategies）
- `src/modules/`：业务模块，系统管理模块在 `src/modules/system/`
- `src/prisma/`：Nest Prisma Module / PrismaService（`@Global()`）
- `prisma/`：`schema.prisma`、`seed.ts`、`seeds/`
- `src/shared/`：constants、DTO、interfaces、utils、services（含 BaseService）

## 开发硬规则

- 先读相关模块，不要整仓读取；文档与源码冲突时以源码为准。
- Controller 只处理路由、鉴权、DTO、Swagger；业务逻辑放 Service。
- 返回业务数据由 `ResponseInterceptor` 自动包装；自定义 message/code/分页用 `ResponseUtil`；分页结构为 `{ items, total, page, pageSize }`。
- 禁止返回未过滤的 Prisma 对象；禁止响应中出现 `password`、token、secret；禁止暴露数据库自增 `id`（对外暴露业务 UUID，如 `userId`）。
- 权限码使用 `src/shared/constants/permissions.constant.ts` 常量（`{module}:{resource}:{action}`），不硬编码。
- 路径使用 tsconfig alias（`@/*`），避免深层相对路径。
- 系统管理模块路由使用 `system/...` 前缀；受保护接口显式使用 `JwtAuthGuard`，配合 `RolesGuard` / `PermissionsGuard`，读取类监控接口可省略 `RolesGuard`。`FeatureFlagGuard` 是全局守卫，仅对标记 `@FeatureFlag(...)` 的路由生效。
- 获取当前用户统一使用 `@CurrentUser()`；跳过操作日志用 `@NoOperationLog()`。
- 改动涉及接口/权限/配置/响应/部署时，同步更新对应文档。
- 未经确认不运行数据库重置/迁移/seed、权限导入、部署发布等破坏性命令。
- 不确定文件位置时先 `grep` / `glob`，不假设路径。
- 错误信息与日志 message 统一使用英文，Swagger 描述统一使用中文。
- 提交使用 conventional commits（`feat:` / `fix:` / `refactor:` 等）。

## 数据库约定

- 本地开发数据库用 `docker-compose.dev.yml`（Postgres 17）；测试/生产用 `docker-compose.yml`。
- `prisma/schema.prisma` 使用 `relationMode = "prisma"`，无外键约束。
- 查询用户等敏感对象优先用 `select` 排除 `password`、自增 `id`；返回前用 DTO / `plainToInstance(..., { excludeExtraneousValues: true })` 控制结构。
- 多表写入或强一致场景使用 `this.prisma.$transaction(...)`。
- 无 migrations 时 `docker/entrypoint.sh` 会 fallback 到 `prisma db push`。

## 按需阅读

- 改 DTO / Swagger → [.agents/project/dto-swagger.md](.agents/project/dto-swagger.md)
- 改权限码 / 权限扫描 → [.agents/project/permissions.md](.agents/project/permissions.md)
- 改统一响应格式 → [.agents/project/response-format.md](.agents/project/response-format.md)
- 改配置项或 seed 配置 → [.agents/project/configs.md](.agents/project/configs.md)
- 改部署、Docker、环境变量 → [.agents/project/deployment.md](.agents/project/deployment.md)
- 改密码/日志/审计/安全策略 → [.agents/project/coding.md](.agents/project/coding.md)
- 新增/重构业务模块 → [.agents/project/architecture.md](.agents/project/architecture.md) + dto-swagger.md + permissions.md
- 工作流和上下文策略 → [.agents/project/workflow.md](.agents/project/workflow.md)

## 常用命令

```bash
pnpm start:dev          # 本地开发（watch）
pnpm build              # 构建
pnpm test               # 单元测试
pnpm prisma:generate    # 生成 Prisma Client
pnpm prisma:seed        # 会写入/更新种子数据（含权限、菜单），执行前确认
pnpm db:reset           # 会重置数据库，必须明确确认
pnpm docker:dev:up      # 启动 dev compose（含 Postgres）
pnpm docker:up          # 启动生产 compose
```