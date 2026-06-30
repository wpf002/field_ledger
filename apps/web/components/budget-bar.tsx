import clsx from "clsx";
import { Money } from "@/components/ui/money";
import type { BudgetStatus } from "@fl/core";

/** One budget-vs-actual row: category, budget figure, fill bar, % used, spent. */
export function BudgetBar({ status }: { status: BudgetStatus }) {
  const { label, period, amountCents, actualCents, pct, over } = status;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-muted">{period === "MONTHLY" ? "Monthly" : "Annual"} Budget: <Money cents={amountCents} /></span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-surface-sunken">
        <div className={clsx("h-full rounded-pill", over ? "bg-negative" : "bg-primary")} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className={over ? "font-medium text-negative" : "text-muted"}>{pct}% used{over ? " · over budget" : ""}</span>
        <span className="text-muted">Spent <Money cents={actualCents} /></span>
      </div>
    </div>
  );
}
