"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Boxes, CreditCard, LayoutDashboard, ListChecks, ScanLine, Shield, User } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import type { Plan } from "@/lib/types";

const desktopItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/watchlist", label: "Watchlist", icon: ListChecks },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/scanner", label: "Scanner", icon: ScanLine },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/account", label: "Account", icon: User }
];

const mobileItems = desktopItems.filter((item) => ["Dashboard", "Watchlist", "Inventory", "Scanner", "Account"].includes(item.label));

export function AppNav({ plan }: { plan: Plan }) {
  const pathname = usePathname();
  const itemClass = (href: string) =>
    `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${pathname.startsWith(href) ? "bg-amber-300 text-slate-950 shadow-[0_0_22px_rgba(255,208,47,0.2)]" : "text-slate-300 hover:bg-cyan-300/10 hover:text-white"}`;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-amber-300/15 bg-black/80 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <BrandMark size="sm" />
            <span className="hidden font-black tracking-wide text-white sm:block">PackWatcher</span>
          </Link>
          {plan === "admin" ? (
            <Link href="/admin" aria-label="Admin" className={`inline-flex h-10 w-10 items-center justify-center rounded-md md:hidden ${pathname.startsWith("/admin") ? "bg-amber-300 text-slate-950" : "border border-amber-300/15 text-slate-300"}`}>
              <Shield className="h-5 w-5" />
            </Link>
          ) : null}
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
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-amber-300/15 bg-black/90 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl md:hidden">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={`grid justify-items-center gap-1 px-1 py-1 text-[11px] font-semibold ${pathname.startsWith(item.href) ? "text-amber-200" : "text-slate-400"}`}>
            <span className={`grid h-7 w-7 place-items-center rounded-md border ${pathname.startsWith(item.href) ? "border-amber-300/50 bg-amber-300/15 shadow-[0_0_18px_rgba(255,208,47,0.18)]" : "border-transparent"}`}>
              <item.icon className="h-5 w-5" />
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

