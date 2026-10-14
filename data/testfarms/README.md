# AcreFlow Test Dataset - four fictional farm & ranch accounts

Generated 2026-10-04. Actuals run 1 Jan 2023 to 30 Sep 2026. Forecasts run 1 Oct 2026 to 30 Sep 2027 (base / optimistic / downside), plus a 13-week cash forecast starting 1 Oct 2026.

All businesses, people, customers, vendors and lenders are fictional. Commodity, cattle, fertilizer, interest-rate and program-payment levels approximate public 2023-2026 data (USDA AMS, DTN, KSU/TAMU custom-rate and budget surveys, USDA program announcements); 2026-27 values are modeled.

## Files
- `AcreFlow_<CODE>_<Business>.xlsx`: one workbook per account. Statement tabs use live formulas, and a **Checks** tab ties the statements back to the ledger, AR, debt and herd records (all four show PASS).
- `AcreFlow_TestData_CSV/`: the same normalized tables for all four businesses (keyed by `business_id`), ready to import, plus `_data_dictionary.csv` (table, column, primary/foreign keys, description).

## Accounts
| ID | Business | Profile | Revenue/yr | Net farm income (accrual) |
|---|---|---|---|---|
| BIZ-BRN | Cedar Branch Farm (Farmer Brown) | Stable but operationally inefficient | ~$99-111k | $17-24k |
| BIZ-SAM | Whitfield Farms LLC (Farmer Sam) | Profitable, periodic cash squeeze | ~$375-445k | $15k / $76k / $102k (2023-25) |
| BIZ-LAN | Post Oak Meadows LLC (Farmer Lance) | Meaningful financial & operational risk | ~$205-315k | $14k / $41k / $22k; -$11k YTD 2026 |
| BIZ-RCK | Dawson Charolais Ranch LLC (Rancher Rick) | Financially strong, asset-heavy | ~$335-605k | -$75k (2023 drought) / $101k / $208k |

## Conventions
- **IDs:** `BIZ-`, `ENT-`, `TXN-`, `INV-` (AR invoices), `BILL-` (AP), `POOL-` (cotton pool), `AST-`, `LN-`/`LOC-` (term loans / lines), `ANM-` (animals), `CS-` (crop seasons), `CUS-`, `VEN-`, `XFR-` (internal transfers). Every foreign key resolves.
- **Dates:** `txn_date` is when revenue was earned or the cost incurred. `cash_date` is when cash moved; it is blank when the item was unpaid at 9/30/2026 (see `expected_cash_date`). Accounts receivable, accounts payable, credit cards, customer deposits, prepaid inputs, and accrued property and payroll tax all come from the gap between the two dates.
- **Signs:** `amount` is always positive; `section` gives its nature. `cash_effect` is signed (+ for inflow). In the income-statement detail, + increases income.
- **Valuation:** grain, hay, feed and livestock are carried at monthly market value; growing crops, semen and packaged meat at cost; machinery and buildings at net book value; land at cost, with market value shown as a memo. Accrual net farm income = operating income + inventory changes + livestock value changes (FFSC style), and equity rolls forward from it. Balance sheets balance every month.
- **Enterprises:** every revenue line and direct cost is assigned to an enterprise. Rick's weaned calves move between enterprises as internal transfers at market value; these net to zero for the business.
- **Livestock:** every animal is tracked individually (birth or purchase, dam/sire, class changes, disposition), so herd flow reconciles exactly by class and month.

## Data generation plan

