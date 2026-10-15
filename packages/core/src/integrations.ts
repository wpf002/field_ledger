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
export type ExternalBatch = { txns: ExternalTxn[]; parties: ExternalParty[]; docs: ExternalDoc[]; prices: ExternalPrice[] };
export const emptyBatch = (): ExternalBatch => ({ txns: [], parties: [], docs: [], prices: [] });

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
