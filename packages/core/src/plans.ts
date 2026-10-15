/**
 * Subscription tiers (spec "Subscription model"). Core reports stay on every plan:
 * dashboard, P&L, balance sheet, cash flow, AR/AP, inventory, records, basic
 * enterprise profitability, debt, assets, and the health report. Gates follow the
 * spec's "strongest premium gates": forecasting, scenarios, benchmarking, AI analysis,
 * multi-entity reporting, premium integrations, and advanced planning.
 */
export type Plan = "essentials" | "pro" | "business";
export const PLAN_RANK: Record<Plan, number> = { essentials: 0, pro: 1, business: 2 };
export const PLAN_NAME: Record<Plan, string> = { essentials: "Essentials", pro: "Pro", business: "Business" };

export const FEATURE_PLAN = {
  // Pro: forecasting and planning
  forecast: "pro", scenarios: "pro", insights: "pro", budgets: "pro", planning: "pro", marketing: "pro",
  equipment_roi: "pro", unit_economics: "pro", ai_analysis: "pro", more_integrations: "pro",
  // Business: multiple entities, reporting for others, and access for others
  consolidated: "business", custom_dashboard: "business", benchmarking: "business", lender_reporting: "business",
  tax_exports: "business", api_access: "business", multiple_users: "business", advanced_ai: "business", premium_integrations: "business",
} as const satisfies Record<string, Plan>;
export type Feature = keyof typeof FEATURE_PLAN;

export const asPlan = (p: string | null | undefined): Plan => (p === "essentials" || p === "pro" || p === "business" ? p : "pro");
export const hasFeature = (plan: string | null | undefined, f: Feature) => PLAN_RANK[asPlan(plan)] >= PLAN_RANK[FEATURE_PLAN[f]];

/** Which plan a connector needs: accounting and bank on every plan, more sources on Pro, premium ag and data on Business. */
const INTEGRATION_PLAN: Record<string, Plan> = {
  quickbooks: "essentials", plaid: "essentials", webhook: "essentials", nws: "essentials", cattlemax: "essentials",
  square: "pro", stripe: "pro", xero: "pro", freshbooks: "pro", paypal: "pro", usda_nass: "pro",
};
export const integrationPlan = (key: string): Plan => INTEGRATION_PLAN[key] ?? "business";
export const canUseIntegration = (plan: string | null | undefined, key: string) => PLAN_RANK[asPlan(plan)] >= PLAN_RANK[integrationPlan(key)];

/** Assistant tool tiers by plan: read on every plan, analyze and write on Pro, outside research on Business. */
export const toolAllowed = (plan: string | null | undefined, tier: "read" | "analyze" | "write", tool: string) =>
  tool === "market_research" ? hasFeature(plan, "advanced_ai") : tier === "read" ? true : hasFeature(plan, "ai_analysis");

export const PLAN_SUMMARY: Record<Plan, string[]> = {
  essentials: ["Dashboard and statements", "Receivables and bills", "Inventory, herd, and land records", "Debt, assets, and health report", "QuickBooks and bank connections"],
  pro: ["13-week and 12-month forecasts", "Scenarios and sell-or-hold", "Unit economics and break-evens", "Budgets, planning, and accuracy", "Commodity exposure and contracts", "AI brief and analysis"],
  business: ["Multiple farms and consolidated reports", "Custom dashboards", "Peer benchmarks", "Lender package and tax exports", "Users, accountants, and permissions", "API, MCP, and premium integrations"],
};
