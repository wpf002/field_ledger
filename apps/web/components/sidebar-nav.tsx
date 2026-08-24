"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard, Receipt, DollarSign, Tractor, Wallet, ScrollText,
  PieChart, TrendingUp, Calendar, MessageSquare, UserCircle2, LogOut, Check, ChevronsUpDown, Eye, Menu, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AlertsBell } from "@/components/alerts-bell";
import { BrandMark } from "@/components/ui/brand-mark";
import { logout, switchFarm } from "@/app/login/actions";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/revenue", label: "Revenue", icon: DollarSign },
  { href: "/inventory", label: "Inventory", icon: Tractor },
  { href: "/liabilities", label: "Liabilities", icon: Wallet },
  { href: "/leases", label: "Leases", icon: ScrollText },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/insights", label: "Insights", icon: TrendingUp },
  { href: "/planning", label: "Planning", icon: Calendar },
  { href: "/assistant", label: "AI Assistant", icon: MessageSquare },
];

type Farm = { id: string; name: string };

export function SidebarNav({ user, role, farms, currentFarmId }: { user: { name: string; email: string }; role: string; farms: Farm[]; currentFarmId: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = farms.find((f) => f.id === currentFarmId);
  const viewer = role === "VIEWER";

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [path]);

  async function pick(id: string) {
    setOpen(false);
    if (id === currentFarmId) return;
    await switchFarm(id);
    router.refresh();
  }

  return (
    <>
    {/* Mobile top bar — hidden on lg+ where the sidebar is always visible. */}
    <header className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg px-4">
      <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-ink"><Menu size={22} /></button>
      <span className="flex items-center gap-2"><BrandMark size={22} /><h1 className="font-serif text-xl font-bold text-primary">Acreflow</h1></span>
      <AlertsBell />
    </header>

    {/* Backdrop behind the drawer on mobile. */}
    {mobileOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMobileOpen(false)} />}

    <aside className={clsx(
      "w-[280px] shrink-0 border-r border-border bg-bg flex flex-col",
      "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:z-auto lg:translate-x-0",
      mobileOpen ? "translate-x-0" : "-translate-x-full",
    )}>
      <div className="flex items-start justify-between px-6 py-6 border-b border-border">
        <div>
          <span className="flex items-center gap-2"><BrandMark size={26} /><h1 className="font-serif text-2xl font-bold text-primary">Acreflow</h1></span>
          {/* Farm switcher */}
          <div className="relative mt-1">
            <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
              {current?.name ?? "Farm"} {farms.length > 1 && <ChevronsUpDown size={13} />}
            </button>
            {open && farms.length > 1 && (
              <div className="absolute z-20 mt-1 w-56 rounded-btn border border-border bg-surface p-1 shadow-card">
                {farms.map((f) => (
                  <button key={f.id} onClick={() => pick(f.id)} className="flex w-full items-center justify-between rounded-btn px-3 py-2 text-left text-sm text-ink hover:bg-tag/40">
                    {f.name} {f.id === currentFarmId && <Check size={14} className="text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden lg:block"><AlertsBell /></span>
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="lg:hidden text-muted hover:text-ink"><X size={20} /></button>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={clsx("flex items-center gap-3 rounded-btn px-4 py-2.5 text-[15px] transition-colors", active ? "bg-primary text-white" : "text-muted hover:bg-tag/60")}>
              <Icon size={20} strokeWidth={1.75} />
              <span className={active ? "font-medium" : ""}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        {viewer && <p className="mb-2 flex items-center gap-1.5 px-4 text-xs text-rust"><Eye size={13} /> Read-only access</p>}
        <div className="flex items-center gap-3 rounded-btn px-4 py-2">
          <UserCircle2 size={20} strokeWidth={1.75} className="text-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="text-xs capitalize text-muted">{role.toLowerCase()}</p>
          </div>
          <button onClick={() => logout()} title="Sign out" className="text-muted hover:text-ink"><LogOut size={17} /></button>
        </div>
      </div>
    </aside>
    </>
  );
}
