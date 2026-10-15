import { describe, expect, it } from "vitest";
import {
  mapPlaidTransaction, mapStripeBalanceTxn, mapSquarePayment, mapQboInvoice, mapQboPurchase, mapXeroInvoice, xeroDate,
  mapFreshbooksInvoice, mapNassPrice, categoryToScheduleF,
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
