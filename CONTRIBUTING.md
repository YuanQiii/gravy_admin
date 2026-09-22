# 贡献指南

## 开始之前

- **包管理器只用 pnpm**：`package.json` 已声明 `packageManager: pnpm@9.15.9`。不要用 npm / yarn / bun 安装或改动依赖，也不要手改 `pnpm-lock.yaml`。
- 面向 AI 编码助手的硬规则在 [AGENTS.md](AGENTS.md)；业务术语与边界在 [CONTEXT.md](CONTEXT.md)。两份都不长，改代码前值得先扫一遍。

## 环境要求

- Node.js >= 20
- pnpm >= 9（`corepack enable` 即可）
- PostgreSQL >= 17、Redis >= 6.0（或直接用 Docker 起）

## 本地启动

```bash
pnpm install
cp .env.example .env

# 方式一：Docker 起 PostgreSQL + Redis
pnpm db:up

# 方式二：已有本地 PostgreSQL + Redis，配置 .env 后跳过上一步

pnpm prisma:migrate:dev     # 应用迁移（开发唯一 schema 路径）
pnpm prisma:seed            # 写入种子数据（含权限、菜单）
pnpm start:admin:dev        # Admin 应用，http://localhost:3000
pnpm start:mall:dev         # Mall 应用；两个应用本地默认都是 3000，同时起需 PORT=3001 pnpm start:mall:dev
```

> ⚠️ **不要用 `prisma db push`**：它绕过迁移、不可回滚，生产严禁。schema 变更一律走 `prisma:migrate:dev` 生成迁移。

## 默认测试账户（仅本地开发）

| 角色 | 用户名 | 邮箱 | 密码 |
| --- | --- | --- | --- |
| 超级管理员 | `super_admin` | `super@example.com` | `123456` |
| 管理员 | `admin` | `admin@example.com` | `123456` |
| 游客 | `guest` | `guest@example.com` | `123456` |

## 调试 API

1. 启动应用后打开 Swagger：`http://localhost:3000/api`
2. 调登录端点拿到 `accessToken`
3. 点右上角「Authorize」，填入 `Bearer <accessToken>` 即可调受保护端点

## 提交前必须通过

```bash
node scripts/check-docs.mjs                                      # 文档自检（改动文档时）
pnpm exec tsc -p apps/admin/tsconfig.json --noEmit               # 类型检查，四个 workspace 各跑一次
pnpm exec tsc -p apps/mall/tsconfig.json --noEmit
pnpm exec tsc -p packages/core/tsconfig.json --noEmit
pnpm exec tsc -p packages/domain/tsconfig.json --noEmit
pnpm test                                                        # 单元测试
```

- **类型检查必须用 `-p` 逐个 workspace 跑**：裸跑根目录 `tsc --noEmit` 会因根 tsconfig 的历史残留成批报 TS2307，那是测量方式问题，不代表代码有错。
- **格式与 lint 是"棘轮"**：全仓基线本来就是红的（fmt 212 文件 / lint 1718 条），要求是**你改动的文件不新增问题**：
  ```bash
  pnpm exec prettier --check <你改的 .ts>
  pnpm exec eslint <你改的 .ts>
  ```

## 提交与 PR

- 使用 conventional commits（`feat:` / `fix:` / `refactor:` / `docs:` …），**描述与正文用中文**，仅保留英文专有名词与技术术语。
- 文档改动与代码改动放在**同一个提交**里；改完代码请对照 [AGENTS.md](AGENTS.md) 的「按需阅读与同步更新」表判断要不要同步文档。
- [AGENTS.md](AGENTS.md)、`.agents/project/`、`docs/adr/`、`docs/experience/` 由 `CODEOWNERS` 把关，改动需经负责人评审。

## 需要先确认再执行的变更

以下几类操作**先说明影响范围、取得确认，再执行**（完整清单见 [AGENTS.md](AGENTS.md)）：

- 数据库：`pnpm db:reset`、`prisma:migrate:dev`、`prisma:seed`
- 权限数据：`POST /system/permissions/scan`（会按 Controller 元数据新增 / 更新 / **删除**权限记录）
- 生成物：`pnpm prisma:generate`、`pnpm build`、`pnpm openapi:export`
- 部署与基础设施：`pnpm docker:build`、`docker:deploy` 及其子命令、`docker compose down -v`
- 任何删除文件或重置数据的命令
