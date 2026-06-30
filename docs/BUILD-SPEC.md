# Field & Ledger — Build Spec (Claude Code)

Self-contained build brief. Assume no prior context. This is an existing,
mostly-built farm/ranch accounting app (originally generated on Base44) that is
being hardened, completed, and extended. **Do not redesign the UI.** The visual
language is fixed; your job is to preserve it while filling gaps and fixing
defects.

---

## 0. How to use this document

- Read Sections 1–4 before writing any code.
- **Section 1 (Invariants) is non-negotiable.** Treat each as a locked rule.
- Resolve the decision gate in Section 5 before starting Phase 1.
- Before any app code, complete the build-process gate in Section 6.
- Phases (Section 8) are ordered. Each has concrete deliverables and acceptance
  criteria. Do not silently drop a deliverable; if you think one should change,
  surface it and ask.

---

## 1. Invariants (locked — never violate)

1. **Money is integer cents.** All monetary values are stored and computed as
   integer cents (or minor units), never floats. Format to dollars only at the
   display edge.
   - **Known defect to fix:** the live app shows float artifacts —
     Insights projected income `$154,365.325` and net position `$142,865.325`.
     The thousandths digit proves float math on currency. Phase 0 includes a
     migration that converts existing values to integer cents and reconciles
     totals.
2. **Audit trail + period locking.** Every create/update/delete on financial
   records is logged (who/what/when/before/after). Closed accounting periods
   (e.g. a filed tax year) are locked and cannot be silently edited; reopening is
   an explicit, logged action.
3. **No-fabrication rule for the AI Assistant.** Every figure the assistant
   states must trace to a real ledger value via tool/query results. It must never
   invent or estimate numbers presented as fact. If data is missing, it says so.
4. **Design fidelity.** Match the existing design (Section 3) exactly. No new
   color palette, no font swaps, no restyled components without explicit sign-off.
5. **Don't quietly cut scope.** If a requested feature is hard or ambiguous,
   surface it — do not drop it without flagging.
6. **Tax-first data model.** Income/expense categories map to IRS Schedule F line
   items from the first ledger write, not bolted on later.

---

## 2. What the app is

Cash-basis accounting and financial planning for farmers and ranchers: a ledger,
asset/inventory tracking, liabilities, land leases, budgets, forward-looking
planning, reporting/insights, and an AI assistant. Existing pages: Dashboard,
Transactions, Revenue, Inventory, Liabilities, Leases, Budgets, Insights,
Planning, AI Assistant.

**Backend reality (Base44 origin):** data, auth, and the assistant's model calls
currently live in Base44's hosted SDK (their Supabase). A code export yields the
frontend; the backend is reconstructed if ownership moves off Base44 (Section 5).

---

## 3. Design system (locked)

> Color values are sampled from screenshots; the serif is a close match, not a
> confirmed family. If a real export/Tailwind config is available, prefer its
> exact values over these. Otherwise use these verbatim.

### Color tokens
```css
:root {
  /* surfaces */
  --bg:             #F4F1E9;  /* warm paper background */
  --surface:        #FFFFFF;  /* cards */
  --surface-sunken: #EFEBE0;  /* progress tracks, sub-boxes */
  --border:         #E4DFD2;

  /* brand + accents */
  --primary:        #34492E;  /* forest green: active nav, hero band, buttons */
  --primary-deep:   #2A3B25;  /* hover / pressed */
  --brown:          #6B4327;  /* liabilities + leased-land summary cards */
  --rust:           #B5701F;  /* "outstanding" / warning accent */

  /* text */
  --text:           #2B2B26;
  --text-muted:     #76705F;

  /* money */
  --positive:       #3F7A3A;  /* +$ / income */
  --negative:       #9E2B2B;  /* -$ / expense */

  /* tints */
  --tag-bg:         #ECE8DC;  /* category pills */
  --mint:           #E8F0E4;  /* "Paid" revenue card */
  --cream-tint:     #F6EFDD;  /* "Outstanding" revenue card */

  /* shape */
  --radius-card:    16px;
  --radius-btn:     10px;
  --radius-pill:    999px;
}
```

### Typography
- **Serif (display) — Fraunces** (closest match): wordmark, page titles, section
  headings, and **all dollar figures**. Weight ~600–700.
- **Sans (UI) — Inter**: nav, tables, body, descriptions, and uppercase labels.
- **Labels:** uppercase, ~0.06em tracking, `--text-muted`, ~12px.

### Layout primitives
- **Sidebar:** fixed ~280px, `--bg`, 1px right border. Serif wordmark + "Farm
  Management" sub at top; lucide-icon nav list; active item = solid `--primary`
  rounded rect with white icon+label; `My Account` pinned bottom.
- **Page header:** serif title + muted sans subtitle + top-right primary
  `+ Add …` button.
