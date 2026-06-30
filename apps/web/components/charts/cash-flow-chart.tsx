"use client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export type CashFlowDatum = { month: string; income: number; expenses: number };

const fmt = (n: number) => `$${n >= 1000 ? `${Math.round(n / 1000)}k` : n}`;

/** Monthly income vs expenses for the current year. Values are whole dollars
 *  (converted from integer cents at the display edge for charting only). */
export function CashFlowChart({ data }: { data: CashFlowDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
        <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: "rgba(52,73,46,0.06)" }}
          formatter={(v: number, name) => [`$${v.toLocaleString()}`, name === "income" ? "Income" : "Expenses"]}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Bar dataKey="income" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="expenses" fill="var(--text-muted)" radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.45} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