### BIZ-BRN
- Business profile: Cedar Branch Farm (Dale & Linda Brown), sole proprietorship, 95 owned acres near Stephenville, TX (Erath Co.), since 2011.
- Revenue streams: beef shares (whole/half/quarter, deposits + balance at pickup); hog shares + retail pork cuts; goat kids (Easter auction), breeding doelings, cull does; eggs to 3 restaurants (monthly invoices, net 15) + market; Saturday farmers-market produce + seconds sold wholesale to a local grocer.
- Enterprises: BEEF, PORK, GOAT, EGG, PRD (shared) with 7 crop sub-enterprises (TOM, CRN, OKR, ZUC, SQU, WML, PUM), OVH.
- Acreage: 15 ac produce (9.5-10 ac planted + fall squash/zucchini + cover), 30 ac improved bermuda, 38 ac native, 6 ac goat paddock, 6 ac HQ.
- Livestock: 6 Angus x Hereford cows + registered Angus bull (replaced May-2025), ~5 beef/yr processed at 19-25 months after 120-day grain finish; 2 batches x 4 feeder pigs/yr; 8 Boer-cross does + buck; ~30 layers (pullets added 2023/2025/2026, spent hens processed for household). Every animal is tracked individually; herd flow reconciles monthly.
- Equipment: Kubota MX5400 + implements (0% note to Apr-2027), walk-in cooler & freezers (note paid off Mar-2026), drip irrigation & well, 2015 Silverado, used livestock trailer (2024, cash).
- Labor: Dale full-time, Linda ~20 h/wk unpaid; 1-2 seasonal crew May-Sep, teen market helper from 2025; payroll taxes accrued monthly.
- Debt: 2011 land loan (Farm Credit, 4.95%, monthly), cooler note, Kubota 0% note. No operating line.
- Revenue: ~$99-111k/yr. Profitability: net farm income ~$17-24k/yr (accrual); operating income $12-18k; negative return on assets after a $32k owner labor charge.
- Primary challenge: knowing which small enterprises make money - produce (okra, tomatoes) carries the farm, sweet corn and eggs lose money once labor is counted, and beef margins are squeezed by processor fees.
- Seasonality: spring cash trough (seed, transplants, fertilizer, payroll) -> May low; market revenue May-Nov; beef processing Apr-May & Oct-Nov; hay purchased Oct-Nov; pig batches Mar-Aug and Aug-Feb; kids sold at Easter.

### BIZ-SAM
- Business profile: Whitfield Farms LLC (Sam & Megan Whitfield), partnership-taxed LLC; 300 owned acres in McPherson Co., KS (home, bins, shop) + 100 inherited acres of dryland cotton in Carson Co., TX.
- Revenue streams: corn, soybeans and HRW wheat (sold at harvest or from 25,000 bu of on-farm bins); cotton lint through a co-op marketing pool (55% advance in Jan, progress payments Apr/Jul, final Oct) + cottonseed; custom combining ($/ac) and grain hauling ($/bu) for 8 neighbors; crop insurance indemnities; USDA ARC/PLC, ECAP (2025), SDRP (2025), Farmer Bridge Assistance (2026).
- Enterprises: COT (Texas cotton, all field work contracted), CORN, SOY, WHT (Kansas), CUS (custom harvesting & hauling), OVH.
- Acreage: KS-P1 125 ac pivot (corn/soy), KS-D1 & KS-D2 80 ac dryland each (wheat/soy/corn rotation), 15 ac HQ; TX-C1 96 planted + 4 turnrow acres.
- Crops: every season has planting date, expected (APH) vs actual yield, marketing plan and sales; 2023 drought (wheat 31 bu, dryland corn 74 bu, cotton 276 lb + indemnities); 2026 Kansas wheat freeze/drought (36 bu).
- Equipment: 2019 JD S770 combine (bought 2022, ~88% custom hours) + corn & draper heads; JD 8R 280 (Mar-2025, traded 7830); Kinze 16-row planter; drill; sprayer; grain cart; Peterbilt semi + hopper (Aug-2024; old tandem truck sold); pivot, bins/dryer, shop; F-350.
- Labor: Sam (operates combine), Megan (grain cart, books), 1 seasonal hand/CDL driver May-Nov; TX contractors for shredding, bedding, planting, spraying, stripping; gin.
- Debt: KS land loan ($420k 2019, 4.35%, annual), combine/head note ($262k, 7 annual), tractor note ($165k 2025, 6 annual), semi note (48 monthly), pickup note (paid off May-2026), $250k operating line at prime + 1%.
- Revenue: ~$375-445k/yr. Profitability: net farm income $15k (2023 drought), $76k (2024), $102k (2025); base forecast +$72k for Oct-26 to Sep-27.
- Primary challenge: seasonal cash. Inputs are prepaid in Dec, combine and tractor payments fall in Jan and Mar, cotton pool cash arrives 2-10 months after harvest, and custom clients pay in 30-120 days. The line hits its limit each summer and year-end balances are rising.
- Seasonality: Dec prepay; Mar-May inputs/planting; Jun-Jul wheat harvest + custom wheat run; Sep-Nov fall harvest + custom corn/soy; Nov-Dec cotton stripping & ginning; Jan-Oct pool payments.