- **Stat card:** white; uppercase label top-left; tinted-circle icon top-right;
  big serif number. Emphasis variants invert to filled `--primary` or `--brown`
  with light text.
- **Hero band:** full-width `--primary`, white heading + oversized white number.
- **Entity card** (Inventory/Liabilities/Leases): white; uppercase category pill;
  serif title; icon+meta rows; footer value. Liability cards add a thin progress
  bar + rate/next-payment sub-boxes.
- **Table** (Transactions): muted sans headers, category pills, colored amounts,
  trailing edit/delete icon buttons.
- **Segmented toggle:** pill group; active = white w/ soft shadow, inactive
  transparent.
- **Icons:** lucide-react. Map: tractor=Inventory, wallet=Liabilities,
  scroll=Leases, pie=Budgets, trending-up=Insights, calendar=Planning,
  message-square=AI Assistant, receipt=Transactions, dollar-sign=Revenue,
  layout-dashboard=Dashboard.

### Shared component primitives to build first
`<Money value cents />` (renders cents → $, colors +/- via `--positive`/`--negative`),
`<StatCard label icon variant />`, `<EntityCard />`, `<CategoryPill />`,
`<SegmentedToggle />`, `<ProgressBar />`, `<PageHeader title subtitle action />`,
`<SidebarNav />`. Every later phase composes these so styling can't drift.

---

## 4. Current state (page-by-page)

| Page | Status | Notes |
|---|---|---|
| Dashboard | Built | KPI cards, net-worth hero, cash-flow chart, Budget Health bars (empty), Recent Activity, AI Insights "Generate". |
| Transactions | Built | Searchable table, add, category + related-item pills, edit/delete. |
| Revenue | Built | KPI cards, Invoices/Customers tabs, invoice list w/ status, New Invoice. No visible send/PDF/payment path. |
| Inventory | Built | Category cards, search, est. value (hardcoded per-unit prices). |
| Liabilities | Built | Debt + monthly-interest summary; per-loan cards w/ amortization %, rate, next payment. |
| Leases | Built | Acreage/rent summary; cash-rent vs crop-share cards. Some terms already expired (see alerts). |
| Budgets | Partial | Financial Goals work; monthly budgets empty for 2026 — engine not seeded/wired. |
| Insights | Built | 90-day cashflow projection, marketable inventory, upcoming obligations. **Float bug visible here.** |
| Planning | Scaffold | Calendar/List toggle + New Production Plan; calendar renders no events. |
| AI Assistant | Built UI | Chat / Quick Log / Receipt Capture; runs on Base44 LLM. |

---

## 5. Decision gate — resolve before Phase 1

**Base44 vs. own stack.**
- **Extend on Base44:** keep their backend/hosting; fastest path; you own the
  frontend only and stay dependent on their SDK for backend logic.
- **Migrate to own stack:** Next.js (UI) / Fastify (API) / Prisma / Postgres /
  Railway. Frontend ports; data model, auth, and server logic are rebuilt. Common
  community route swaps the Base44 SDK for Supabase, but target Postgres + Fastify
  directly here.

The phases below hold either way — the gate only changes *where* backend work
lands. **Pick one before Phase 1** because it determines whether Phase 0 reads
existing models or rebuilds them.

---

## 6. Build-process gate — before any app code

For this build (and standard for these projects), do all three first:
1. **GitHub repo setup:** `git init`, `git remote add origin …`, initial commit,
   push. Provide the exact commands.
2. **Infrastructure bootstrap script:** folder structure, `package.json`,
   dependencies, config files, env setup (`.env.example`).
3. **`README.md` scaffold:** project overview, stack, setup, scripts, env vars.

Only after these exist do you write feature code.

---

## 7. Cross-cutting disciplines (apply across all phases)

- **Integer-cents money** everywhere (Invariant 1).
- **Audit trail + period locking** on all financial mutations (Invariant 2).
- **User-facing backup/export** of the user's *data* (CSV/JSON), distinct from any
  code export — farmers need to trust they can't lose records.
- **Validation gate** on all writes (schema validation; reject malformed money,
  dates, references).
- **Test coverage** on money math, amortization, tax mapping, and projections.

---

## 8. Roadmap (phased)

### Phase 0 — Foundation, design lock, money fix
**Deliverables**
- Repo + infra + README (Section 6).
- Design tokens wired (CSS vars + Tailwind theme) and shared primitives
  (Section 3) implemented.
- **Money refactor:** convert all monetary storage/compute to integer cents;
  migration to fix existing float values (kills the `$…​.325` artifacts) and
  reconcile derived totals.
- Audit-log table + write hooks; period-lock model.
- Data model mapped (from export if extending) or defined (if migrating).

**Acceptance:** no monetary value anywhere renders sub-cent precision; every
financial mutation produces an audit entry; UI is visually identical to
screenshots; primitives in use on at least one page.

