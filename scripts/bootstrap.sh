#!/usr/bin/env bash
set -euo pipefail
# Acreflow one-shot local bootstrap.
echo "==> Checking toolchain"
command -v pnpm >/dev/null || { echo "Install pnpm: npm i -g pnpm"; exit 1; }
command -v node >/dev/null || { echo "Install Node 20+"; exit 1; }

echo "==> Installing deps"
pnpm install

echo "==> Env"
[ -f .env ] || cp .env.example .env

echo "==> Prisma generate"
pnpm db:generate

cat <<NEXT

Bootstrap complete. Next:
  1) Start Postgres and set DATABASE_URL in .env
  2) pnpm db:migrate        # create schema
  3) pnpm db:seed           # demo farm + Schedule F chart of accounts
  4) pnpm dev               # web :3000  api :4000
NEXT
