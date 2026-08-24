/** Progress bar. `tone="gold"` (Wheat Gold) marks aspirational progress —
 *  financial goals — vs the default green used for budgets/debt payoff. */
export function ProgressBar({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "gold" }) {
  return (
    <div className="h-2 w-full rounded-pill bg-surface-sunken overflow-hidden">
      <div className={`h-full rounded-pill ${tone === "gold" ? "bg-gold" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
