/**
 * Which engine topics count as finding each reference insight in the test dataset.
 * Used only to grade the insights engine (verify:testfarms).
 */
export const INSIGHT_TOPICS: Record<string, string[]> = {
  "INS-BRN-01": ["crop_per_acre_spread"], "INS-BRN-02": ["unsold_production"], "INS-BRN-03": ["family_labor_loss"],
  "INS-BRN-04": ["cost_vs_price"], "INS-BRN-05": ["herd_expansion"], "INS-BRN-06": ["owner_funding"],
  "INS-BRN-07": ["low_return_on_assets"], "INS-BRN-08": ["cost_growth"], "INS-BRN-09": ["debt_paydown"], "INS-BRN-10": ["turnaround"],
  "INS-SAM-01": ["best_enterprise"], "INS-SAM-02": ["persistent_loss"], "INS-SAM-03": ["line_capacity"], "INS-SAM-04": ["working_capital_decline"],
  "INS-SAM-05": ["repairs_rising"], "INS-SAM-06": ["ar_overdue"], "INS-SAM-07": ["customer_concentration"], "INS-SAM-08": ["storage_timing"],
  "INS-SAM-09": ["input_sensitivity"], "INS-SAM-10": ["government_dependence"],
  "INS-LAN-01": ["weather"], "INS-LAN-02": ["cost_growth"], "INS-LAN-03": ["unit_rate_growth"], "INS-LAN-04": ["break_even"],
  "INS-LAN-05": ["owner_funding"], "INS-LAN-06": ["customer_concentration"], "INS-LAN-07": ["ar_overdue", "slow_payer"], "INS-LAN-08": ["asset_payback"],
  "INS-LAN-09": ["low_return_on_assets"], "INS-LAN-10": ["repairs_rising"],
  "INS-RCK-01": ["best_enterprise"], "INS-RCK-02": ["sire_risk"], "INS-RCK-03": ["revaluation_share"], "INS-RCK-04": ["bad_year"],
  "INS-RCK-05": ["low_return_on_assets"], "INS-RCK-06": ["value_added"], "INS-RCK-07": ["price_tier"], "INS-RCK-08": ["reproduction"],
  "INS-RCK-09": ["line_seasonal", "line_capacity"], "INS-RCK-10": ["equipment_affordability"],
};
