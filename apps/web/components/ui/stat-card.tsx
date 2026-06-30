import clsx from "clsx";

type Variant = "default" | "primary" | "brown" | "mint" | "cream";
const surfaces: Record<Variant, string> = {
  default: "bg-surface text-ink",
  primary: "bg-primary text-white",
  brown: "bg-brown text-white",
  mint: "bg-mint text-ink",
  cream: "bg-cream-tint text-ink",
};

export function StatCard({
  label, value, sub, icon, variant = "default",
}: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; variant?: Variant }) {
  const onFill = variant === "primary" || variant === "brown";
  return (
    <div className={clsx("rounded-card p-6 shadow-card", surfaces[variant])}>
      <div className="flex items-center justify-between">
        <span className={clsx("uppercase tracking-wider text-xs", onFill ? "text-white/80" : "text-muted")}>{label}</span>
        {icon}
      </div>
      <div className="mt-3 font-serif text-3xl font-bold">{value}</div>
      {sub && <p className={clsx("mt-1 text-sm", onFill ? "text-white/75" : "text-muted")}>{sub}</p>}
    </div>
  );
}
