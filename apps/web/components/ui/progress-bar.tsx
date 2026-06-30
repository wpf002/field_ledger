export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-pill bg-surface-sunken overflow-hidden">
      <div className="h-full rounded-pill bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
