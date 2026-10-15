import Link from "next/link";
import clsx from "clsx";

/** Server-rendered segmented control: each option is a link that sets a query param. */
export function LinkTabs({ options, value }: { options: { value: string; label: string; href: string }[]; value: string }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-pill bg-surface-sunken p-1">
      {options.map((o) => (
        <Link key={o.value} href={o.href} scroll={false}
          className={clsx("rounded-pill px-4 py-1.5 text-sm transition", value === o.value ? "bg-surface shadow-card text-ink" : "text-muted hover:text-ink")}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
