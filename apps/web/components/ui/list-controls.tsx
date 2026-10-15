"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export type FilterOption = { value: string; label: string };
export type FilterDef = { param: string; label: string; options: FilterOption[] };

/** Search box and filter selects above a list. */
export function Toolbar({ search, onSearch, placeholder, filters, values, onFilter, children }: {
  search: string; onSearch: (v: string) => void; placeholder: string;
  filters?: FilterDef[]; values?: Record<string, string>; onFilter?: (param: string, v: string) => void; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
      <label className="flex min-w-[200px] flex-1 items-center gap-3">
        <Search size={18} className="shrink-0 text-muted" />
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>
      {filters?.map((f) => (
        <select key={f.param} aria-label={f.label} value={values?.[f.param] ?? ""} onChange={(e) => onFilter?.(f.param, e.target.value)}
          className="rounded-btn border border-border bg-surface px-3 py-1.5 text-sm text-ink">
          <option value="">{f.label}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {children}
    </div>
  );
}

/** "1–50 of 1,234" with previous/next. */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1, to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-btn border border-border text-ink hover:bg-tag/40 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted">
      <span className="tabular-nums">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous Page"><ChevronLeft size={16} /></button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next Page"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/** Toolbar bound to URL params (q, filters, page), for server-rendered lists. */
export function UrlToolbar({ placeholder, filters }: { placeholder: string; filters?: FilterDef[] }) {
  const { set, params } = useUrlParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => { if ((params.get("q") ?? "") !== q) set({ q, page: "" }); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const values = Object.fromEntries((filters ?? []).map((f) => [f.param, params.get(f.param) ?? ""]));
  return <Toolbar search={q} onSearch={setQ} placeholder={placeholder} filters={filters} values={values} onFilter={(p, v) => set({ [p]: v, page: "" })} />;
}

export function UrlPagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set } = useUrlParams();
  return <Pagination page={page} pageSize={pageSize} total={total} onPage={(p) => set({ page: p > 1 ? String(p) : "" })} />;
}

function useUrlParams() {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const set = (next: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) v ? q.set(k, v) : q.delete(k);
    router.replace(`${path}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  return { set, params };
}
