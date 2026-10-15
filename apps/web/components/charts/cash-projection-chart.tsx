"use client";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceLine } from "recharts";

export type CashProjectionDatum = { label: string; cash: number; line: number };
const fmt = (n: number) => `$${Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : n}`;

/** Projected ending cash (bars) and operating-line balance (line), whole dollars. */
export function CashProjectionChart({ data, reserve }: { data: CashProjectionDatum[]; reserve: number }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
        <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
        <Tooltip formatter={(v: number, n) => [`$${Math.round(v).toLocaleString()}`, n === "cash" ? "Ending Cash" : "Line Balance"]} contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
        {reserve > 0 && <ReferenceLine y={reserve} stroke="var(--rust)" strokeDasharray="4 4" />}
        <Bar dataKey="cash" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Line dataKey="line" stroke="var(--gold)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
