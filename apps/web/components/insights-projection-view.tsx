"use client";
import { useState } from "react";
import clsx from "clsx";
import { Money } from "@/components/ui/money";
import { InsightsProjectionChart, type ProjectionDatum } from "@/components/charts/insights-projection-chart";

type Summary = { incomeCents: string; expenseCents: string; netCents: string };
export type ProjectionModel = { caption: string; projected: ProjectionDatum[]; summary: Summary };

/**
 * A/B view for the cashflow projection: switch the projected months between the
 * grounded obligation-based spread and the Holt-Winters fit over history. The
 * actual (historical) months are shared; only the projected tail + summary swap.
 */
export function InsightsProjectionView({ history, naive, holtWinters }: { history: ProjectionDatum[]; naive: ProjectionModel; holtWinters: ProjectionModel }) {
  const [key, setKey] = useState<"naive" | "hw">("naive");
  const model = key === "naive" ? naive : holtWinters;
  const data = [...history, ...model.projected];

  return (
    <>
      <div className="mt-4 flex justify-end">
        <div className="inline-flex gap-1 rounded-pill bg-surface-sunken p-1 text-sm">
          {([["naive", "Obligation-based"], ["hw", "Holt-Winters"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKey(k)}
              className={clsx("rounded-pill px-4 py-1.5 transition", key === k ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-center">
        <Stat label="Projected Income" cents={model.summary.incomeCents} className="text-positive" />
        <Stat label="Projected Expenses" cents={model.summary.expenseCents} className="text-negative" />
        <Stat label="Expected Net Position" cents={model.summary.netCents} className="text-ink" />
      </div>

      <div className="mt-6"><InsightsProjectionChart data={data} /></div>
      <p className="mt-3 text-center text-xs text-muted">{model.caption}</p>
    </>
  );
}

function Stat({ label, cents, className }: { label: string; cents: string; className: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className={clsx("mt-1 font-serif text-3xl font-bold", className)}><Money cents={cents} /></p>
    </div>
  );
}