### BIZ-LAN
- Business profile: Post Oak Meadows LLC (Lance Tidwell), single-member LLC, 500 owned acres near Centerville, TX (Leon Co.); inherited 2009, hay since 2011. Lance also works off-farm.
- Revenue streams: 5x6 net-wrapped round bales of fertilized coastal bermuda sold at the barn or delivered (+$9/bale), mostly to area ranchers (3 on account); 150-ac grazing lease to Kessler Cattle Co. ($26/ac -> $30/ac from 2025, paid Jan/Jul).
- Enterprises: HAY, LSE (lease), OVH.
- Acreage: H1 120, H2 110, H3 114 harvested ac + 6 ac barn/roads = 350; L1 150 ac lease pasture.
- Production: 2-4 cuttings/yr driven by rainfall in each growth window (weather table); bales, tons and avg bale weight per cutting; ~90-95% of production sold, the rest carryover or spoilage (outside storage ~2%/month vs barn 0.3%).
- Equipment: 2008 JD 5065E loader tractor (repairs rising), 2017 F-250, hay trailer, fence/well improvements, hay barn (May-2024, $112k, financed $90k).
- Labor/contractors: no employees. Fertilizer & spraying custom-applied by the co-op; cut/rake/bale/wrap and stacking by a custom hay contractor ($28.50 -> $35.00/bale); hauling by contract trucker.
- Debt: barn loan only (Farm Credit, 7.85%, 10 annual payments from Jun-2025).
- Revenue: ~$205-315k/yr, volatile. Profitability: net farm income $14k (2023 drought), $41k (2024), $22k (2025); -$11k YTD 2026; downside forecast ~breakeven.
- Primary challenge: margin is a thin spread between hay price and fertilizer + contractor cost, swung by rain; break-even is ~$78/bale; customer concentration (Kessler ~30% of revenue); off-farm wages covered $63k of farm cash 2023-2026.
- Seasonality: Mar spring blend; Apr herbicide; cuttings May/Jun/Aug/early Oct; side-dress N after each cutting; summer sales off the field; fall-winter sales from storage at +3-4%; property tax paid Jan; lease Jan/Jul.

