"use client";
import { useState } from "react";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { PrimaryButton } from "@/components/ui/button";
import { FileText, Users, Plus } from "lucide-react";

/** Invoices / Customers toggle. Lists are server-rendered and passed as nodes
 *  so integer-cent money never crosses the client boundary. */
export function RevenueTabs({ invoices, customers }: { invoices: React.ReactNode; customers: React.ReactNode }) {
  const [tab, setTab] = useState<"invoices" | "customers">("invoices");
  return (
    <div className="mt-6">
      <SegmentedToggle
        value={tab}
        onChange={setTab}
        options={[
          { value: "invoices", label: "Invoices" },
          { value: "customers", label: "Customers" },
        ]}
      />
      <div className="mt-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-serif text-2xl font-semibold text-ink">
          {tab === "invoices" ? <FileText size={20} /> : <Users size={20} />}
          {tab === "invoices" ? "Invoices" : "Customers"}
        </h3>
        <PrimaryButton><Plus size={16} /> {tab === "invoices" ? "New Invoice" : "New Customer"}</PrimaryButton>
      </div>
      <div className="mt-5">{tab === "invoices" ? invoices : customers}</div>
    </div>
  );
}
