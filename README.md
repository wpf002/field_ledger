# Field & Ledger

Accounting and financial planning for farmers and ranchers — ledger, inventory,
liabilities, leases, budgets, planning, insights, and an AI assistant.

> This repo is the **own-stack** build of an app originally generated on Base44.
> The visual design is **locked** to the original (see `docs/BUILD-SPEC.md`).
> Do not redesign the UI. Money is **integer cents, never floats**.

## Stack
- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** Next.js 14 (App Router), Tailwind, lucide-react, recharts — `apps/web`
- **API:** Fastify — `apps/api`
- **DB:** Prisma + Postgres — `packages/db`
- **Shared:** money/cents, Schedule F map, zod schemas — `packages/core`
- **Deploy target:** Railway

## Layout
```
apps/
  web/      Next.js UI (design system + pages)
  api/      Fastify API (BigInt-cents safe serialization)
packages/
  core/     money (integer cents), Schedule F mapping, schemas, tests
  db/       Prisma schema (audit log, period lock, Schedule F spine), seed
  config/   shared tsconfig + eslint
docs/
  BUILD-SPEC.md   full invariants, design tokens, phased roadmap
```

## Quick start
```bash
pnpm install

# Postgres in Docker (host port 5544 — 5432 was already taken on the dev box).
docker run -d --name fl-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=field_ledger \
  -p 5544:5432 postgres:16

# .env (root) and apps/web/.env.local both point DATABASE_URL at :5544.
pnpm db:migrate             # apply schema to Postgres
pnpm db:seed                # demo farm matching the screenshots (integer cents)

pnpm dev                    # web http://localhost:3000  api http://localhost:4000
```

Env loading: the API loads the root `.env` (via `dotenv`, resolved from
`apps/api/src`); the web app loads `apps/web/.env.local` (Next.js convention).
If you free up port 5432, change `:5544` back to `:5432` in both env files.

## Status — Phase 0 complete
- All 10 pages render to match the original screenshots, driven by seeded demo
  data (integer cents end to end). Dashboard KPIs, Insights, Inventory,
  Liabilities, Leases, Revenue, Budgets, Planning, and AI Assistant are built;
  the `$….325` float artifacts are gone (Insights shows clean cents).
- **Transactions** is wired to the **live Fastify API** end to end: list (GET),
  add (POST), delete (DELETE), each guarded by period-lock + audit-log
  (Invariant 2). Other pages read Prisma directly in server components.
- `packages/core` money math is unit-tested; `pnpm -r typecheck` is clean.

## Invariants (do not violate — full list in docs/BUILD-SPEC.md)
1. Money is integer cents (BigInt). Format only at the display edge.
2. Audit trail + period locking on every financial mutation.
3. AI Assistant never fabricates numbers — every figure traces to real data.
4. Design fidelity to the original (locked tokens in `apps/web/tailwind.config.ts`).
5. Don't quietly cut scope.
6. Categories map to IRS Schedule F from the first ledger write.

## Roadmap
Phased plan with deliverables and acceptance criteria lives in
`docs/BUILD-SPEC.md` (Phase 0 → Phase 8). Phase 0 also includes the float→cents
migration that fixes the `$….325` artifacts from the original.

## Notes on exactness
The color hexes in the Tailwind theme are sampled from screenshots and the serif
(Fraunces) is a close match. If a Base44 code export is available, reconcile the
exact Tailwind config and confirm the font family before Phase 1.