### BIZ-RCK
- Business profile: Dawson Charolais Ranch LLC (Rick & Carol Dawson), partnership-taxed family LLC; 1,100 owned acres near Hamilton, TX (780 family + 320-ac North Place bought 2018); registered Charolais since the 1990s.
- Revenue streams: weaned steer & commercial heifer calves and culls (auction); premium bulls (March production sale, sale-manager settlement in ~14 days); commercial-grade bulls (private treaty); culled bull prospects (auction); open & bred registered heifers and registered pairs; semen from two prize sires (direct + distributor at 70%); ranch-to-table beef (30% deposits); hunting lease; show premiums; LFP & EQIP payments.
- Enterprises: COM (cow-calf base herd & auction cattle), BRD (heifer development & registered females), BULL (bull development & sales), GEN (semen/genetics), R2T (ranch-to-table), REC (hunting), OVH. Weaned calves move between enterprises as internal transfers at market value.
- Acreage / grazing: 420 ac improved pasture in 7 rotational paddocks, 520 ac native, 60 ac calving traps near HQ (cows moved ~30 days pre-calving with extra supplementation), 25 ac bull/development/finishing pens, 18 ac ponds, 12 ac HQ, 45 ac roads/creek/woods. Hay bought Sep-Nov plus drought purchases; usage modeled from animal units.
- Livestock: ~140 cows/first-calf heifers, 2 prize sires (Titan b.2016, injured 2024; Maverick b.2019), 2 cleanup bulls, ~18 bull prospects and ~36 heifer candidates/yr, 6-8 R2T steers/yr. Every animal is tracked from birth (dam/sire, AI or natural) to disposition, and reproduction metrics are reported yearly: conception, calving, survival, weaning.
- Equipment & assets: JD 6R 145 (2024, traded 6430), Bobcat, UTVs, aging 2012 F-350 bale-bed truck, Ram 3500, stock & show trailers, squeeze chute (2023), barns/pens/fencing/water (new EQIP well 2025), semen tanks.
- Labor: 1 full-time manager + housing, 1 part-time hand; vet, AI tech, stud collection center, processor, brush & fence contractors.
- Debt: North Place land loan ($780k, 4.85%, semiannual), 2022 breeding-stock note, 2024 tractor note, 2024 drought carryover term note ($150k), pickup note, $350k operating line (prime + 0.75%).
- Revenue: ~$335-605k/yr (cattle-price driven). Profitability: accrual NFI -$75k (2023 drought), +$101k (2024), +$208k (2025), +$236k YTD 2026 (includes livestock revaluation). Market net worth ~$7.3M.
- Primary challenge: optimizing an asset-heavy, successful ranch. Semen is very profitable but depends on an aging sire. Drought and seasonal line usage need managing, the return on the land base is low, and the R2T, retention and equipment decisions need numbers behind them.
- Seasonality: Jan-Apr calving; March bull sale; May AI/breeding; Sep preg check; Oct weaning & auction; Nov bred-heifer sale; R2T processing Mar-May & Sep-Dec; semen sales peak Mar-Jun; hay Sep-Nov; Aug hunting-lease payment.

