# GVRAY Admin

🚀 基于 **NestJS 11**、**TypeScript**、**Prisma**、**PostgreSQL**、**Redis** 构建的企业级后台管理脚手架，内置 **RBAC 权限管理**、**JWT 认证**、**Swagger/OpenAPI**、**Docker 部署** 与 **AI 开发支持**，可直接作为企业后台项目的 **Starter Template**。


## ✨ 特性亮点

- 🔐 **RBAC 权限体系** —— 动态权限扫描、菜单权限、API 权限、权限缓存，开箱即用
- 🛡️ **JWT 双 Token 认证** —— Access Token / Refresh Token、Passport、bcrypt 密码加密
- ⚡ **Redis 深度集成** —— 会话管理、在线用户、接口限流、分布式锁、Pub/Sub、声明式缓存
- 🏗️ **NestJS 11 + TypeScript** —— 模块化架构、依赖注入、严格类型检查
- 📝 **Prisma 6 ORM** —— 类型安全查询，Migration / Seed / 事务全支持
- 📄 **Swagger / OpenAPI** —— 自动生成文档，Bearer Token 在线调试
- 🏢 **组织架构** —— 用户 / 角色 / 部门 / 岗位完整体系
- 🔑 **多方式登录** —— 用户名、邮箱、手机号、User ID
- 🛡️ **安全防护** —— CORS、统一异常、参数校验、日志脱敏、密码哈希
- 🐳 **Docker 优先** —— 开发 / 测试 / 生产三套配置，支持滚动更新
- 🤖 **AI Ready** —— 内置 `AGENTS.md` 与模块化知识库，TRAE / Claude Code / Cursor 等 AI 编程助手直接用
- 🎯 **规范化工程** —— ESLint、Prettier、统一响应格式、完整种子数据

## 🛠️ 技术栈

NestJS 11 · Prisma 6 · TypeScript 5 · PostgreSQL 17 · Redis 6 · Swagger · Docker

## 🚀 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9（Corepack 内置，`corepack enable` 即可）
- PostgreSQL >= 17
- Redis >= 6.0
- Docker（可选）

```bash
git clone https://github.com/gvray/gvray-admin.git && cd gvray-admin

pnpm install
cp .env.example .env

# 方式一：Docker 启动 PostgreSQL + Redis
docker compose -f docker-compose.dev.yml up -d postgres redis

# 方式二：已有本地 PostgreSQL + Redis，配置 .env 后跳过上一步

pnpm prisma:migrate:dev
pnpm prisma:seed
pnpm start:admin:dev
# 需要商城端时另开终端：pnpm start:mall:dev
```

- 应用：`http://localhost:3000`
- Swagger：`http://localhost:3000/api`（点击 Authorize，输入 `Bearer <accessToken>`）

## 👤 默认账户

> ⚠️ 仅用于本地开发，请勿用于生产。

| 角色    | 用户名          | 邮箱                  | 密码     |
| :------ | :-------------- | :-------------------- | :------- |
| 超级管理员 | `super_admin` | `super@example.com`   | `123456` |
| 管理员   | `admin`        | `admin@example.com`   | `123456` |
| 游客    | `guest`         | `guest@example.com`   | `123456` |

## 📁 项目结构

```
apps/
├── admin/              # Admin 应用（运营端）—— 独立进程 / 端口 / 镜像 / Swagger
│   └── src/
│       ├── modules/    # 业务模块 + system/（用户·角色·部门·岗位·菜单·配置·字典·公告·日志·监控）
│       ├── core/       # admin 专属基础设施（feature-flag 守卫、会话心跳拦截器）
│       └── main.ts     # 引导（共享引导逻辑走 @gvray/core 的 configureApp）
└── mall/               # Mall 应用（商城端）—— 匿名浏览 + 客户自助，纯后端 API（无前端页面）
    └── src/
        ├── modules/    # mall（浏览 / 收藏 / 询价）、customer-auth、customer-activity
        ├── core/       # 客户认证基础设施（CustomerJwtGuard / customer-jwt.strategy）
        └── main.ts

packages/
├── core/               # @gvray/core：共享内核（decorators / guards / interceptors / filters /
│                       #   pipes / strategies / prisma / redis / logging / shared 含 BaseService）
└── domain/             # @gvray/domain：共享领域包（equipment 五件套 + inquiry，providers-only）

prisma/                 # Schema + 迁移 + Seed（单一所有权，两个应用共享）
docs/                   # 项目文档（含 adr/ 决策记录）
hermes/                 # 经验库（踩坑 / 工程模式 / 决策摘要）
.agents/project/        # agent 按需语料（路由表见 AGENTS.md）
openspec/               # 行为规格与变更流水线
wayfinder/              # 在役专题地图与工单
docker/                 # Docker 部署配置
```

