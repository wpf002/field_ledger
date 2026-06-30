/**
 * INVARIANT 6: every income/expense category maps to an IRS Schedule F line
 * from the first ledger write. Starter map; extend as the chart of accounts grows.
 */
export type ScheduleFKind = "income" | "expense";

export interface ScheduleFLine {
  code: string;       // internal stable code
  line: string;       // Schedule F line reference
  label: string;
  kind: ScheduleFKind;
}

export const SCHEDULE_F: Record<string, ScheduleFLine> = {
  livestock_sales_raised: { code: "livestock_sales_raised", line: "F-2",  label: "Sales of livestock/produce raised", kind: "income" },
  livestock_sales_bought: { code: "livestock_sales_bought", line: "F-1a", label: "Sales of purchased livestock", kind: "income" },
  crop_sales:             { code: "crop_sales",             line: "F-2",  label: "Sales of crops raised",             kind: "income" },
  coop_distributions:     { code: "coop_distributions",     line: "F-3a", label: "Cooperative distributions",         kind: "income" },
  ag_program_payments:    { code: "ag_program_payments",    line: "F-4a", label: "Agricultural program payments",     kind: "income" },
  custom_hire_income:     { code: "custom_hire_income",     line: "F-7",  label: "Custom hire (machine work) income", kind: "income" },
  other_income:           { code: "other_income",           line: "F-8",  label: "Other income",                      kind: "income" },

  feed:                   { code: "feed",                   line: "F-18", label: "Feed",                              kind: "expense" },
  fertilizer:             { code: "fertilizer",             line: "F-19", label: "Fertilizer and lime",               kind: "expense" },
  fuel:                   { code: "fuel",                   line: "F-20", label: "Gasoline, fuel, and oil",           kind: "expense" },
  veterinary:             { code: "veterinary",             line: "F-31", label: "Veterinary, breeding, medicine",    kind: "expense" },
  seeds_plants:           { code: "seeds_plants",           line: "F-26", label: "Seeds and plants",                  kind: "expense" },
  supplies:               { code: "supplies",               line: "F-27", label: "Supplies",                          kind: "expense" },
  repairs_maintenance:    { code: "repairs_maintenance",    line: "F-25", label: "Repairs and maintenance",           kind: "expense" },
  rent_lease_land:        { code: "rent_lease_land",        line: "F-24b",label: "Rent/lease (land, animals)",        kind: "expense" },
  rent_lease_equipment:   { code: "rent_lease_equipment",   line: "F-24a",label: "Rent/lease (vehicles, machinery)",  kind: "expense" },
  interest_mortgage:      { code: "interest_mortgage",      line: "F-21a",label: "Interest (mortgage)",               kind: "expense" },
  interest_other:         { code: "interest_other",         line: "F-21b",label: "Interest (other)",                  kind: "expense" },
  labor_hired:            { code: "labor_hired",            line: "F-22", label: "Labor hired",                       kind: "expense" },
  insurance:              { code: "insurance",              line: "F-23", label: "Insurance (other than health)",     kind: "expense" },
  depreciation:           { code: "depreciation",           line: "F-14", label: "Depreciation / Section 179",        kind: "expense" },
  other_expense:          { code: "other_expense",          line: "F-32", label: "Other expenses",                    kind: "expense" },
};

export function scheduleFFor(code: string): ScheduleFLine | undefined {
  return SCHEDULE_F[code];
}
