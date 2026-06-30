export function HeroBand({ title, subtitle, value }: { title: string; subtitle?: string; value: React.ReactNode }) {
  return (
    <div className="rounded-card bg-primary px-8 py-7 text-white flex items-center justify-between">
      <div>
        <h3 className="font-serif text-2xl font-semibold">{title}</h3>
        {subtitle && <p className="text-white/75 mt-1 max-w-md">{subtitle}</p>}
      </div>
      <div className="font-serif text-5xl font-bold">{value}</div>
    </div>
  );
}
