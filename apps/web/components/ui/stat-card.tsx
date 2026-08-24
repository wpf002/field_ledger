import clsx from "clsx";

type Variant = "default" | "primary" | "brown" | "mint" | "cream" | "gold";
const surfaces: Record<Variant, string> = {
  default: "bg-surface text-ink",
  primary: "bg-primary text-white",
  brown: "bg-brown text-white",
  mint: "bg-mint text-ink",
  cream: "bg-cream-tint text-ink",
  gold: "bg-[#F6EAC6] text-ink", // soft Wheat Gold tint
};

export function StatCard({
  label, value, sub, icon, variant = "default", fill = false, className,
}: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; variant?: Variant; fill?: boolean; className?: string }) {
  const onFill = variant === "primary" || variant === "brown";
  return (
    <div className={clsx("rounded-card p-5 shadow-card sm:p-6", surfaces[variant], fill && "flex flex-col", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={clsx("uppercase tracking-wider text-xs", onFill ? "text-white/80" : "text-muted")}>{label}</span>
        <span className="shrink-0">{icon}</span>
      </div>
      <div className={clsx(fill && "flex flex-1 flex-col justify-center")}>
        <div className="mt-3 font-serif text-xl font-bold leading-tight tabular-nums sm:text-3xl">{value}</div>
        {sub && <p className={clsx("mt-1 text-sm", onFill ? "text-white/75" : "text-muted")}>{sub}</p>}
      </div>
    </div>
  );
}