## AI insights (summary)
- **INS-BRN-01 [Opportunity]** Okra and tomatoes earn 3-4x per acre what sweet corn does
- **INS-BRN-02 [Watch]** About 52% of harvested vegetables never sell
- **INS-BRN-03 [Warning]** Eggs break even on cash and lose money once Linda's time is counted
- **INS-BRN-04 [Warning]** Processing costs are rising faster than the beef price list
- **INS-BRN-05 [Opportunity]** Two more cows look like the best use of idle pasture
- **INS-BRN-06 [Watch]** Every spring the farm leans on Linda's paycheck
- **INS-BRN-07 [Watch]** After paying the owner a wage, the farm earns nothing on its assets
- **INS-BRN-08 [Watch]** Farm insurance premiums are up 47% in three years
- **INS-BRN-09 [Positive]** Debt is falling steadily and two notes are nearly gone
- **INS-BRN-10 [Positive]** Goats moved from a loss to a small profit
- **INS-SAM-01 [Positive]** Custom harvesting carries the whole business
- **INS-SAM-02 [Warning]** Texas cotton has lost money every year, even with emergency aid
- **INS-SAM-03 [Critical]** Profitable on paper, but the line can't carry next summer
- **INS-SAM-04 [Warning]** Working capital is eroding as the line funds term payments
- **INS-SAM-05 [Watch]** The combine is wearing out quickly
- **INS-SAM-06 [Warning]** One custom client owes for last fall's corn harvest
- **INS-SAM-07 [Watch]** 26% of custom revenue comes from one client
- **INS-SAM-08 [Watch]** Storing corn has cut both ways
- **INS-SAM-09 [Watch]** A 20% fertilizer increase would take 6% of 2025 profit
- **INS-SAM-10 [Watch]** Ad-hoc federal aid supplied a large share of recent profit
- **INS-LAN-01 [Critical]** Summer rainfall decides the year
- **INS-LAN-02 [Warning]** Fertilizer per acre is up 24% since 2024
- **INS-LAN-03 [Warning]** The custom baler's rate is up 23%
- **INS-LAN-04 [Critical]** Break-even hay price is now about $78 a bale
- **INS-LAN-05 [Critical]** Off-farm wages, not hay, are paying for the barn
- **INS-LAN-06 [Watch]** One rancher is both the biggest hay buyer and the tenant
- **INS-LAN-07 [Warning]** Brushy Prairie Farms keeps paying later
- **INS-LAN-08 [Watch]** The barn cut spoilage but barely pays for itself
- **INS-LAN-09 [Watch]** A $2.85M land base earns well under 1%
- **INS-LAN-10 [Watch]** Repairs on the 2008 loading tractor are up 2.7x since 2023
- **INS-RCK-01 [Positive]** Semen is Rick's best business
- **INS-RCK-02 [Warning]** Too much semen from an aging sire
- **INS-RCK-03 [Watch]** Much of the profit comes from the herd revaluing upward
- **INS-RCK-04 [Warning]** The 2023 drought cost a year of profit and a term loan
- **INS-RCK-05 [Watch]** Strong balance sheet, low return on ~$8.4M of market assets
- **INS-RCK-06 [Opportunity]** Ranch-to-table beef earns about $3,400 a head more than selling the calf
- **INS-RCK-07 [Positive]** Premium bulls sell for 2.0x the price of commercial bulls
- **INS-RCK-08 [Watch]** Reproduction slipped in 2023 and 2025
- **INS-RCK-09 [Watch]** Seasonal credit needs are large
- **INS-RCK-10 [Opportunity]** The ranch can carry a replacement for the feed truck

## Tables

