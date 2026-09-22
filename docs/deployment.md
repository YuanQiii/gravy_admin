# Docker 部署指南

> 面向人的操作手册。**机制与约束**（双 service 的挂载/入口行为、环境变量注意点、迁移策略的 fail-closed 细节）见 [.agents/project/deployment.md](../.agents/project/deployment.md)，两者不重复。

## 概览

项目有两套独立的 Docker 工作流：

| 工作流 | 文件 | 用途 |
|--------|------|------|
| **开发** | `docker-compose.dev.yml` | 本地开发，build + 热更新 |
| **测试 / 生产** | `docker-compose.yml` | 只 pull 镜像，env 外部注入 |
| **生产独立部署** | `docker/scripts/deploy.sh` | 滚动更新，自动回滚，独立管理 PostgreSQL |

两套 compose 都是**双 service**（`admin` + `mall`）。下文以 admin 为例，mall 的 service 名、镜像与端口见 [.agents/project/deployment.md](../.agents/project/deployment.md)。

---

## 一、本地开发（docker-compose.dev.yml）

挂载 `./apps` + `./packages`（pnpm workspace 的两个目录），修改代码自动热更新，无需手动重启。

```bash
# 启动（首次会 build dev 镜像）
pnpm docker:dev:up

# 查看日志
pnpm docker:dev:logs

# 停止并清理
pnpm docker:dev:down
```

**特点**
- 端口：`admin` 为 `3000`，`mall` 为 `3001`（`MALL_PORT`）
- PostgreSQL 密码固定为 `password`（仅本地用）
- **dev 容器不做任何 schema 同步**：`NODE_ENV=development` 时 `entrypoint.sh` 直接 exec 应用，schema 与 seed 由宿主机执行（`pnpm prisma:migrate:dev` + `pnpm prisma:seed`）

---

## 二、测试 / 生产（docker-compose.yml）

只 pull 镜像，不 build。所有敏感配置通过 `.env` 文件注入，代码里没有生产密钥。

### 2.1 准备 .env 文件

```bash
# 本地测试
cp .env.example .env
# 编辑 .env，填入测试用的值
```

```bash
# 生产服务器（ECS EC2）
# 直接在服务器上创建 .env，填入真实密钥
```

`.env` 最小配置：

```env
JWT_SECRET=your-strong-secret-here        # 必填，缺失则启动报错

# 以下有默认值，按需覆盖
NODE_ENV=production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=gvray_admin
# 注意：docker-compose.yml 中 DATABASE_URL 由 POSTGRES_USER + POSTGRES_PASSWORD + POSTGRES_DB 自动组装，
# 直接修改 .env 中的 DATABASE_URL 对 compose 模式不生效
DATABASE_URL=postgresql://postgres:password@postgres:5432/gvray_admin
PORT=3000
ENABLE_CORS=false
IMAGE=gvray/gvray-admin:latest             # 推荐指定固定版本
```

### 2.2 启动

```bash
# 启动（前台，需另开终端查看日志）
pnpm docker:up

# 查看日志
pnpm docker:logs

# 停止并清理
pnpm docker:down
```

### 2.3 指定镜像版本（推荐）

生产环境不要用 `latest`，用 Git SHA 或语义版本确保可追踪、可回滚：

```bash
# 方式一：.env 中指定
IMAGE=gvray/gvray-admin:a3f79f3 docker compose up -d

# 方式二：环境变量传入（适合 CI/CD）
IMAGE=gvray/gvray-admin:v1.2.3 docker compose up -d app
```

---

## 三、生产独立部署（deploy.sh）

与 docker-compose 完全独立。自己管理 PostgreSQL 容器，支持滚动更新和自动回滚。

### 前置：配置 .env.production

```bash
cp .env.example .env.production
# 必填：JWT_SECRET、DATABASE_URL
```

### 常用命令

```bash
# 部署最新镜像
pnpm docker:deploy

# 部署指定版本
pnpm docker:deploy -- -v a3f79f3

# 使用本地镜像（跳过 pull）
pnpm docker:deploy -- -n

# 查看状态
pnpm docker:deploy:status

# 查看日志
pnpm docker:deploy:logs

# 回滚到上一版本
pnpm docker:deploy:rollback

# 运行种子数据（有确认提示）
./docker/scripts/deploy.sh seed

# 完全重置，销毁所有容器和数据（有二次确认）
./docker/scripts/deploy.sh reset
```

**滚动更新流程**
1. 拉取新镜像
2. 停止旧容器，备份为 `_backup_<timestamp>`
3. 启动新容器
4. 60 秒健康检查（`GET /health`）
5. 检查失败 → 自动回滚旧容器
6. 保留最近 3 个备份，自动清理更旧的

---

## 四、镜像构建

```bash
# 构建并打 tag
pnpm docker:build

# 多架构构建（amd64 + arm64）
pnpm docker:build:multiarch

# 构建并推送到 Docker Hub
pnpm docker:build:push

# 构建后安全扫描
pnpm docker:build:scan
```

---

## 五、数据库管理

**容器启动不碰 schema 的定义方式**（本仓硬规则：生产禁跑 `prisma db push`，一切 schema 变更走 migration）：

| 环境 | 启动时行为 |
|---|---|
| 生产（admin 容器，`NODE_ENV !== development`） | 跑 `db-bootstrap`：应用已提交迁移（`prisma migrate deploy`）；`prisma/migrations/` 缺失或为空即**非零退出**，绝不回退 `db push`；空库自动 seed |
| 开发（`NODE_ENV=development`） | `entrypoint.sh` 直接 exec 应用，不做任何 schema 同步 |
| mall 容器（任何环境） | 镜像不含 migrations/schema，永不执行 schema 同步 |

迁移路径选择与一次性基线见 [.agents/project/deployment.md](../.agents/project/deployment.md) 的「数据库迁移策略」；决策依据见 [ADR 0007](adr/0007-db-bootstrap-deep-module.md)（fail-closed 引导）与 [ADR 0008](adr/0008-baseline-drift-gate-and-image-whitelist.md)（基线与镜像白名单）。

```bash
# 本地开发：只启动 PostgreSQL，不启动 app
pnpm db:up
pnpm db:down

# 手动操作（本地开发环境）
pnpm prisma:studio     # 打开数据库 GUI
pnpm prisma:seed       # 手动执行 seed
pnpm db:reset          # 重置数据库并重新 seed
```

---

## 六、故障排查

```bash
# 健康检查
curl http://localhost:3000/health

# 进入容器
docker exec -it gvray-admin-app sh

# 查看容器日志
docker logs gvray-admin-app
docker logs gvray-admin-postgres

# 检查端口占用
lsof -i :3000
```

**常见问题**

| 现象 | 原因 | 解决 |
|------|------|------|
| 启动报错 `JWT_SECRET is required` | `.env` 缺少 JWT_SECRET | 添加 JWT_SECRET 到 `.env` |
| 健康检查失败 → 自动回滚 | 应用启动超时或崩溃 | `docker logs gvray-admin-app` 查原因 |
| 数据库连接失败 | PostgreSQL 未就绪或密码错误 | 检查 DATABASE_URL 和 PostgreSQL 状态 |
| 端口已被占用 | 旧容器未清理 | `docker ps` 找到并停止旧容器 |