> 📖 [完整项目结构 →](docs/project-structure.md)

## ❓ 为什么选 GVRAY Admin

普通 NestJS Starter 只给骨架，企业项目真正需要的部分还得自己搭。

| | 普通 Starter | **GVRAY Admin** |
|:---|:---:|:---:|
| RBAC 权限 + 动态扫描 | ✗ | ✅ |
| JWT 双 Token + 刷新 | ✗ | ✅ |
| Redis 限流 / 分布式锁 | ✗ | ✅ |
| 完整组织架构（部门/岗位） | ✗ | ✅ |
| Swagger 自动文档 | 基础 | ✅ 含在线调试 |
| Docker 三套环境 | ✗ | ✅ |
| AI 助手上下文 | ✗ | ✅ |
| 规范化目录 + 种子数据 | ✗ | ✅ |

## 🗺️ Roadmap

- [x] JWT 双 Token 认证
- [x] RBAC 权限体系 + 动态扫描
- [x] Prisma ORM + 完整 Seed
- [x] Redis 深度集成
- [x] Swagger / OpenAPI
- [x] Docker 三套部署
- [x] 用户 / 角色 / 部门 / 岗位管理
- [x] 菜单管理
- [x] 系统配置项
- [x] 字典管理
- [x] 公告通知
- [x] 操作日志 / 登录日志
- [x] 在线用户
- [x] 系统监控（服务器 / 缓存）
- [ ] WebSocket 实时通知
- [ ] 定时任务
- [ ] 文件存储
- [ ] 多租户
- [ ] OpenTelemetry
- [ ] Kubernetes 部署

## 🤖 AI 编程支持

- [`AGENTS.md`](./AGENTS.md) — AI 编程助手自动加载入口（TRAE / Claude Code 等通用）
- [`.agents/project/`](./.agents/project/) — 按需知识库（架构 / DTO / 权限 / 响应格式）

> 📖 [AI 开发指南 →](docs/ai-development.md)

## 📚 文档

| 文档 | 说明 |
|:---|:---|
| [🐳 Docker 部署指南](docs/deployment.md) | 开发 / 测试 / 生产部署、滚动更新 |
| [📋 统一响应格式](docs/response-format.md) | API 响应规范 |
| [⚙️ 系统配置项](docs/configs.md) | 前后端配置关联 |
| [🏗️ 项目结构详解](docs/project-structure.md) | 目录结构与模块说明 |
| [🧪 API 测试指南](docs/api-testing.md) | Swagger 调试与认证流程 |
| [领域术语表](CONTEXT.md) | Customer / User 边界、Equipment / Filter、Inquiry 状态机、文档层术语 |
| [架构决策记录](docs/adr/) | 17 篇 ADR：为什么这样设计、哪些方案被否决 |
| [行为规格与变更流水线](openspec/) | 已定稿规格在 `specs/`，在途变更在 `changes/` |
| [在役专题地图](wayfinder/) | 正在推进的专题、已定基线、禁止重开项 |
| [经验库](hermes/) | 踩坑 / 工程模式 / 决策摘要 |

## 🌐 配套前端

- [gvray-react](https://github.com/gvray/gvray-react) — React + Umi
- **gvray-vue**（开发中）— Vue 3 + Vite + Pinia + Element Plus
- **gvray-vite**（开发中）- React + Vite
- **gvray-next**（筹备中）- Nextjs

## 🤝 参与贡献

欢迎提 Issue、PR 或功能建议。如果这个项目对你有帮助，**点个 ⭐ Star 是最大的支持！**

本项目采用 [MIT 许可证](LICENSE) 开源。