- `ai_insights` (40 rows): AcreFlow financial-intelligence output: ~10 insights per business, each tied to values in the named source tables.
- `animals` (931 rows): Individual animal registry (cattle, goats, swine, poultry): birth, origin, parentage, class, disposition, weights, sale price.
- `ap_bills` (1086 rows): Accounts payable by vendor bill (items bought on account).
- `ar_invoices` (926 rows): Accounts receivable by invoice (incl. deposits and pool payments); days outstanding as of 9/30/2026 for open items.
- `assets` (56 rows): Asset register: cost, financing, balance, depreciation, NBV, market value, repair history, usage.
- `balance_sheet_monthly` (184 rows): Month-end balance sheets 12/31/2022-9/30/2026. Inventories & livestock at market (growing crops, semen, packaged meat at cost); machinery/buildings at book; land at cost (market value memo). balance_check must be 0.
- `budget_monthly` (192 rows): Annual operating budgets (set each January at expected yields/prices/normal weather), monthly.
- `budget_vs_actual` (165 rows): Planned vs actual revenue, expenses, gross margin and net income (operating basis) by enterprise; 2026 YTD through Sep.
- `bull_sales` (65 rows): Bull sales by grade (premium / commercial / cull) and price.
- `businesses` (4 rows): Business profile for each test account (owner, location, structure, labor, accounting method, goals, financial personality).
- `cash_flow_monthly` (180 rows): Monthly cash flow by class (collections, commodity receipts, payroll, inputs, debt payments, capex, owner draws...).
- `cash_forecast_13_week` (52 rows): Rolling 13-week cash forecast from 10/1/2026 (base case): starting cash, receipts incl. open invoices, disbursements incl. scheduled debt, line activity, ending cash.
- `cash_forecast_13_week_items` (591 rows): Line-item detail behind the 13-week forecast with source (open invoice/bill, loan schedule, operating plan).
- `chart_of_accounts` (86 rows): Shared chart of accounts. section: REV, COP (cost of production), OVH, INT, DEP, GAIN, INVCHG, LVCHG, XFER, CASHBS (balance-sheet cash flows).
- `crop_seasons` (57 rows): Crop/hay/produce seasons: acres, planting, expected vs actual yield and price, production, sold, stored, lost.
- `customers` (316 rows): Customers / counterparties receiving invoices or paying cash.
- `depreciation_annual` (395 rows): Depreciation by asset, enterprise allocation and year.
- `enterprise_transfers` (278 rows): Internal transfers of animals (and semen at cost) between enterprises at market value. Net to zero for the business.
- `enterprises` (29 rows): Enterprise structure; every revenue/direct-cost row is assigned to one.
- `financial_ratios` (20 rows): FFSC-style ratios: liquidity, solvency, profitability, repayment capacity, efficiency.
- `forecast_12_month` (144 rows): Oct-2026 to Sep-2027 monthly forecast (Base / Optimistic / Downside): income statement + cash flow + line balance.
- `forecast_assumptions` (32 rows): Key drivers for each forecast scenario.
- `herd_flow_annual` (88 rows): Annual herd reconciliation (2026 = through 9/30).
- `herd_flow_monthly` (874 rows): Monthly herd reconciliation by class: opening + births + purchases + transfers in - transfers out - deaths - culls - sales - processed - household use = ending (check = 0).
- `income_statement_annual_by_enterprise` (132 rows): Annual (2026 = YTD Sep) P&L by enterprise and TOTAL; enterprise rows include internal transfers.
- `income_statement_monthly_detail` (5403 rows): Monthly income statement by enterprise and account, incl. depreciation, gains, inventory & livestock value changes. amount: + increases income.
- `income_statement_monthly_summary` (180 rows): Monthly totals: revenue, cost of production, gross profit, overhead, EBITDA, depreciation, operating profit, interest, net income (operating), inventory changes, net farm income (accrual).
- `inventory_snapshots` (1350 rows): Month-end inventory: quantity, cost basis, market value, valuation basis used on balance sheet (grain, hay, feed, growing crops, semen, packaged meat, livestock by class).
- `labor_hours` (591 rows): Hired and unpaid family labor hours by month/enterprise.
- `land_parcels` (22 rows): Acreage by field/pasture and use.
- `loan_schedule` (698 rows): Full amortization schedules (paid and scheduled).
- `loans` (16 rows): Debt records incl. operating lines: lender, type, principal, rate, payment, maturity, collateral, interest paid.
- `operating_line_monthly` (90 rows): Operating line month-end balance, availability, rate, interest.
- `prize_bull_valuations` (92 rows): Monthly estimated market & insured value of Rick's two prize sires.
- `processed_animal_economics` (62 rows): Per-animal finishing/processing economics for direct-to-consumer beef & pork.
- `production_records` (654 rows): Operational logs: hay cuttings, market-day harvest & sales, weekly egg production, combine separator hours, animal units.
- `reproduction_metrics` (4 rows): Rick's herd: conception, calving, survival, weaning rates and weights.
- `scenario_levers` (25 rows): Decision questions with drivers, base values and estimated annual impact computed from the dataset.
- `semen_log` (112 rows): Semen collections, sales and internal AI use by sire.
- `transactions` (8321 rows): General ledger (actuals). txn_date = date earned/incurred (accrual); cash_date = date cash moved (blank = unpaid at 9/30/2026, see expected_cash_date). cash_effect is signed (+ inflow). 'Prior period' rows are 2022 items that settle in 2023 (opening AR/AP).
- `unit_economics_crops` (57 rows): Cost per acre & break-even (yield and price) by crop season.
- `unit_economics_livestock` (36 rows): Revenue and cost per head (or per straw for semen) by livestock enterprise.
- `vendors` (95 rows): Vendors, lenders, contractors.
- `weather` (57 rows): Monthly rainfall vs normal (actuals to Sep-2026, base assumption after).