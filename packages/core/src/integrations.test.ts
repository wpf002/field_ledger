import { describe, expect, it } from "vitest";
import {
  mapPlaidTransaction, mapStripeBalanceTxn, mapSquarePayment, mapQboInvoice, mapQboPurchase, mapXeroInvoice, xeroDate,
  mapFreshbooksInvoice, mapNassPrice, categoryToScheduleF, mapPaypalTxn, mapFinicityTxn, mapMxTxn, mapAmsRow, mapBarchartQuote, mapArmsRow,
} from "./integrations.js";

describe("integration mappers", () => {
  it("Plaid: positive amounts are outflows", () => {
    const t = mapPlaidTransaction({ transaction_id: "t1", account_id: "a", amount: 82.15, date: "2026-03-02", authorized_date: "2026-03-01", name: "TRACTOR SUPPLY #123", merchant_name: "Tractor Supply", pending: false, personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER" } });
    expect(t.amountCents).toBe(-8215n);
    expect(t.date).toBe("2026-03-01");
    expect(t.cashDate).toBe("2026-03-02");
    expect(mapPlaidTransaction({ transaction_id: "t2", account_id: "a", amount: -1500, date: "2026-03-05", name: "DEPOSIT", pending: false }).amountCents).toBe(150000n);
  });
  it("Stripe: charges split into gross sale and fee; payouts are not income", () => {
    const rows = mapStripeBalanceTxn({ id: "txn_1", amount: 10000, fee: 320, net: 9680, type: "charge", created: 1767225600, description: "Beef half deposit" });
    expect(rows.map((r) => r.amountCents)).toEqual([10000n, -320n]);
    expect(mapStripeBalanceTxn({ id: "po_1", amount: -9680, fee: 0, net: -9680, type: "payout", created: 1767225600 })).toEqual([]);
  });
  it("Square: completed payments with fees and refunds", () => {
    const rows = mapSquarePayment({ id: "p1", created_at: "2026-06-06T15:01:00Z", status: "COMPLETED", total_money: { amount: 2400, currency: "USD" }, processing_fee: [{ amount_money: { amount: 66, currency: "USD" } }], refunded_money: { amount: 400, currency: "USD" }, source_type: "CARD" });
    expect(rows.map((r) => r.amountCents)).toEqual([2400n, -66n, -400n]);
    expect(mapSquarePayment({ id: "p2", created_at: "2026-06-06T15:01:00Z", status: "FAILED", total_money: { amount: 100, currency: "USD" } })).toEqual([]);
  });
  it("QuickBooks: invoices and purchases", () => {
    const inv = mapQboInvoice({ Id: "130", DocNumber: "1037", TxnDate: "2026-05-01", DueDate: "2026-05-31", TotalAmt: 362.07, Balance: 362.07, CustomerRef: { value: "3", name: "Cool Cars" } });
    expect(inv).toMatchObject({ number: "1037", totalCents: 36207n, balanceCents: 36207n, partyExternalId: "qbo:cust:3" });
    const p = mapQboPurchase({ Id: "9", TxnDate: "2026-04-02", TotalAmt: 51.25, EntityRef: { value: "1", name: "Co-op" }, Line: [{ Description: "Mineral", AccountBasedExpenseLineDetail: { AccountRef: { value: "7", name: "Feed" } } }] });
    expect(p.amountCents).toBe(-5125n);
    expect(categoryToScheduleF(p.categoryHint, false)).toBe("feed");
  });
  it("Xero: legacy date format and invoice type", () => {
    expect(xeroDate("/Date(1717200000000+0000)/")).toBe("2024-06-01");
    const d = mapXeroInvoice({ InvoiceID: "abc-123", InvoiceNumber: "INV-9", Type: "ACCPAY", Contact: { ContactID: "c1", Name: "Feed Mill" }, DateString: "2026-02-01T00:00:00", DueDateString: "2026-03-01T00:00:00", Total: 1200, AmountDue: 0, Status: "PAID" })!;
    expect(d.kind).toBe("bill");
    expect(d.balanceCents).toBe(0n);
    expect(mapXeroInvoice({ InvoiceID: "x", Type: "ACCREC", Contact: { ContactID: "c" }, Total: 1, AmountDue: 1, Status: "DRAFT" })).toBeNull();
  });
  it("FreshBooks and USDA", () => {
    expect(mapFreshbooksInvoice({ id: 7, invoice_number: "0000007", customerid: 4, create_date: "2026-01-05", amount: { amount: "250.00", code: "USD" }, outstanding: { amount: "0.00", code: "USD" } })!.totalCents).toBe(25000n);
    expect(mapNassPrice({ commodity_desc: "CORN", statisticcat_desc: "PRICE RECEIVED", unit_desc: "$ / BU", year: 2026, reference_period_desc: "AUG", Value: "4.12", state_name: "KANSAS" }, "CORN-KS")).toMatchObject({ priceCents: 412n, asOf: "2026-08-31", unit: "bu" });
    expect(mapNassPrice({ commodity_desc: "CORN", statisticcat_desc: "PRICE RECEIVED", unit_desc: "$ / BU", year: 2026, reference_period_desc: "AUG", Value: "(D)" }, "X")).toBeNull();
  });
});

describe("phase 2 sources", () => {
  it("PayPal: payments split gross and fee; bank transfers skipped", () => {
    const rows = mapPaypalTxn({ transaction_info: { transaction_id: "9GS8", transaction_event_code: "T0006", transaction_initiation_date: "2026-05-02T16:20:01+0000", transaction_amount: { currency_code: "USD", value: "150.00" }, fee_amount: { currency_code: "USD", value: "-4.84" }, transaction_status: "S", transaction_subject: "Quarter beef deposit" }, payer_info: { payer_name: { alternate_full_name: "Dana Ruiz" } } });
    expect(rows.map((r) => r.amountCents)).toEqual([15000n, -484n]);
    expect(rows[0]!.counterparty).toBe("Dana Ruiz");
    expect(mapPaypalTxn({ transaction_info: { transaction_id: "W1", transaction_event_code: "T0400", transaction_initiation_date: "2026-05-03T00:00:00+0000", transaction_amount: { currency_code: "USD", value: "-145.16" }, transaction_status: "S" } })).toEqual([]);
    expect(mapPaypalTxn({ transaction_info: { transaction_id: "P1", transaction_event_code: "T0006", transaction_initiation_date: "2026-05-03T00:00:00+0000", transaction_amount: { currency_code: "USD", value: "10.00" }, transaction_status: "P" } })).toEqual([]);
  });
  it("Finicity and MX bank transactions", () => {
    const f = mapFinicityTxn({ id: 805353, amount: -82.15, postedDate: 1772668800, transactionDate: 1772582400, description: "TRACTOR SUPPLY", status: "active", categorization: { normalizedPayeeName: "Tractor Supply", category: "Home Improvement" } });
    expect(f.amountCents).toBe(-8215n);
    expect(f.date).toBe("2026-03-04");
    expect(f.cashDate).toBe("2026-03-05");
    const m = mapMxTxn({ guid: "TRN-1", amount: 61.5, type: "DEBIT", status: "POSTED", date: "2026-03-05", transacted_at: "2026-03-04T12:00:00Z", description: "Co-op Feed", category: "Livestock" });
    expect(m.amountCents).toBe(-6150n);
    expect(m.date).toBe("2026-03-04");
    expect(mapMxTxn({ guid: "TRN-2", amount: 1200, type: "CREDIT", status: "POSTED", date: "2026-03-06", description: "Sale barn" }).amountCents).toBe(120000n);
  });
  it("USDA AMS rows: averages or low/high midpoints", () => {
    const a = mapAmsRow({ report_date: "10/09/2026", commodity: "Corn", class: "Yellow", avg_price: "4.12", price_unit: "$ Per Bushel", location: "Hutchinson" }, "2886")!;
    expect(a.priceCents).toBe(412n);
    expect(a.unit).toBe("bushel");
    expect(a.asOf).toBe("2026-10-09");
    const b = mapAmsRow({ report_date: "2026-10-08", commodity: "Feeder Steers", frame: "Medium and Large 1", weight_break_low: 500, weight_break_high: 600, price_min: "330.00", price_max: "350.00", price_unit: "$ Per Cwt" }, "1281")!;
    expect(b.priceCents).toBe(34000n);
    expect(b.label).toContain("500-600 lb");
    expect(mapAmsRow({ report_date: "2026-10-08", commodity: "Corn" }, "x")).toBeNull();
  });
  it("Futures: grains quote in cents, cattle in $/cwt", () => {
    expect(mapBarchartQuote({ symbol: "ZCZ26", lastPrice: 425.25, tradeTimestamp: "2026-10-14T13:20:00-05:00" })).toMatchObject({ symbol: "ZC-FRONT", priceCents: 425n, unit: "bu", asOf: "2026-10-14" });
    expect(mapBarchartQuote({ symbol: "LEZ26", lastPrice: 231.5 })!.priceCents).toBe(23150n);
    expect(mapBarchartQuote({ symbol: "XXZ26", lastPrice: 1 })).toBeNull();
  });
  it("ERS ARMS ratios become fractions", () => {
    expect(mapArmsRow({ year: 2024, state: "Kansas", variable_name: "Debt-to-asset ratio", estimate: "12.4", median: "8.0" })).toMatchObject({ metric: "debtToAsset", value: 0.124, median: 0.08, region: "Kansas" });
    expect(mapArmsRow({ year: 2024, variable_name: "Current ratio", estimate: 2.1 })!.value).toBe(2.1);
    expect(mapArmsRow({ year: 2024, variable_name: "Net cash farm income", estimate: 1000 })).toBeNull();
  });
});
