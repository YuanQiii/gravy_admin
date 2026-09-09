ARG NODE_VERSION=20
ARG ALPINE_VERSION=3.20

# ─── Base: shared toolchain ───────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

# libc6-compat: required for some native Node bindings on Alpine
# tini: PID-1 signal handling, zombie reaping (Hoppscotch pattern)
RUN apk add --no-cache libc6-compat tini

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app


# ─── Deps: install all dependencies (layer cached until context manifests change) ─────
FROM base AS deps

# .dockerignore excludes node_modules + dist; pnpm install only reads manifests.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ ./apps/
COPY packages/ ./packages/

# BuildKit cache mount: pnpm store is reused across builds without being committed to the layer
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile


# ─── Dev: hot-reload development (no full compile) ────────────────────────────
FROM base AS dev

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="postgresql://build:build@build:5432/build"

RUN pnpm prisma generate

# Normalize line endings (Windows core.autocrlf may check files out as CRLF,
# which breaks the shebang when the script runs inside the container).
RUN sed -i 's/\r$//' docker/entrypoint.sh && chmod +x docker/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--", "docker/entrypoint.sh"]
CMD ["pnpm", "start:admin"]


# ─── Builder: compile TypeScript API + prisma seed + scripts ──────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY prisma/ ./prisma/
COPY scripts/ ./scripts/
COPY tsconfig*.json ./

# Dummy DATABASE_URL so Prisma generator does not need a live DB at build time
ENV DATABASE_URL="postgresql://build:build@build:5432/build"

RUN pnpm prisma generate
RUN pnpm build
# Compile prisma seed files without overwriting the app dist output.
# tsc outputs to /tmp so only dist/prisma/ is copied back.
RUN node_modules/.bin/tsc -p tsconfig.json \
      --outDir /tmp/seed-build --noEmitOnError false 2>/dev/null || true \
 && cp -r /tmp/seed-build/prisma ./dist/prisma 2>/dev/null || true


# ─── Runner: lean production admin image ──────────────────────────────────────
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner

RUN apk add --no-cache libc6-compat tini

WORKDIR /app

# OCI standard labels — injected at build time via --build-arg
ARG BUILD_DATE
ARG GIT_SHA
ARG VERSION="0.0.0"
LABEL org.opencontainers.image.title="gvray-admin" \
      org.opencontainers.image.description="企业级后台管理系统" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Shanghai

# Copy compiled output and node_modules from builder.
# node_modules is copied as-is to preserve the pnpm virtual store structure
# where the generated Prisma client lives (node_modules/.pnpm/.../.prisma/client).
COPY --from=builder /app/dist/apps/admin      ./dist/apps/admin
COPY --from=builder /app/dist/packages        ./dist/packages
COPY --from=builder /app/dist/scripts         ./dist/scripts
COPY --from=builder /app/dist/prisma          ./dist/prisma
COPY --from=builder /app/node_modules         ./node_modules
# node_modules/@gvray/* 是 pnpm workspace symlink → /app/packages，runner 需保留该落点，
# 运行时 `require('@gvray/core')` 经包 main 解析到 dist/packages/core（db-bootstrap 依赖）。
COPY --from=builder /app/packages             ./packages
# Whitelist the prisma payload (ADR 0008): only what the runtime needs enters
# the image. migrations + schema.prisma feed `prisma migrate deploy`; one-time
# products under prisma/scripts and prisma/backups never ship (see .dockerignore).
COPY prisma/migrations     ./prisma/migrations
COPY prisma/schema.prisma  ./prisma/schema.prisma

# Startup entrypoint: runs migrations then hands off to CMD
COPY docker/entrypoint.sh ./entrypoint.sh

# Normalize line endings (Windows core.autocrlf may check files out as CRLF,
# which breaks the shebang when the script runs inside the container).
RUN sed -i 's/\r$//' entrypoint.sh

# Create non-root user and fix ownership in a single layer
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nestjs \
 && chmod +x entrypoint.sh \
 && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

# Health check uses Node itself — no need for wget or curl in the image
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e \
    "require('http').get('http://localhost:' + (process.env.PORT||3000) + '/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
CMD ["node", "dist/apps/admin/apps/admin/src/main.js"]