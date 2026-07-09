"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Boxes, CreditCard, LayoutDashboard, ListChecks, Scissors, Shield, User } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import type { Plan } from "@/lib/types";

const desktopItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/watchlist", label: "Watchlist", icon: ListChecks },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/clips", label: "Clips", icon: Scissors },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/account", label: "Account", icon: User }
];

const mobileItems = desktopItems.filter((item) => ["Dashboard", "Watchlist", "Inventory", "Clips", "Account"].includes(item.label));

export function AppNav({ plan }: { plan: Plan }) {
  const pathname = usePathname();
  const itemClass = (href: string) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${pathname.startsWith(href) ? "bg-amber-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <BrandMark size="sm" />
            <span className="hidden font-bold sm:block">PackWatcher</span>
          </Link>
          {plan === "admin" ? (
            <Link href="/admin" aria-label="Admin" className={`inline-flex h-10 w-10 items-center justify-center rounded-lg md:hidden ${pathname.startsWith("/admin") ? "bg-amber-300 text-slate-950" : "border border-white/10 text-slate-300"}`}>
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
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/10 bg-slate-950 md:hidden">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href} className={`grid justify-items-center gap-1 px-1 py-2 text-[11px] ${pathname.startsWith(item.href) ? "text-amber-200" : "text-slate-400"}`}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

