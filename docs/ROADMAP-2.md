# Acreflow — Roadmap 2 (Requirements Spec + Test Dataset)

Source material: `AcreFlow Financial Reporting, Data & Integration Requirements.docx`
(the "spec", 30 sections) and the four-farm test dataset (`AcreFlow_<CODE>_*.xlsx`,
`AcreFlow_README.md`). Phases continue from BUILD-SPEC.md (Phases 0–8 are done).

Invariants from BUILD-SPEC Section 1 still hold: integer cents, audited mutations,
locked periods, grounded AI, confirm-before-write.

---

## Decision gate (resolve before Phase 9)

| Decision | Recommendation |
|---|---|
| Name casing: new docs say "AcreFlow", app says "Acreflow" | Keep "Acreflow" (branding doc's final pick); no app change |
| README's `AcreFlow_TestData_CSV/` package is missing | Import from the `.xlsx` files; they hold the same tables |
| Basis: app is cash-basis, dataset is accrual | Store both dates; report accrual by default with a cash toggle |

---

## Phase 9 — Data model v2

The current schema can't hold the dataset. Everything after this phase depends on it.

**Deliverables**
- `Enterprise` (with parent, e.g. produce sub-crops) and `EnterpriseTransfer`
  (internal moves at market value, net to zero). Every revenue and direct-cost
  transaction requires an enterprise.
- Accrual dates on `Transaction`: `txnDate` (earned/incurred), `cashDate`,
  `expectedCashDate`, `dueDate`, signed `cashEffect`, quantity/unit/unitPrice.
- Chart of accounts sections: REV, COP, OVH, INT, DEP, GAIN, INVCHG, LVCHG, XFER,
  CASHBS, each still mapped to Schedule F.
- `Vendor` table (replaces free-text vendor) and `Bill` (accounts payable).
- `Asset` register: cost, financing, useful life, salvage, method, depreciation by
  year and enterprise, repairs by year, usage, disposal.
- Loans: rate type, payment frequency, collateral, full `LoanSchedule`, operating
  line limit and monthly balance.
- `LandParcel`/`Field`, `CropSeason` (planted, expected vs actual yield and price,
  sold/stored/lost), `ProductionRecord`, `Weather`.
- `Animal` (parentage, class, disposition, weights, sale price), herd classes,
  `SemenLog`, `Reproduction`, `BullValuation`, `ProcessedAnimal`.
- `InventorySnapshot` (quantity, cost basis, market value, balance-sheet basis).
- `LaborHours` (hired and unpaid family).
- Migrate the existing demo farm into the new model.

**Acceptance:** all existing pages and tests pass on the migrated demo farm; no
transaction without an account and (for REV/COP) an enterprise.

## Phase 10 — Test-farm importer

**Deliverables**
- Workbook importer for the dataset format (all 40 data tabs), idempotent, keyed
  on dataset IDs (`TXN-`, `INV-`, `BILL-`, `AST-`, `LN-`, `ANM-`, `CS-`…).
- Handles per-farm column differences (`Crop_Seasons`, `Production_Log`,
  `Processed_Animals`) and the 9/30/2026 cutoff (21 deposit rows dated after it).
- Seed script loads Cedar Branch, Whitfield, Post Oak Meadows, and Dawson Charolais
  as four farms under one demo login, switchable with the existing farm switcher.
- Golden tests: app-computed values vs each workbook's `Checks` tab.

**Acceptance:** for all four farms, revenue/COP/interest by year, cash at
9/30/2026, AR, debt principal, every month-end balance sheet, and herd flow match
the workbook to the cent.

## Phase 11 — Financial statements (spec §3, §4, §5, §24, §25)

**Deliverables**
- Accrual P&L: monthly, quarterly, annual, YTD, trailing 12; compare to prior
  period, prior year, budget, forecast. Net farm income includes inventory and
  livestock value changes.
- Monthly balance sheet: current/non-current, market-value memo, equity rollforward.
- Historical cash flow by operating / investing / financing class, shown beside
  profit for the same period.
- AR aging (current, 1–30, 31–60, 61–90, 90+) and new Payables page with aging.
- Nav restructure to fit the new pages (grouped sections).

**Acceptance:** matches `IS_Monthly`, `BS_Monthly`, `CF_Monthly`, `AR_Invoices`,
`AP_Bills` for all four farms.

## Phase 12 — Health, debt, liquidity (spec §2, §15, §16, §17)

**Deliverables**
- FFSC ratios: liquidity, solvency, profitability, repayment capacity, efficiency.
- Health score 0–100 overall and per category, with plain labels ("Healthy").
- Debt page: land / equipment / operating debt, maturity schedule, debt service,
  interest vs principal, DSCR, debt-to-asset, equity-to-asset, debt-to-equity.
- Working capital, current ratio, WC % of revenue, available line.
- Dashboard rebuilt around the spec §2 metric list.

**Acceptance:** ratios match the `Ratios` tab for every farm and period.

## Phase 13 — Enterprise and unit economics (spec §9–§12, §21–§23, §26)

**Deliverables**
- Enterprise P&L with allocated overhead and internal transfers.
- Crop profit per acre (seed, fertilizer, chemical, irrigation, fuel, labor,
  contractor, equipment allocation).
- Livestock profit per head by group (calves, cows, replacement heifers, bulls,
  market, direct-to-consumer), per straw for semen.
- Break-even: crop price and yield, livestock cost per head, price per lb,
  direct-beef price.
- Inventory: cost vs market, expected use/sale date; inventory exposure
  ("10% price drop = $X").
- Commodity exposure: expected production, contracted, unpriced share.
- Land economics per parcel and return on land.
- Herd pages for livestock farms: registry, herd flow, reproduction metrics.

**Acceptance:** matches `IS_Annual_Enterprise`, `Unit_Econ_Crops`,
`Unit_Econ_Livestock`, `Processed_Animals`, `Herd_Flow_*`, `Reproduction`.

## Phase 14 — Forecasting (spec §6, §7, §8, §14)

**Deliverables**
- 13-week cash forecast: open invoices and bills, loan schedules, operating plan,
  line draws and repayments, minimum cash, reserve-target alert ("falls below
  $50,000 the week of …").
- 12-month forecast with base / optimistic / downside scenarios and editable
  assumptions.
- Revenue forecast from drivers (acres × yield × price, calves × weaning rate ×
  weight × price, leases, custom work, programs). Holt-Winters stays as the
  fallback for lines with no drivers.
- Forecast vs actual: store each forecast run, compare when actuals land.

**Acceptance:** line items sourced from invoices, bills, and loan schedules match
`Cash_13_Week_Items` exactly; base-case totals land within 5% of `Forecast_12M`.

**Result:** known items match exactly on all four farms. The 5% target was not met:
base-case revenue vs the workbook is BRN -5.7%, RCK +1.9%, SAM +7.9%, LAN -16.3%.
The workbook's base case embeds price, yield, and rainfall assumptions (e.g. LAN's
return to normal rain after a drought year); the app takes those as editable
scenario drivers instead of hard-coding them. `verify:testfarms` prints the gaps.

## Phase 15 — Decisions (spec §13, §18–§20, §27, §28)

**Deliverables**
- Scenario engine that recalculates cash, profit, debt, working capital, and ratios.
  Presets from `Scenario_Levers` (price moves, drought, herd expansion, extra lease,
  hire, sell-vs-hold, finance-vs-cash).
- Equipment purchase analysis ("Can I afford this tractor?").
- Repair vs replace using repair history, resale, replacement price, financing.
- Budget vs actual by enterprise with variance drivers (price vs volume).
- Net worth split: operating business, land, other assets.

**Acceptance:** each `Scenario_Levers` row reproduces its estimated annual impact
within 5%.

**Result:** 21 of 25 within 5% (18 of the 22 computed from the books; 3 rest on
owner assumptions the books can't supply and are stored as estimates). Misses:
the two forecast-scenario levers (they depend on the workbook's own forecast) and
two that use the in-progress 2026 hay season.

## Phase 16 — AI layer (spec §29, §30, AI security model)

**Deliverables**
- Weekly / monthly financial brief with recommended actions.
- Assistant tools over the new data (cash position, forecast, crop and livestock
  profitability, debt, inventory, AR, enterprises, run scenario).
- Insights engine that detects the dataset's 40 insights from the data.
- Tool permission tiers: read, analyze, write, high-risk (payments/transfers
  unavailable).

**Acceptance:** for each farm the engine surfaces ≥ 8 of its 10 `AI_Insights`;
every figure in a brief traces to a record.

## Phase 17 — Integrations, tier 1 (spec Phase 1 list)

Each requires a developer account and keys from the provider.

- QuickBooks Online (read: COA, transactions, invoices, bills, customers, vendors,
  balances).
- Plaid (accounts, balances, transaction sync).
- Generic CSV/Excel mapping for any table (extends Phase 1 importer).
- Square and Stripe sales import (payments, refunds, fees, payouts) for
  direct-to-consumer farms.
- All sources translate into the Phase 9 core objects.

## Phase 18 — Integrations, tier 2 (agricultural data)

- Farmbrite, AgriWebb, CattleMax (partner access first), Agworld.
- USDA (AMS/NASS/ERS) prices and benchmarks; commodity price feed; NOAA weather.
- Xero, FreshBooks.

## Phase 19 — Integrations, tier 3

- John Deere Operations Center, Trimble.
- Remote MCP server exposing the Phase 16 tools to ChatGPT, Claude, Gemini.
- Public Acreflow API.

---

## Not in this roadmap

- Subscription tiers / paywalls (spec "Subscription Model"): deferred until the
  app is ready to monetize.

## Spec coverage

| Spec § | Topic | Phase |
|---|---|---|
| 2 | Dashboard | 12 |
| 3 | P&L | 11 |
| 4 | Balance sheet | 11 |
| 5 | Historical cash flow | 11 |
| 6 | 13-week cash forecast | 14 |
| 7 | 12-month forecast | 14 |
| 8 | Revenue forecast | 14 |
| 9 | Enterprise profitability | 13 |
| 10 | Crop per acre | 13 |
| 11 | Livestock per head | 13 |
| 12 | Break-even | 13 |
| 13 | Budget vs actual | 15 |
| 14 | Forecast vs actual | 14 |
| 15 | Debt dashboard | 12 |
| 16 | Working capital | 12 |
| 17 | Health score | 12 |
| 18 | Asset register | 9, 13 |
| 19 | Repair vs replace | 15 |
| 20 | Equipment purchase | 15 |
| 21 | Inventory | 13 |
| 22 | Inventory exposure | 13 |
| 23 | Commodity exposure | 13 |
| 24 | Accounts receivable | 11 |
| 25 | Accounts payable | 9, 11 |
| 26 | Land economics | 13 |
| 27 | Scenario modeling | 15 |
| 28 | Net worth | 15 |
| 29 | AI brief | 16 |
| 30 | Ask Acreflow | 16 |
| Integrations | QuickBooks → MCP | 17–19 |
| Data model | 19 core objects | 9 |
