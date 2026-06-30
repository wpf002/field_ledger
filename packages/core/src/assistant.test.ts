import { describe, it, expect } from "vitest";
import { parseQuickLog, classifyChat, type QuickLogDraft } from "./assistant.js";

const today = "2026-06-30";

describe("quick log parser", () => {
  it("parses an income entry with category inference", () => {
    const d = parseQuickLog("sold 5 head of cattle at auction for $6,730.65", today) as QuickLogDraft;
    expect(d.kind).toBe("INCOME");
    expect(d.amountCents).toBe("673065");
    expect(d.accountCode).toBe("livestock_sales_raised");
    expect(d.date).toBe(today);
  });
  it("parses an expense entry as negative", () => {
    const d = parseQuickLog("bought diesel for the tractors, $450", today) as QuickLogDraft;
    expect(d.kind).toBe("EXPENSE");
    expect(d.amountCents).toBe("-45000");
    expect(d.accountCode).toBe("fuel");
  });
  it("errors when no amount is present", () => {
    expect(parseQuickLog("sold some cattle", today)).toHaveProperty("error");
  });
});

describe("chat intent classifier", () => {
  it("routes questions to the right ledger tool", () => {
    expect(classifyChat("What's my cash position?")).toBe("summary");
    expect(classifyChat("how am I doing financially")).toBe("summary");
    expect(classifyChat("show my recent transactions")).toBe("transactions");
    expect(classifyChat("what payments do I owe soon?")).toBe("obligations");
    expect(classifyChat("what inventory is ready for market?")).toBe("inventory");
    expect(classifyChat("am I over budget on feed?")).toBe("budgets");
    expect(classifyChat("what's my Schedule F profit for the year")).toBe("schedule_f");
    expect(classifyChat("any overdue invoices or expired leases?")).toBe("alerts");
  });
});
