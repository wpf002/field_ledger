"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard, Receipt, DollarSign, Tractor, Wallet, ScrollText,
  PieChart, TrendingUp, Calendar, MessageSquare, UserCircle2,
} from "lucide-react";

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

export function SidebarNav() {
  const path = usePathname();
  return (
    <aside className="w-[280px] shrink-0 border-r border-border bg-bg flex flex-col">
      <div className="px-6 py-6 border-b border-border">
        <h1 className="font-serif text-2xl font-bold text-primary">Field &amp; Ledger</h1>
        <p className="text-muted text-sm mt-0.5">Farm Management</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={clsx(
                "flex items-center gap-3 rounded-btn px-4 py-2.5 text-[15px] transition-colors",
                active ? "bg-primary text-white" : "text-muted hover:bg-tag/60",
              )}>
              <Icon size={20} strokeWidth={1.75} />
              <span className={active ? "font-medium" : ""}>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-border">
        <Link href="/account" className="flex items-center gap-3 rounded-btn px-4 py-2.5 text-muted hover:bg-tag/60">
          <UserCircle2 size={20} strokeWidth={1.75} /> My Account
        </Link>
      </div>
    </aside>
  );
}
