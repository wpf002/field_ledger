"use client";
import { useState } from "react";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";

export type PlanLite = { id: string; title: string; kind: string; startAt: string; endAt: string | null };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function PlanningView({ plans }: { plans: PlanLite[] }) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const plansOn = (day: number) =>
    plans.filter((p) => sameDay(new Date(p.startAt), new Date(year, month, day)));

  return (
    <>
      <div className="mb-6">
        <SegmentedToggle
          value={view}
          onChange={setView}
          options={[
            { value: "calendar", label: "Calendar View" },
            { value: "list", label: "List View" },
          ]}
        />
      </div>

      {view === "calendar" ? (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="rounded-btn border border-border p-2 text-muted hover:bg-tag/40"><ChevronLeft size={16} /></button>
            <div className="flex items-center gap-4">
              <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="rounded-btn border border-border px-4 py-1.5 text-sm text-ink hover:bg-tag/40">Today</button>
              <h3 className="font-serif text-xl font-semibold text-ink">{MONTHS[month]} {year}</h3>
            </div>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="rounded-btn border border-border p-2 text-muted hover:bg-tag/40"><ChevronRight size={16} /></button>
          </div>

          <div className="grid grid-cols-7 border-l border-t border-border">
            {DOW.map((d) => (
              <div key={d} className="border-b border-r border-border px-3 py-2 text-center text-xs text-muted">{d}</div>
            ))}
            {cells.map((day, i) => {
              const isToday = day != null && sameDay(new Date(year, month, day), today);
              return (
                <div key={i} className={`min-h-[88px] border-b border-r border-border p-2 ${isToday ? "bg-mint ring-1 ring-inset ring-primary/40" : ""}`}>
                  {day && <span className="text-sm text-ink">{day}</span>}
                  <div className="mt-1 space-y-1">
                    {day && plansOn(day).map((p) => (
                      <div key={p.id} className="truncate rounded bg-primary px-1.5 py-0.5 text-[11px] text-white">{p.title}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          {plans.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CalendarDays size={28} className="text-muted" />
              <p className="text-sm text-muted">No production plans yet. Create one to see it here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {plans.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <List size={16} className="text-muted" />
                  <div>
                    <p className="font-medium text-ink">{p.title}</p>
                    <p className="text-xs text-muted capitalize">{p.kind} · {new Date(p.startAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
