/**
 * Test-dataset scenario levers -> scenario-engine templates. Parameters are the
 * owner's inputs from each question (the % move, the new note's terms, acres to
 * lease); bases such as spend, margins, and repayment capacity come from the books.
 * Levers that rest on assumptions the books can't supply carry them as parameters.
 */
const FERT = ["5020"], FEED = ["5070", "5071", "5072"], LIVESTOCK_SALES = ["4070", "4071", "4072", "4073", "4075"];

export const DATASET_LEVERS: Record<string, { template: string; params: Record<string, unknown> }> = {
  "LEV-BRN-01": { template: "add_units", params: { units: 1.67, marginPerUnit: 3930.43, label: "beef/yr", fixedCost: 1666 } },
  "LEV-BRN-02": { template: "manual", params: { impact: -829.37, basis: "Extra eggs at $6.00 less feed, pullets, flats, and 150 family hours at $15" } },
  "LEV-BRN-03": { template: "crop_profit_per_acre", params: { crop: "Okra", year: 2025 } },
  "LEV-BRN-04": { template: "crop_profit_per_acre", params: { crop: "Tomatoes", year: 2025 } },
  "LEV-BRN-05": { template: "crop_profit_per_acre", params: { crop: "Zucchini", year: 2025 } },
  "LEV-BRN-06": { template: "crop_profit_per_acre", params: { crop: "Yellow squash", year: 2025 } },
  "LEV-BRN-07": { template: "crop_profit_per_acre", params: { crop: "Pumpkins", year: 2025 } },
  "LEV-BRN-08": { template: "crop_profit_per_acre", params: { crop: "Watermelon", year: 2025 } },
  "LEV-BRN-09": { template: "crop_profit_per_acre", params: { crop: "Sweet corn", year: 2025 } },
  "LEV-BRN-10": { template: "manual", params: { impact: 6877.2, basis: "Sell 30% of unsold produce at 90% of price, less helper wages and a second booth" } },
  "LEV-SAM-01": { template: "crop_price_shock", params: { crop: "Cotton (dryland)", year: 2026, quantity: 43680, price: 0.82, pct: -0.15 } },
  "LEV-SAM-02": { template: "replace_vs_keep", params: { assetMatch: "combine", repairsYear: 2025, price: 520000, tradeIn: 210000, ratePct: 7.5, years: 7, newRepairs: 6000 } },
  "LEV-SAM-03": { template: "per_unit_income", params: { enterprise: "CUS", year: 2025, recordType: "Combine separator hours", unitLabel: "separator hours" } },
  "LEV-SAM-04": { template: "cost_shock", params: { accounts: FERT, year: 2025, pct: 0.2, label: "2025 fertilizer" } },
  "LEV-SAM-05": { template: "scenario_delta", params: { scenario: "downside" } },
  "LEV-LAN-01": { template: "scenario_delta", params: { scenario: "downside" } },
  "LEV-LAN-02": { template: "cost_shock", params: { accounts: FERT, year: 2025, pct: 0.2, label: "2025 fertilizer" } },
  "LEV-LAN-03": { template: "lease_vs_produce", params: { crop: "Coastal bermudagrass hay", years: [2024, 2025, 2026], acres: 110, rentPerAcre: 35, savedPerAcre: 3.8 } },
  "LEV-LAN-04": { template: "break_even_price", params: { crop: "Coastal bermudagrass hay", year: 2026 } },
  "LEV-RCK-01": { template: "price_shock", params: { accounts: LIVESTOCK_SALES, year: 2025, pct: -0.15, label: "2025 livestock sales" } },
  "LEV-RCK-02": { template: "enterprise_income", params: { enterprise: "GEN", year: 2025 } },
  "LEV-RCK-03": { template: "manual", params: { impact: 2159, basis: "5 retained heifers × (0.84 calf × $2,400 − $1,150 cow cost) less 7% carrying cost on $6,100 each" } },
  "LEV-RCK-04": { template: "add_units", params: { units: 4, marginSource: "processed_gross_profit", upkeepPerUnit: 3000, label: "more R2T head" } },
  "LEV-RCK-05": { template: "equipment_purchase", params: { price: 150000, down: 0, ratePct: 7.25, years: 5, marginYear: 2025 } },
  "LEV-RCK-06": { template: "repeat_year_cost", params: { accounts: FEED, badYear: 2023, normalYear: 2025, label: "Feed" } },
};
