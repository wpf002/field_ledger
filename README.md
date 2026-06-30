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

## Status

**Phase 0 — complete.** All 10 pages render to match the original screenshots,
driven by seeded demo data (integer cents end to end). The `$….325` float
artifacts are gone. **Transactions** is wired to the **live Fastify API** (GET/
POST/DELETE) with period-lock + audit-log guards (Invariant 2); other pages read
Prisma directly in server components.

**Phase 1 — complete.** Ledger correctness, tax spine, and import:
- **CSV/OFX/QFX import** (`/transactions/import`): browser-side parsing →
  column mapping → preview with per-row Schedule F category inference, dedupe
  flagging, and editable categories → commit. Import is idempotent, skips
  duplicates, and refuses rows in locked periods. Every row is tax-mapped
  (catch-all fallback ensures nothing is unmapped — Invariant 6).
- **Bank reconciliation** (`/transactions/reconcile`): statement import →
  amount+date windowed matching against unreconciled ledger → confirm → rows
  marked reconciled (audited). A green check marks reconciled rows in the ledger.
- Money was integer cents from day one, so there is no float data to migrate —
  Invariant 1 already holds and derived totals reconcile.

**Phase 2 — complete.** Asset accuracy + mark-to-market:
- **Mark-to-market valuation**: marketable inventory values off a `CommodityPrice`
  store (seeded USDA quotes; `POST /commodity-prices` accepts live-feed upserts)
  with per-item **manual override** (`PATCH .../inventory/:id`, audited). Source
  badges (USDA / manual) show on each card.
- **Depreciation**: equipment values at straight-line **book value** (the John
  Deere: $150k cost − accumulated → ~$90k book), flowing into Total Inventory
  Value and Net Worth. Valuation-detail modal shows the full schedule.
- **Cost basis**: raised livestock/crops carry $0 tax basis; purchased assets
  carry their cost.
- Dashboard, Insights, and Inventory now compute from this valuation, not static
  `estValueCents`. The **Prophet forecasting seam** (`@fl/core` `Forecaster`) backs
  the Insights projection — naive baseline now, Prophet drops in unchanged.

**Phase 3 — complete.** Obligations engine:
- **Amortization** (`@fl/core` `amortizationSchedule`): each scheduled payment
  split into interest + principal with a declining balance; full payoff schedule.
- **Auto-post** (`POST .../liabilities/:id/post-payment`): posts the next payment
  to the ledger — interest as a Schedule F expense, principal off the balance —
  advances the next due date, all audited. The Liabilities page recomputes debt,
  monthly interest, and % paid from the records with no manual edits.
- **Lease schedules** + **obligations window** (`obligationsInWindow`): scheduled
  loan payments that fall in the window plus prorated rent for *active* cash
  leases drive Insights "Upcoming Obligations". Expired/crop-share leases are
  excluded (a third active lease was added to the seed to exercise this; the two
  original leases stay expired for Phase 4 alerts).

**Phase 4 — complete.** Alerts engine:
- **Rules** (`@fl/core` `evaluateAlerts`) over existing dates/state: payment-due
  reminders (ahead of the due date), overdue-invoice nudges, lease-expiry
  warnings, budget-overage. Alerts are computed live (never stale).
- **In-app surface**: a bell + badge in the sidebar opens an alerts drawer
  (severity-sorted, dismissible) with **per-rule settings** toggles. Email
  delivery is flagged off (seam present, not enabled).
- **Contextual flags**: expired leases get an "Expired" badge on the Leases
  page; past-due invoices show an "Overdue" pill on Revenue.
- Persistence: only dismissals (`AlertDismissal`) and settings (`AlertSetting`)
  are stored; the alert list itself is always recomputed.

**Phase 5 — complete.** Budgets & production planning, fully wired:
- **Budget-vs-actual** (`@fl/core` `budgetStatus`): YTD spend from the ledger;
  monthly budgets prorate to the elapsed window. Drives the Budgets page
  (Monthly/Annual tabs with fill bars + over-budget red state), the Dashboard
  **Budget Health** bars (now filled, not empty), and the budget_over alert.
  "Set Budget" creates/updates a budget.
- **Production planning**: the Planning calendar renders plans across their date
  range with per-kind colors; **List view** parity; **New Production Plan** flow
  creates a plan that appears immediately in both views.
- Seed gains a 2026 operating year (expenses across months) so budgets show real
  usage — this moves Dashboard Total Expenses / Net Profit (computed), the
  intended effect of wiring real budgets.

**Phase 6 — complete.** Reporting, exports, invoice lifecycle:
- **Reports** (`/reports`, reached from the Dashboard/Account): P&L, **Schedule F
  summary** (tax-ready, grouped by F-line), cash-flow statement, and enterprise
  (per-herd/per-crop) profitability — for any year, with a locked-period badge.
  Each exports to **CSV** (`/reports/:type/export`).
- **Invoice lifecycle**: a print-ready PDF view (`/revenue/invoices/:id`),
  **Send**, and **Mark Paid** — which posts the income to the ledger as the
  payment record (linked to the invoice) and clears the overdue alert. All
  audited.
- **User data backup** (Invariant 7): Transactions CSV + full JSON export wired
  on the Account page.

**Phase 7 — complete.** AI Assistant (Flint), grounded with confirm-before-write:
- **Grounding (Invariant 3)**: a ledger tool layer (cash position, transactions,
  obligations, valuation, budgets, Schedule F, alerts) returns the farm's *real*
  data. Every figure the assistant states traces to a tool result — nothing is
  invented; if data is missing it says so.
- **Chat**: answers from those tools. With an `ANTHROPIC_API_KEY` it routes
  through Claude (`claude-opus-4-8`) tool-calling; without one, a deterministic
  router answers from the same tools (so it's verifiable today). A badge shows
  which mode is live.
- **Quick Log**: natural-language entry → a **draft** transaction → human
  confirm → posted via the audited `/transactions` route. Never writes directly.
- **Receipt Capture**: upload → draft → confirm. Claude vision auto-fills the
  draft when keyed; otherwise a skeleton draft for manual entry (vision flagged).
- The LLM is a pluggable enhancement: set `ANTHROPIC_API_KEY` in `.env` to light
  it up. Grounding and the confirm checkpoints are identical either way.

`packages/core` (money, import, valuation, forecast, amortization, alerts,
budget, reports, assistant) is unit-tested (47 tests); `pnpm -r typecheck` is
clean across all packages.

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
