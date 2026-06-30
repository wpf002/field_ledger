"use client";
import { Download } from "lucide-react";

/** Browser print-to-PDF — the generated invoice PDF. */
export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="no-print inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep">
      <Download size={15} /> Download PDF
    </button>
  );
}
