# AI 工作流

## 上下文策略

- 先定位任务涉及的模块，再读取 Controller → Service → DTO → 常量。
- 不要一次性读取 `apps/`、`packages/`、`docs/`、根目录大文档或生成文件。
- 涉及数据库变更时，再读取 `prisma/schema.prisma`、seed 和 seeds/ 下相关文件。
- 文档与源码/配置冲突时，以当前源码和配置为准；无法确认时标注"需确认"。

## 修改代码前

1. 阅读相关文件，理解现有模式。
2. 检查是否已有常量、工具函数、BaseService、ResponseUtil 或模块内模式可复用。
3. 确认接口响应不暴露 `password`、token、数据库自增 `id` 等敏感/内部字段。
4. 确认 Swagger DTO 与前后端契约一致。
5. 按 `AGENTS.md` 的「按需阅读与同步更新」表判断要不要动文档，要动就改完——那张表是读方向与写方向的**唯一出处**，不要另建清单。

## 添加新模块

1. 在 `apps/admin/src/modules/`（mall 为 `apps/mall/src/modules/`）下创建模块目录；系统管理类模块放 `apps/admin/src/modules/system/`，参考 `system/users`、`system/roles`、`system/configs` 等现有结构。
2. 在对应聚合 Module 中导入新模块（系统管理模块在 `apps/admin/src/modules/system/system.module.ts`）。
3. Controller 使用合适路径、Swagger tag、DTO 和鉴权守卫——**守卫用法以 `AGENTS.md`「开发硬规则」为准**（默认 `AccessGuard`，不要照抄旧写法）。
4. 如需 API 权限，在权限常量中定义权限码，并在 Controller 方法上使用 `@RequirePermissions()` 引用常量。
5. 写操作默认受 `GuestWriteGuard` 约束；确需允许游客写入时才显式添加 `@AllowGuestWrite()`。
6. 按需添加 `@OperationLog(...)` / `@NoOperationLog()`。
7. 按需更新 seed、配置项、权限扫描流程和文档说明。

## 数据库变更

1. 修改 `prisma/schema.prisma`。
2. 需要迁移时说明影响范围，确认后再运行 Prisma migration / generate。
3. 如需初始数据，更新 `prisma/seed.ts` 或 `prisma/seeds/` 下对应文件。
4. 同步 DTO、Service 查询、权限/配置 seed 和文档说明。

> 变更路径选择、级联行为与事务判据见 [database.md](database.md)。

## 命令安全边界

- 无需确认即可跑：相关 `pnpm test`、只读的 `grep` / `glob` / `git status` / `git diff`。
- **必须先确认再执行的清单在 `AGENTS.md` 的「开发硬规则」，此处不重复**——同一份清单写两处必然漂移。
- 补充一条不在那份清单里的：不要在用户未授权时操作生产环境、发布镜像、回滚部署或清空数据库。
