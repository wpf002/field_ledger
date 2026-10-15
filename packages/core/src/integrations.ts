/**
 * Integration mapping layer (Roadmap 2, Phases 17-19). Every connected source is
 * translated into provider-neutral records before it touches the books, so no
 * integration dictates the data model. Pure functions; payload shapes follow each
 * provider's published API reference. Money: integer cents, + = money in.
 */

export type ExternalTxn = {
  externalId: string; date: string; cashDate: string | null; amountCents: bigint; description: string;
  counterparty?: string | null; categoryHint?: string | null; accountCodeHint?: string | null; pending?: boolean; memo?: string | null;
};
export type ExternalParty = { externalId: string; kind: "customer" | "vendor"; name: string; email?: string | null; terms?: number | null };
export type ExternalDoc = {
  externalId: string; kind: "invoice" | "bill"; number: string; partyExternalId: string; partyName?: string | null;
  issued: string; due: string; totalCents: bigint; balanceCents: bigint; description?: string | null;
};
export type ExternalPrice = { symbol: string; label: string; unit: string; priceCents: bigint; asOf: string; source: string };
export type ExternalBatch = { txns: ExternalTxn[]; parties: ExternalParty[]; docs: ExternalDoc[]; prices: ExternalPrice[]; benchmarks: ExternalBenchmark[] };
export const emptyBatch = (): ExternalBatch => ({ txns: [], parties: [], docs: [], prices: [], benchmarks: [] });

const cents = (n: number | string | null | undefined) => BigInt(Math.round(Number(n ?? 0) * 100));
const isoDay = (v: string | number | Date) => (v instanceof Date ? v : typeof v === "number" ? new Date(v * 1000) : new Date(v)).toISOString().slice(0, 10);

// ---------- Plaid (/transactions/sync) ----------
export type PlaidTransaction = {
  transaction_id: string; account_id: string; amount: number; date: string; authorized_date?: string | null; name: string;
  merchant_name?: string | null; pending: boolean; personal_finance_category?: { primary: string; detailed: string } | null;
};
/** Plaid amounts are positive when money leaves the account. */
export function mapPlaidTransaction(t: PlaidTransaction): ExternalTxn {
  return {
    externalId: `plaid:${t.transaction_id}`, date: t.authorized_date ?? t.date, cashDate: t.date, amountCents: -cents(t.amount),
    description: t.merchant_name ?? t.name, counterparty: t.merchant_name ?? null, categoryHint: t.personal_finance_category?.detailed ?? t.personal_finance_category?.primary ?? null, pending: t.pending,
  };
}

// ---------- Stripe (/v1/balance_transactions) ----------
export type StripeBalanceTxn = { id: string; amount: number; fee: number; net: number; type: string; created: number; available_on?: number; description?: string | null; reporting_category?: string };
/**
 * Charges post as gross sales plus a separate processing fee; refunds post as negative
 * sales; payouts only move money from Stripe to the bank, so they are not income.
 */
export function mapStripeBalanceTxn(b: StripeBalanceTxn): ExternalTxn[] {
  if (b.type === "payout" || b.type === "payout_cancel" || b.type === "payout_failure" || b.type === "transfer") return [];
  const day = isoDay(b.created);
  const out: ExternalTxn[] = [{ externalId: `stripe:${b.id}`, date: day, cashDate: day, amountCents: BigInt(b.amount), description: b.description ?? `Stripe ${b.type}`, categoryHint: b.type === "refund" ? "refund" : "sales" }];
  if (b.fee) out.push({ externalId: `stripe:${b.id}:fee`, date: day, cashDate: day, amountCents: -BigInt(b.fee), description: "Stripe processing fee", categoryHint: "bank fees" });
  return out;
}

