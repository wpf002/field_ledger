"use client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell, Legend } from "recharts";

export type ProjectionDatum = { month: string; income: number; expenses: number; projected: boolean };

const fmt = (n: number) => `$${n >= 1000 ? `${Math.round(n / 1000)}k` : n}`;

/** 90-day cashflow projection. Solid bars are actuals; lighter bars are
 *  projected months (whole dollars, converted from integer cents for charting). */
export function InsightsProjectionChart({ data }: { data: ProjectionDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
        <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: "rgba(52,73,46,0.06)" }}
          formatter={(v: number, name) => [`$${v.toLocaleString()}`, name === "income" ? "Income" : "Expenses"]}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fillOpacity={d.projected ? 0.45 : 1} />)}
        </Bar>
        <Bar dataKey="expenses" name="Expenses" fill="#D8A6A0" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fillOpacity={d.projected ? 0.5 : 1} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
