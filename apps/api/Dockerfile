# Fastify API — pnpm monorepo. Build context is the REPO ROOT.
# Runs via tsx (the workspace packages export .ts source), so no separate
# package build step is needed. Prisma client is generated at build time.
FROM node:20-slim

# OpenSSL is required by Prisma's query engine.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Install deps (incl. dev — tsx/prisma are needed) using just the manifests for caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# Source + Prisma client.
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @fl/db exec prisma generate

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
CMD ["pnpm", "--filter", "@fl/api", "exec", "tsx", "src/index.ts"]
