"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Boxes, CreditCard, LayoutDashboard, ListChecks, Shield, User } from "lucide-react";
import type { Plan } from "@/lib/types";

const desktopItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/watchlist", label: "Watchlist", icon: ListChecks },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/account", label: "Account", icon: User }
];

const mobileItems = desktopItems.filter((item) => ["Dashboard", "Watchlist", "Inventory", "Alerts", "Account"].includes(item.label));

export function AppNav({ plan }: { plan: Plan }) {
  const pathname = usePathname();
  const itemClass = (href: string) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${pathname.startsWith(href) ? "bg-teal-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-300 font-black text-slate-950">PW</span>
            <span className="hidden font-bold sm:block">PackWatcher</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {desktopItems.map((item) => (
              <Link key={item.href} href={item.href} className={itemClass(item.href)}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            {plan === "admin" ? (
              <Link href="/admin" className={itemClass("/admin")}><Shield className="h-4 w-4" />Admin</Link>
            ) : null}
          </nav>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/10 bg-slate-950 md:hidden">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={`grid justify-items-center gap-1 px-1 py-2 text-[11px] ${pathname.startsWith(item.href) ? "text-teal-200" : "text-slate-400"}`}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