// ---------- Square (/v2/payments) ----------
export type SquareMoney = { amount: number; currency: string };
export type SquarePayment = {
  id: string; created_at: string; status: string; total_money: SquareMoney; amount_money?: SquareMoney;
  processing_fee?: { amount_money: SquareMoney }[]; refunded_money?: SquareMoney; note?: string | null; source_type?: string;
};
export function mapSquarePayment(p: SquarePayment): ExternalTxn[] {
  if (p.status !== "COMPLETED") return [];
  const day = isoDay(p.created_at);
  const out: ExternalTxn[] = [{ externalId: `square:${p.id}`, date: day, cashDate: day, amountCents: BigInt(p.total_money.amount), description: p.note || `Square sale (${(p.source_type ?? "card").toLowerCase()})`, categoryHint: "sales" }];
  const fee = (p.processing_fee ?? []).reduce((s, f) => s + f.amount_money.amount, 0);
  if (fee) out.push({ externalId: `square:${p.id}:fee`, date: day, cashDate: day, amountCents: -BigInt(fee), description: "Square processing fee", categoryHint: "bank fees" });
  if (p.refunded_money?.amount) out.push({ externalId: `square:${p.id}:refund`, date: day, cashDate: day, amountCents: -BigInt(p.refunded_money.amount), description: "Square refund", categoryHint: "refund" });
  return out;
}

// ---------- QuickBooks Online (query API) ----------
export type QboRef = { value: string; name?: string };
export type QboInvoice = { Id: string; DocNumber?: string; TxnDate: string; DueDate?: string; TotalAmt: number; Balance: number; CustomerRef: QboRef; PrivateNote?: string; Line?: { Description?: string }[] };
export type QboBill = { Id: string; DocNumber?: string; TxnDate: string; DueDate?: string; TotalAmt: number; Balance: number; VendorRef: QboRef; PrivateNote?: string; Line?: { Description?: string }[] };
export type QboParty = { Id: string; DisplayName: string; PrimaryEmailAddr?: { Address?: string } };
export type QboPurchase = { Id: string; TxnDate: string; TotalAmt: number; EntityRef?: QboRef; PrivateNote?: string; Line?: { Description?: string; AccountBasedExpenseLineDetail?: { AccountRef?: QboRef } }[] };
export type QboSalesReceipt = { Id: string; TxnDate: string; TotalAmt: number; CustomerRef?: QboRef; PrivateNote?: string; Line?: { Description?: string }[] };

export function mapQboInvoice(i: QboInvoice): ExternalDoc {
  return { externalId: `qbo:inv:${i.Id}`, kind: "invoice", number: i.DocNumber || `QBO-${i.Id}`, partyExternalId: `qbo:cust:${i.CustomerRef.value}`, partyName: i.CustomerRef.name ?? null,
    issued: i.TxnDate, due: i.DueDate ?? i.TxnDate, totalCents: cents(i.TotalAmt), balanceCents: cents(i.Balance), description: i.Line?.find((l) => l.Description)?.Description ?? i.PrivateNote ?? null };
}
export function mapQboBill(b: QboBill): ExternalDoc {
  return { externalId: `qbo:bill:${b.Id}`, kind: "bill", number: b.DocNumber || `QBO-B${b.Id}`, partyExternalId: `qbo:vend:${b.VendorRef.value}`, partyName: b.VendorRef.name ?? null,
    issued: b.TxnDate, due: b.DueDate ?? b.TxnDate, totalCents: cents(b.TotalAmt), balanceCents: cents(b.Balance), description: b.Line?.find((l) => l.Description)?.Description ?? b.PrivateNote ?? null };
}
export const mapQboCustomer = (c: QboParty): ExternalParty => ({ externalId: `qbo:cust:${c.Id}`, kind: "customer", name: c.DisplayName, email: c.PrimaryEmailAddr?.Address ?? null });
export const mapQboVendor = (v: QboParty): ExternalParty => ({ externalId: `qbo:vend:${v.Id}`, kind: "vendor", name: v.DisplayName, email: v.PrimaryEmailAddr?.Address ?? null });
/** Cash purchases (checks, card charges) post as paid expenses; the QBO account name is the category hint. */
export function mapQboPurchase(p: QboPurchase): ExternalTxn {
  const line = p.Line?.find((l) => l.AccountBasedExpenseLineDetail?.AccountRef) ?? p.Line?.[0];
  return { externalId: `qbo:pur:${p.Id}`, date: p.TxnDate, cashDate: p.TxnDate, amountCents: -cents(p.TotalAmt), description: line?.Description ?? p.EntityRef?.name ?? "QuickBooks purchase",
    counterparty: p.EntityRef?.name ?? null, categoryHint: line?.AccountBasedExpenseLineDetail?.AccountRef?.name ?? null, memo: p.PrivateNote ?? null };
}
export function mapQboSalesReceipt(r: QboSalesReceipt): ExternalTxn {
  return { externalId: `qbo:sr:${r.Id}`, date: r.TxnDate, cashDate: r.TxnDate, amountCents: cents(r.TotalAmt), description: r.Line?.find((l) => l.Description)?.Description ?? r.CustomerRef?.name ?? "QuickBooks sale",
    counterparty: r.CustomerRef?.name ?? null, categoryHint: "sales", memo: r.PrivateNote ?? null };
}

