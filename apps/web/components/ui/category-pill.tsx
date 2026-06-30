export function CategoryPill({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-pill bg-tag px-3 py-1 text-xs uppercase tracking-wide text-brown">{children}</span>;
}
