#!/bin/sh
# API container entrypoint (Railway/Docker). Applies any pending Prisma
# migrations before the server accepts traffic. `migrate deploy` is idempotent
# (no-op when up to date) and takes a Postgres advisory lock, so it's safe when
# the API scales to more than one instance. If it fails, the container exits
# non-zero and Railway keeps the previous deployment serving.
set -e

echo "→ Applying database migrations (prisma migrate deploy)…"
pnpm --filter @fl/db exec prisma migrate deploy

echo "→ Starting API…"
exec pnpm --filter @fl/api exec tsx src/index.ts
