import { Card } from "@/components/ui/card";

/** Friendly placeholder shown when a list/section has no data yet. */
export function EmptyState({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tag text-muted">{icon}</span>
      <h3 className="mt-4 font-serif text-xl font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
