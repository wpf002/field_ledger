import clsx from "clsx";

/** Compact data table inside a card. Scrolls horizontally on narrow screens. */
export function Table({ children, minWidth = 720, className }: { children: React.ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto rounded-card bg-surface p-2 shadow-card sm:p-4", className)}>
      <table className="w-full text-sm" style={{ minWidth }}>{children}</table>
    </div>
  );
}
export function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <th className={clsx("whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted", right ? "text-right" : "text-left", className)}>{children}</th>;
}
export function Td({ children, right, muted, strong, className, title }: { children?: React.ReactNode; right?: boolean; muted?: boolean; strong?: boolean; className?: string; title?: string }) {
  return <td title={title} className={clsx("px-3 py-2.5", right && "whitespace-nowrap text-right tabular-nums", muted ? "text-muted" : "text-ink", strong && "font-semibold", className)}>{children}</td>;
}
/** Dollars with cents for per-unit figures (e.g. $/acre, $/head). */
export const usd = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "–" : `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const num = (n: number | null | undefined, digits = 0) => (n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
export const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "–" : `${(n * 100).toFixed(1)}%`);
