# GVRAY Admin

[简体中文](README.zh-CN.md) | **English**

🚀 An enterprise-grade admin backend scaffold built on **NestJS 11**, **TypeScript**, **Prisma**, **PostgreSQL**, and **Redis**, with built-in **RBAC permissions**, **JWT authentication**, **Swagger/OpenAPI**, **Docker deployment**, and **AI-assisted development** support — ready to use as a **Starter Template** for enterprise backend projects.

## ✨ Highlights

- 🔐 **RBAC Permission System** — dynamic permission scanning, menu permissions, API permissions, and permission caching out of the box
- 🛡️ **JWT Dual-Token Auth** — Access Token / Refresh Token, Passport, bcrypt password hashing
- ⚡ **Deep Redis Integration** — session management, online users, rate limiting, distributed locks, Pub/Sub, declarative caching
- 🏗️ **NestJS 11 + TypeScript** — modular architecture, dependency injection, strict type checking
- 📝 **Prisma 6 ORM** — type-safe queries, full support for migrations / seeds / transactions
- 📄 **Swagger / OpenAPI** — auto-generated docs, online debugging with Bearer Token
- 🏢 **Organization Structure** — complete system for users / roles / departments / positions
- 🔑 **Multi-Method Login** — username, email, phone number, User ID
- 🛡️ **Security Hardening** — CORS, unified exception handling, parameter validation, log redaction, password hashing
- 🐳 **Docker First** — dev / test / production configurations with rolling updates
- 🤖 **AI Ready** — built-in `AGENTS.md` and modular knowledge base, works directly with TRAE / Claude Code / Cursor
- 🎯 **Standardized Engineering** — ESLint, Prettier, unified response format, complete seed data

## 🛠️ Tech Stack

NestJS 11 · Prisma 6 · TypeScript 5 · PostgreSQL 17 · Redis 6 · Swagger · Docker

## 🚀 Quick Start

### Requirements

- Node.js >= 20
- pnpm >= 9 (built into Corepack, run `corepack enable`)
- PostgreSQL >= 17
- Redis >= 6.0
- Docker (optional)

```bash
git clone https://github.com/gvray/gvray-admin.git && cd gvray-admin

pnpm install
cp .env.example .env

# Option 1: Start PostgreSQL + Redis via Docker
docker compose -f docker-compose.dev.yml up -d postgres redis

# Option 2: Use an existing local PostgreSQL + Redis, configure .env and skip the previous step

pnpm prisma:migrate:dev
pnpm prisma:seed
pnpm start:admin:dev
# For the Mall app, open another terminal: pnpm start:mall:dev
```

- App: `http://localhost:3000`
- Swagger: `http://localhost:3000/api` (click Authorize and enter `Bearer <accessToken>`)

## 👤 Default Accounts

> ⚠️ For local development only — do not use in production.

| Role             | Username       | Email                | Password |
| :--------------- | :------------- | :------------------- | :------- |
| Super Admin      | `super_admin`  | `super@example.com`  | `123456` |
| Admin            | `admin`        | `admin@example.com`   | `123456` |
| Guest            | `guest`        | `guest@example.com`   | `123456` |

## 📁 Project Structure

```
apps/
├── admin/              # Admin app (operations) — separate process / port / image / Swagger
│   └── src/
│       ├── modules/    # Business modules + system/ (users · roles · departments · positions · menus · configs · dictionaries · announcements · logs · monitor)
│       ├── core/       # Admin-only infrastructure (feature-flag guard, session heartbeat interceptor)
│       └── main.ts     # Bootstrap (shared bootstrap logic lives in @gvray/core configureApp)
└── mall/               # Mall app (customer-facing) — anonymous browsing + customer self-service, backend API only (no frontend)
    └── src/
        ├── modules/    # mall (browse / favorites / inquiries), customer-auth, customer-activity
        ├── core/       # Customer auth infrastructure (CustomerJwtGuard / customer-jwt.strategy)
        └── main.ts

packages/
├── core/               # @gvray/core: shared kernel (decorators / guards / interceptors / filters /
│                       #   pipes / strategies / prisma / redis / logging / shared incl. BaseService)
└── domain/             # @gvray/domain: shared domain package (equipment suite + inquiry, providers-only)

prisma/                 # Schema + migrations + seed (single ownership, shared by both apps)
docs/                   # Project documentation (adr/ decision records, experience/ library)
.agents/project/        # Agent on-demand corpus (routing table in AGENTS.md)
openspec/               # Behaviour specs and change pipeline
wayfinder/              # Active topic maps and tickets
docker/                 # Docker deployment config
```

> 📖 [Full project structure →](docs/project-structure.md)

## ❓ Why GVRAY Admin

Typical NestJS starters only give you a skeleton — the parts an enterprise project actually needs, you still have to build yourself.

|                                  | Typical Starter | **GVRAY Admin** |
|:---------------------------------|:---:|:---:|
| RBAC permissions + dynamic scanning | ✗ | ✅ |
| JWT dual-token + refresh           | ✗ | ✅ |
| Redis rate limiting / distributed locks | ✗ | ✅ |
| Full org structure (departments/positions) | ✗ | ✅ |
| Swagger auto-docs                 | Basic | ✅ with online debugging |
| Docker three-environment setup    | ✗ | ✅ |
| AI assistant context              | ✗ | ✅ |
| Standardized structure + seed data | ✗ | ✅ |

## 🗺️ Roadmap

- [x] JWT dual-token authentication
- [x] RBAC permission system + dynamic scanning
- [x] Prisma ORM + complete seed
- [x] Deep Redis integration
- [x] Swagger / OpenAPI
- [x] Docker three-environment deployment
- [x] User / role / department / position management
- [x] Menu management
- [x] System configuration items
- [x] Dictionary management
- [x] Announcements & notifications
- [x] Operation logs / login logs
- [x] Online users
- [x] System monitoring (server / cache)
- [ ] WebSocket real-time notifications
- [ ] Scheduled tasks
- [ ] File storage
- [ ] Multi-tenancy
- [ ] OpenTelemetry
- [ ] Kubernetes deployment

## 🤖 AI Programming Support

- [`AGENTS.md`](./AGENTS.md) — auto-loaded entry point for AI coding assistants (TRAE / Claude Code and others)
- [`.agents/project/`](./.agents/project/) — on-demand knowledge base (architecture / DTO / permissions / response format)

## 📚 Documentation

| Location | What it holds |
|:---|:---|
| [docs/](docs/README.md) | Index of human-facing docs: deployment how-to, config reference, API response format, project structure, ADRs, experience library |
| [CONTEXT.md](CONTEXT.md) | Glossary: Customer / User boundaries, Equipment / Filter, Inquiry state machine, documentation layers |
| [openspec/](openspec/) | Behaviour specs (`specs/`) and the change pipeline (`changes/`) |
| [wayfinder/](wayfinder/) | Active topic maps: goals, settled baselines, items not to be reopened |
| [.agents/project/](.agents/project/) | On-demand corpus for AI assistants (routing table in `AGENTS.md`) |

## 🌐 Companion Frontend

- [gvray-react](https://github.com/gvray/gvray-react) — React + Umi
- **gvray-vue** (in development) — Vue 3 + Vite + Pinia + Element Plus
- **gvray-vite** (in development) — React + Vite
- **gvray-next** (planning) — Next.js

## 🤝 Contributing

Issues, PRs, and feature suggestions are all welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, conventions, and the checks that must pass before a PR. If this project helps you, a **⭐ Star** is the best support!

This project is open-sourced under the [MIT License](LICENSE).
