export function HeroBand({ title, subtitle, value }: { title: string; subtitle?: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-card bg-primary px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7">
      <div>
        <h3 className="font-serif text-2xl font-semibold">{title}</h3>
        {subtitle && <p className="text-white/75 mt-1 max-w-md">{subtitle}</p>}
      </div>
      <div className="font-serif text-3xl font-bold tabular-nums sm:text-5xl">{value}</div>
    </div>
  );
}