### Phase 1 — Ledger correctness + tax spine
**Deliverables**
- Chart of accounts with income/expense categories mapped to **Schedule F** line
  items.
- Transactions + Revenue wired to it (cash-basis, vendor/payee, related-item
  references backed by real FKs).
- **Data import:** CSV/OFX import for transaction history (the #1 adoption
  blocker — nobody retypes years of records). Importer with column mapping +
  dedupe + preview.
- **Bank reconciliation** scaffolding (Plaid-style feed optional/flagged; at
  minimum statement-import reconcile).

**Acceptance:** a user can import a bank/QuickBooks CSV and reconcile it; every
transaction carries a Schedule F mapping; no orphan related-items.

### Phase 2 — Asset accuracy + mark-to-market
**Deliverables**
- Inventory cost basis: livestock raised-vs-purchased basis; equipment
  depreciation schedules (e.g. the John Deere 8R); crop/feed valuation.
- **Mark-to-market valuation:** replace hardcoded per-unit prices ($14/bushel,
  $1,800/head) with live commodity prices (CME/USDA feed) where available, with
  manual override.
- **Prophet tie-in:** wire commodity valuation/projection to the existing Prophet
  forecasting service for marketable-inventory and net-worth projections.

**Acceptance:** net worth and marketable inventory reflect basis + current prices,
not static numbers; depreciation flows into asset value.

### Phase 3 — Obligations engine
**Deliverables**
- Liability amortization that auto-posts scheduled payments into the ledger.
- Lease payment schedules (cash rent + crop share) flowing into cashflow.
- Insights "Upcoming Obligations" panel driven by this engine (not static).

**Acceptance:** changing a loan/lease updates obligations and cashflow without
manual edits; posted payments appear as transactions with audit entries.

### Phase 4 — Alerts engine
**Deliverables**
- Rules over existing dates/state: payment reminders (next-payment dates),
  overdue-invoice nudges (e.g. INV-2024-002 past due), **lease-renewal/expiry
  warnings** (River Bottom Fields 2022–2025 and Hillside Pasture 2023–2024 are
  already lapsed with no flag), budget-overage warnings.
- Notification surface (in-app; email optional/flagged) + per-rule settings.

**Acceptance:** expired leases and overdue invoices raise visible alerts;
upcoming payments notify ahead of due date.

### Phase 5 — Budgets & production planning, fully wired
**Deliverables**
- Monthly + annual budget-vs-actual by category; fills the empty Budgets page and
  the Dashboard Budget Health bars (bars actually fill).
- Production Planning model: calendar renders real cycles (planting/calving/
  harvest) tied to inventory and season; List view parity; New Production Plan
  flow.

**Acceptance:** Budget Health bars show real spend vs budget; calendar shows
created production plans in both Calendar and List views.

### Phase 6 — Reporting & exports
**Deliverables**
- P&L, cash-flow statement, enterprise (per-crop / per-herd) profitability.
- **Schedule F export** + tax-ready summary.
- **Invoice lifecycle:** generate PDF, send, and capture payment (close the loop
  on Revenue's invoice list; pair with Phase 4 overdue alerts).

**Acceptance:** user can export a Schedule F summary and a P&L for a locked
period; an invoice can be generated, sent, and marked paid with a payment record.

### Phase 7 — AI Assistant (Flint integration)
**Deliverables**
- Replace Base44 LLM wiring with the **Flint** layer.
- **Grounding (Invariant 3):** RAG/tool-calls over the user's ledger so every
  stated figure traces to real data; no fabricated numbers.
- **Quick Log:** natural-language transaction entry against the Phase 1 schema,
  with a confirm step.
- **Receipt Capture:** vision parse → categorized draft transaction → human
  confirm before write.
- **Human checkpoints** on all writes/irreversible actions (Flint principle).

**Acceptance:** assistant answers finance questions only from real data and cites
the underlying records; Quick Log and Receipt Capture create correct draft
transactions that require confirmation before posting.

### Phase 8 — Hardening
**Deliverables**
- Auth, multi-farm/multi-entity, roles/permissions.
- **Offline-first for Quick Log + Receipt Capture** (field use: logging from the
  truck at auction on poor signal) with sync on reconnect — not just responsive
  CSS.
- Mobile layout pass across all pages; robust data export/backup.

**Acceptance:** Quick Log/Receipt Capture work offline and sync cleanly; roles
restrict access correctly; app is usable on a phone in the field.

---

## 9. Definition of done (whole project)

- No float money anywhere; all values reconcile to integer cents.
- Every financial mutation is audited; closed periods are locked.
- Categories map to Schedule F; Schedule F + P&L exportable.
- Imports, reconciliation, alerts, budgets, planning, reporting, and invoice
  lifecycle all functional.
- AI Assistant is grounded (no fabricated numbers) with confirm-before-write.
- UI matches the original design; no unreviewed visual drift.
- Field surfaces work offline; data is user-exportable.
