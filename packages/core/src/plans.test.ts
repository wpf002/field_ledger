import { describe, expect, it } from "vitest";
import { hasFeature, canUseIntegration, toolAllowed, asPlan } from "./plans.js";

describe("plans", () => {
  it("core reports on every plan; forecasting on Pro; multi-entity on Business", () => {
    expect(hasFeature("essentials", "forecast")).toBe(false);
    expect(hasFeature("pro", "forecast")).toBe(true);
    expect(hasFeature("pro", "consolidated")).toBe(false);
    expect(hasFeature("business", "consolidated")).toBe(true);
    expect(asPlan("gold")).toBe("pro");
  });
  it("integrations and assistant tools by plan", () => {
    expect(canUseIntegration("essentials", "quickbooks")).toBe(true);
    expect(canUseIntegration("essentials", "square")).toBe(false);
    expect(canUseIntegration("pro", "finicity")).toBe(false);
    expect(toolAllowed("essentials", "read", "cash_position")).toBe(true);
    expect(toolAllowed("essentials", "analyze", "cash_forecast")).toBe(false);
    expect(toolAllowed("pro", "analyze", "market_research")).toBe(false);
  });
});
