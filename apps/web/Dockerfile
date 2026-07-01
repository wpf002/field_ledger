# Next.js web app — pnpm monorepo. Build context is the REPO ROOT.
# Server components read Prisma directly, so the client is generated here too.
FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @fl/db exec prisma generate

# Next bakes rewrites() destinations at BUILD time, so the API proxy target must
# be present now (not just at runtime). Override --build-arg API_URL=... per deploy.
ARG API_URL=https://field-ledger-api-production.up.railway.app
ENV API_URL=$API_URL
# Client bundle talks to the API same-origin via the Next proxy (see next.config).
ENV NEXT_PUBLIC_API_URL=/api
RUN pnpm --filter @fl/web build

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@fl/web", "start"]
