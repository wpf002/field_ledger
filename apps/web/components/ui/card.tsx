import clsx from "clsx";

/** White rounded surface used for every panel/section (radius-card + card shadow). */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("rounded-card bg-surface shadow-card", className)}>{children}</div>;
}

/** Serif section heading with an optional leading icon and right-side action. */
export function SectionHeading({ icon, title, action, className }: { icon?: React.ReactNode; title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-between", className)}>
      <h3 className="flex items-center gap-2 font-serif text-xl font-semibold text-ink">
        {icon}
        {title}
      </h3>
      {action}
    </div>
  );
}