// ---------- Xero (Accounting API) ----------
export type XeroInvoice = { InvoiceID: string; InvoiceNumber?: string; Type: "ACCREC" | "ACCPAY"; Contact: { ContactID: string; Name?: string }; DateString?: string; Date?: string; DueDateString?: string; DueDate?: string; Total: number; AmountDue: number; Status: string; Reference?: string };
/** Xero sends dates either as ISO strings or as "/Date(1717200000000+0000)/". */
export function xeroDate(v?: string): string {
  if (!v) return "";
  const m = /\/Date\((\d+)/.exec(v);
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : v.slice(0, 10);
}
export function mapXeroInvoice(i: XeroInvoice): ExternalDoc | null {
  if (i.Status === "DELETED" || i.Status === "VOIDED" || i.Status === "DRAFT") return null;
  const issued = xeroDate(i.DateString ?? i.Date), due = xeroDate(i.DueDateString ?? i.DueDate) || issued;
  const sale = i.Type === "ACCREC";
  return { externalId: `xero:${i.InvoiceID}`, kind: sale ? "invoice" : "bill", number: i.InvoiceNumber || i.InvoiceID.slice(0, 8), partyExternalId: `xero:${sale ? "cust" : "vend"}:${i.Contact.ContactID}`,
    partyName: i.Contact.Name ?? null, issued, due, totalCents: cents(i.Total), balanceCents: cents(i.AmountDue), description: i.Reference ?? null };
}

// ---------- FreshBooks (Accounting API) ----------
export type FreshbooksAmount = { amount: string; code: string };
export type FreshbooksInvoice = { id: number; invoice_number: string; customerid: number; create_date: string; due_date?: string; amount: FreshbooksAmount; outstanding: FreshbooksAmount; organization?: string; v3_status?: string; description?: string };
export type FreshbooksExpense = { id: number; date: string; amount: FreshbooksAmount; vendor?: string; notes?: string; category_name?: string };
export function mapFreshbooksInvoice(i: FreshbooksInvoice): ExternalDoc | null {
  if (i.v3_status === "draft" || i.v3_status === "deleted") return null;
  return { externalId: `freshbooks:inv:${i.id}`, kind: "invoice", number: i.invoice_number, partyExternalId: `freshbooks:cust:${i.customerid}`, partyName: i.organization ?? null,
    issued: i.create_date, due: i.due_date ?? i.create_date, totalCents: cents(i.amount.amount), balanceCents: cents(i.outstanding.amount), description: i.description ?? null };
}
export const mapFreshbooksExpense = (e: FreshbooksExpense): ExternalTxn => ({
  externalId: `freshbooks:exp:${e.id}`, date: e.date, cashDate: e.date, amountCents: -cents(e.amount.amount), description: e.notes || e.vendor || "FreshBooks expense",
  counterparty: e.vendor ?? null, categoryHint: e.category_name ?? null,
});

// ---------- USDA NASS Quick Stats ----------
export type NassRow = { commodity_desc: string; statisticcat_desc: string; unit_desc: string; year: number | string; reference_period_desc: string; Value: string; state_name?: string };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** "PRICE RECEIVED" rows -> commodity quotes. Unit "$ / BU" etc.; withheld values ("(D)") are skipped. */
export function mapNassPrice(r: NassRow, symbol: string): ExternalPrice | null {
  const v = Number(String(r.Value).replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  const mi = MONTHS.indexOf(r.reference_period_desc.slice(0, 3).toUpperCase());
  const asOf = new Date(Date.UTC(Number(r.year), mi >= 0 ? mi + 1 : 12, 0)).toISOString().slice(0, 10);
  const unit = r.unit_desc.replace(/^\$\s*\/\s*/, "").toLowerCase();
  return { symbol, label: `${r.commodity_desc[0]}${r.commodity_desc.slice(1).toLowerCase()} (${r.state_name ?? "US"})`, unit, priceCents: cents(v), asOf, source: "usda" };
}

// ---------- PayPal (Transaction Search, /v1/reporting/transactions) ----------
export type PaypalMoney = { currency_code: string; value: string };
export type PaypalTxn = {
  transaction_info: {
    transaction_id: string; transaction_event_code: string; transaction_initiation_date: string; transaction_updated_date?: string;
    transaction_amount: PaypalMoney; fee_amount?: PaypalMoney; transaction_status: string; transaction_subject?: string; transaction_note?: string;
  };
  payer_info?: { email_address?: string; payer_name?: { alternate_full_name?: string; given_name?: string; surname?: string } };
};
/**
 * Event codes: T00xx payments, T11xx reversals and refunds. Transfers to and from the
 * bank (T03xx, T04xx), holds, and currency conversions move money between accounts the
 * books already track, so they're skipped. Only completed ("S") rows count.
 */
export function mapPaypalTxn(t: PaypalTxn): ExternalTxn[] {
  const i = t.transaction_info;
  if (i.transaction_status !== "S" || !/^T(00|11)/.test(i.transaction_event_code)) return [];
  const day = i.transaction_initiation_date.slice(0, 10);
  const who = t.payer_info?.payer_name?.alternate_full_name ?? [t.payer_info?.payer_name?.given_name, t.payer_info?.payer_name?.surname].filter(Boolean).join(" ") ?? null;
  const gross = cents(i.transaction_amount.value);
  const out: ExternalTxn[] = [{
    externalId: `paypal:${i.transaction_id}`, date: day, cashDate: day, amountCents: gross,
    description: i.transaction_subject || i.transaction_note || (gross < 0n ? "PayPal refund" : "PayPal sale"), counterparty: who || null,
    categoryHint: gross < 0n ? "refund" : "sale",
  }];
  const fee = i.fee_amount ? cents(i.fee_amount.value) : 0n;
  if (fee !== 0n) out.push({ externalId: `paypal:${i.transaction_id}:fee`, date: day, cashDate: day, amountCents: fee < 0n ? fee : -fee, description: "PayPal fee", counterparty: "PayPal", categoryHint: "fee" });
  return out;
}

// ---------- Finicity / Mastercard Open Finance (aggregation v3 transactions) ----------
export type FinicityTxn = {
  id: number | string; amount: number; postedDate: number; transactionDate?: number; description: string; memo?: string; status: string;
  categorization?: { normalizedPayeeName?: string; category?: string };
};
/** Finicity signs amounts from the account's view (debits negative); dates are epoch seconds. */
export function mapFinicityTxn(t: FinicityTxn): ExternalTxn {
  return {
    externalId: `finicity:${t.id}`, date: isoDay(t.transactionDate || t.postedDate), cashDate: isoDay(t.postedDate), amountCents: cents(t.amount),
    description: t.description, counterparty: t.categorization?.normalizedPayeeName ?? null, categoryHint: t.categorization?.category ?? null,
    pending: t.status === "pending", memo: t.memo ?? null,
  };
}

// ---------- MX Platform API (/users/{guid}/transactions) ----------
export type MxTxn = {
  guid: string; amount: number; type: "DEBIT" | "CREDIT"; status: "POSTED" | "PENDING"; date: string; posted_at?: string | null; transacted_at?: string | null;
  description: string; original_description?: string; category?: string; top_level_category?: string; merchant_guid?: string | null;
};
/** MX amounts are unsigned; `type` gives the direction. */
export function mapMxTxn(t: MxTxn): ExternalTxn {
  const amt = cents(Math.abs(t.amount));
  return {
    externalId: `mx:${t.guid}`, date: (t.transacted_at ?? t.date).slice(0, 10), cashDate: (t.posted_at ?? t.date).slice(0, 10),
    amountCents: t.type === "DEBIT" ? -amt : amt, description: t.description, counterparty: t.description,
    categoryHint: t.category ?? t.top_level_category ?? null, pending: t.status === "PENDING", memo: t.original_description ?? null,
  };
}

// ---------- USDA AMS Market News (MARS API, /services/v1.2/reports/{slug}) ----------
export type AmsRow = Record<string, string | number | null | undefined> & { report_date?: string; commodity?: string; price_unit?: string };
const AMS_PRICE_FIELDS = ["avg_price", "wtd_avg_price", "weighted_average", "avg_price_avg", "price_avg", "avg_bid"];
/**
 * Report layouts differ (grain bids, auction summaries, direct slaughter), so the
 * price comes from the first average field present, else the midpoint of low/high.
 */
export function mapAmsRow(r: AmsRow, slug: string): ExternalPrice | null {
  const num = (k: string) => { const v = Number(String(r[k] ?? "").replace(/[$,]/g, "")); return Number.isFinite(v) && String(r[k] ?? "").trim() !== "" ? v : null; };
  let v = AMS_PRICE_FIELDS.map(num).find((x) => x != null) ?? null;
  if (v == null) { const lo = num("price_min") ?? num("low_price") ?? num("avg_price_min"), hi = num("price_max") ?? num("high_price") ?? num("avg_price_max"); v = lo != null && hi != null ? (lo + hi) / 2 : null; }
  if (v == null || !r.report_date) return null;
  const d = new Date(String(r.report_date));
  if (Number.isNaN(d.getTime())) return null;
  const parts = [r.commodity, r.class, r.grade, r.frame, r.weight_break_low != null ? `${r.weight_break_low}-${r.weight_break_high} lb` : null, r.location ?? r.market_location_name].filter((x) => x != null && String(x).trim() !== "");
  const label = parts.join(" · ") || `AMS report ${slug}`;
  const unit = String(r.price_unit ?? "").replace(/^\$\s*(per\s*)?/i, "").toLowerCase() || "unit";
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return { symbol: `AMS-${slug}-${key}`, label, unit, priceCents: cents(v), asOf: d.toISOString().slice(0, 10), source: "usda" };
}

// ---------- Futures quotes (Barchart OnDemand getQuote) ----------
export type BarchartQuote = { symbol: string; name?: string; lastPrice: number | null; previousClose?: number | null; tradeTimestamp?: string; serverTimestamp?: string };
/** Front-month futures by commodity. Grains and cotton quote in cents; cattle and hogs in $/cwt. */
export const FUTURES: Record<string, { root: string; label: string; unit: string; centsQuote: boolean }> = {
  CORN: { root: "ZC", label: "Corn futures (CBOT)", unit: "bu", centsQuote: true },
  SOYBEANS: { root: "ZS", label: "Soybean futures (CBOT)", unit: "bu", centsQuote: true },
  WHEAT: { root: "KE", label: "KC HRW wheat futures", unit: "bu", centsQuote: true },
  COTTON: { root: "CT", label: "Cotton futures (ICE)", unit: "lb", centsQuote: true },
  CATTLE: { root: "LE", label: "Live cattle futures (CME)", unit: "cwt", centsQuote: false },
  FEEDERS: { root: "GF", label: "Feeder cattle futures (CME)", unit: "cwt", centsQuote: false },
  HOGS: { root: "HE", label: "Lean hog futures (CME)", unit: "cwt", centsQuote: false },
};
export function mapBarchartQuote(q: BarchartQuote): ExternalPrice | null {
  const spec = Object.values(FUTURES).find((f) => q.symbol.startsWith(f.root));
  const px = q.lastPrice ?? q.previousClose ?? null;
  if (!spec || px == null) return null;
  const dollars = spec.centsQuote ? px / 100 : px;
  return { symbol: `${spec.root}-FRONT`, label: spec.label, unit: spec.unit, priceCents: cents(dollars), asOf: (q.tradeTimestamp ?? q.serverTimestamp ?? new Date().toISOString()).slice(0, 10), source: "cme" };
}

// ---------- USDA ERS ARMS (/data/arms/surveydata) ----------
export type ArmsRow = { year: number; state?: string; region?: string; farmtype?: string; category?: string; category_value?: string; variable_name: string; estimate: number | string | null; median?: number | string | null; unreliable_estimate?: number | string };
export type ExternalBenchmark = { year: number; region: string; farmType: string | null; metric: string; label: string; value: number; median: number | null };
/** ARMS reports ratios by name; these patterns pick the ones the health score uses. */
const ARMS_METRICS: [RegExp, string, string, boolean][] = [
  [/current ratio/i, "currentRatio", "Current Ratio", false],
  [/debt.to.asset/i, "debtToAsset", "Debt to Assets", true],
  [/debt.to.equity/i, "debtToEquity", "Debt to Equity", false],
  [/rate of return on assets|return on assets/i, "returnOnAssets", "Return on Assets", true],
  [/rate of return on equity|return on equity/i, "returnOnEquity", "Return on Equity", true],
  [/operating profit margin/i, "operatingProfitMargin", "Operating Margin", true],
  [/asset turnover/i, "assetTurnover", "Asset Turnover", true],
  [/operating expense ratio/i, "operatingExpenseRatio", "Operating Expense Ratio", true],
  [/interest expense ratio/i, "interestExpenseRatio", "Interest Expense Ratio", true],
  [/depreciation expense ratio/i, "depreciationExpenseRatio", "Depreciation Expense Ratio", true],
];
/** ARMS publishes percentage ratios as percents (12.3); the app stores fractions (0.123). */
export function mapArmsRow(r: ArmsRow): ExternalBenchmark | null {
  const m = ARMS_METRICS.find(([re]) => re.test(r.variable_name));
  const v = Number(r.estimate);
  if (!m || r.estimate == null || !Number.isFinite(v) || String(r.unreliable_estimate ?? "0") === "1") return null;
  const scale = (x: number) => (m[3] ? x / 100 : x);
  const med = r.median != null && Number.isFinite(Number(r.median)) ? scale(Number(r.median)) : null;
  return { year: Number(r.year), region: r.state ?? r.region ?? "All", farmType: r.category_value ?? r.farmtype ?? null, metric: m[1], label: m[2], value: scale(v), median: med };
}

// ---------- National Weather Service forecast ----------
export type NwsPeriod = { name: string; startTime: string; isDaytime: boolean; temperature: number; temperatureUnit: string; probabilityOfPrecipitation?: { value: number | null }; shortForecast: string };
export const mapNwsPeriod = (p: NwsPeriod) => ({ name: p.name, date: p.startTime.slice(0, 10), daytime: p.isDaytime, temp: `${p.temperature}°${p.temperatureUnit}`, rainChance: p.probabilityOfPrecipitation?.value ?? null, summary: p.shortForecast });

// ---------- categorization ----------
/** Category hints from sources -> Schedule F category code (falls back to the description rules). */
export function categoryToScheduleF(hint: string | null | undefined, isIncome: boolean): string | null {
  const h = (hint ?? "").toLowerCase();
  if (!h) return null;
  if (isIncome) return /refund/.test(h) ? "other_income" : /sale|deposit|income/.test(h) ? "livestock_sales_raised" : null;
  if (/feed|hay|grain/.test(h)) return "feed";
  if (/fuel|gas|diesel/.test(h)) return "fuel";
  if (/fertili|lime/.test(h)) return "fertilizer";
  if (/vet|medic|animal/.test(h)) return "veterinary";
  if (/seed|plant/.test(h)) return "seeds_plants";
  if (/repair|maint|parts/.test(h)) return "repairs_maintenance";
  if (/insur/.test(h)) return "insurance";
  if (/interest/.test(h)) return "interest_other";
  if (/payroll|wage|labor/.test(h)) return "labor_hired";
  if (/rent|lease/.test(h)) return "rent_lease_land";
  if (/utilit|electric|water/.test(h)) return "utilities";
  if (/tax/.test(h)) return "taxes";
  if (/freight|truck|ship/.test(h)) return "freight_trucking";
  if (/chemical|herbicide|pesticide/.test(h)) return "chemicals";
  if (/bank|fee|service charge/.test(h)) return "other_expense";
  if (/suppl|tool|hardware|general_merchandise/.test(h)) return "supplies";
  return null;
}
