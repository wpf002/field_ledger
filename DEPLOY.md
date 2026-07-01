# Deploying Field & Ledger (Railway)

The app runs as **three Railway services** in one project: managed **Postgres**,
the Fastify **API**, and the Next.js **web** app. Both apps build from
Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`) with the **repo root**
as build context; `RAILWAY_DOCKERFILE_PATH` on each service selects its file.

## Auto-deploy
Both services are connected to `main` on GitHub, so **pushing to `main`
redeploys automatically**.

## Environment variables
| Var | api | web | Notes |
|-----|-----|-----|-------|
| `DATABASE_URL` | ✓ | ✓ | `${{Postgres.DATABASE_URL}}` |
| `AUTH_SECRET` | ✓ | ✓ | **Must match** across both (web signs the token, API verifies it) |
| `ANTHROPIC_API_KEY` | ✓ | | Enables the AI assistant / receipt vision |
| `API_URL` | | ✓ | The API's public URL; the Next proxy forwards `/api/*` here |
| `NEXT_PUBLIC_API_URL` | | ✓ | `/api` (client talks to the web origin, which proxies) |

The browser only ever talks to the **web** origin; `next.config` rewrites
`/api/*` to `API_URL` server-side, forwarding the httpOnly session cookie.

> **Gotcha:** Next bakes `rewrites()` destinations at **build time**, so the web
> Dockerfile takes `API_URL` as a build `ARG` (default = the Railway API URL).
> Change that ARG default or pass `--build-arg API_URL=...` if the API URL moves.

## Database migrations & seed
Run from a machine that can reach the DB, using the Postgres **public** URL
(the internal `*.railway.internal` host isn't reachable off-platform):

```bash
railway run --service Postgres bash -c \
  'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @fl/db exec prisma migrate deploy'
railway run --service Postgres bash -c \
  'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm db:seed'   # demo data
```

## Manual deploy (fallback)
```bash
railway up --service field-ledger-api --detach
railway up --service field-ledger-web --detach
```

## Demo accounts
`owner@fieldandledger.test` (full access) / `viewer@fieldandledger.test`
(read-only) — password **demo1234**.
