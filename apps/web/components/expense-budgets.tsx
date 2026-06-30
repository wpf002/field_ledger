"use client";
import { useState } from "react";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Card } from "@/components/ui/card";

/** Expense Budgets panel. Phase 0 has no 2026 budgets seeded, so both views
 *  show the empty state exactly like the original. */
export function ExpenseBudgets({ monthly, annual }: { monthly: React.ReactNode; annual: React.ReactNode }) {
  const [tab, setTab] = useState<"monthly" | "annual">("monthly");
  return (
    <div>
      <SegmentedToggle
        value={tab}
        onChange={setTab}
        options={[
          { value: "monthly", label: "Monthly (Current)" },
          { value: "annual", label: "Annual (2026)" },
        ]}
      />
      <Card className="mt-4 p-6">
        {tab === "monthly" ? monthly : annual}
      </Card>
    </div>
  );
}
