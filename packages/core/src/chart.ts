/**
 * Balance-sheet cash-flow accounts (section CASHBS). They move cash but never
 * touch the income statement. Codes match the test dataset's chart of accounts.
 */
export type BalanceAccount = { code: string; label: string; statementLine: "Financing" | "Investing" | "Owner"; cashFlowClass: string };

export const BALANCE_ACCOUNTS: BalanceAccount[] = [
  { code: "8010", label: "Term loan proceeds", statementLine: "Financing", cashFlowClass: "Loan proceeds" },
  { code: "8011", label: "Term loan principal payments", statementLine: "Financing", cashFlowClass: "Debt payments - principal" },
  { code: "8020", label: "Operating line draws", statementLine: "Financing", cashFlowClass: "Operating line draws" },
  { code: "8021", label: "Operating line repayments", statementLine: "Financing", cashFlowClass: "Operating line repayments" },
  { code: "8030", label: "Capital purchases - equipment, buildings, land", statementLine: "Investing", cashFlowClass: "Equipment & capital purchases" },
  { code: "8031", label: "Asset sale / trade-in proceeds", statementLine: "Investing", cashFlowClass: "Asset sale proceeds" },
  { code: "8040", label: "Owner contributions", statementLine: "Owner", cashFlowClass: "Owner contributions" },
  { code: "8041", label: "Owner distributions / family living", statementLine: "Owner", cashFlowClass: "Owner distributions" },
  { code: "8042", label: "Owner estimated income-tax payments", statementLine: "Owner", cashFlowClass: "Taxes (owner estimated income tax)" },
];

export const PRINCIPAL_ACCOUNT = "8011";
