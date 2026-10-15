/**
 * Test-dataset chart of accounts -> Schedule F category codes (@fl/core SCHEDULE_F).
 * "" = no Schedule F line: balance-sheet flows, internal transfers, gains (Form 4797),
 * and accrual inventory/livestock value changes.
 */
export const DATASET_SCHEDULE_F: Record<string, string> = {
  "4010": "crop_sales", "4020": "crop_sales", "4025": "crop_sales", "4030": "crop_sales", "4040": "crop_sales",
  "4050": "livestock_sales_raised", "4060": "livestock_sales_raised", "4065": "livestock_sales_raised",
  "4070": "livestock_sales_raised", "4071": "livestock_sales_raised", "4072": "livestock_sales_raised",
  "4073": "livestock_sales_raised", "4075": "livestock_sales_raised",
  "4080": "other_income", "4090": "custom_hire_income", "4091": "custom_hire_income",
  "4100": "other_income", "4110": "other_income",
  "4200": "crop_insurance_proceeds", "4210": "ag_program_payments",
  "4300": "coop_distributions", "4310": "other_income",
  "5010": "seeds_plants", "5020": "fertilizer", "5030": "chemicals", "5040": "insurance",
  "5050": "custom_hire", "5055": "custom_hire", "5060": "other_expense",
  "5070": "feed", "5071": "feed", "5072": "feed",
  "5080": "veterinary", "5081": "veterinary", "5082": "veterinary",
  "5090": "other_expense", "5100": "other_expense", "5110": "supplies",
  "5120": "veterinary", "5121": "veterinary", "5122": "supplies",
  "5130": "labor_hired", "5131": "labor_hired", "5140": "fuel", "5150": "repairs_maintenance",
  "5160": "utilities", "5170": "other_expense", "5175": "other_expense", "5180": "freight_trucking",
  "5190": "storage_warehousing", "5195": "custom_hire", "5200": "repairs_maintenance", "5210": "utilities",
  "6010": "insurance", "6015": "insurance", "6020": "taxes", "6030": "utilities", "6040": "repairs_maintenance",
  "6050": "car_truck", "6060": "other_expense", "6070": "other_expense", "6080": "other_expense",
  "6090": "other_expense", "6100": "other_expense", "6110": "other_expense", "6130": "supplies",
  "6140": "other_expense", "6150": "other_expense",
  "7010": "depreciation", "7020": "interest_other", "7021": "interest_other", "7022": "interest_other",
};

/** Account kind by statement section. Signed adjustment sections post as INCOME (+ increases income). */
export function kindForSection(section: string): "INCOME" | "EXPENSE" | "BALANCE" {
  if (section === "CASHBS") return "BALANCE";
  if (section === "COP" || section === "OVH" || section === "INT" || section === "DEP") return "EXPENSE";
  return "INCOME";
}

/** Income-statement sign for a positive dataset `amount`. */
export const SIGN: Record<string, 1n | -1n> = { REV: 1n, COP: -1n, OVH: -1n, INT: -1n };
