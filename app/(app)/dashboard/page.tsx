import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, Boxes, Clock, ListChecks, PackageCheck, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { requireProfile } from "@/lib/auth";
import { calculateProfit, currency } from "@/lib/profit";
import type { InventoryItem, TrackedProduct } from "@/lib/types";

function DashboardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="block transition hover:-translate-y-0.5 hover:border-amber-300/30">
      {children}
    </Link>
  );
}

export default async function DashboardPage() {
  const { supabase, user } = await requireProfile();
  const [{ data: products }, { data: notifications }, { data: inventory }, { data: checks }, { count: productAlertCount }] = await Promise.all([
    supabase.from("tracked_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<TrackedProduct[]>(),
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("inventory_items").select("*").eq("user_id", user.id).returns<InventoryItem[]>(),
    supabase.from("stock_checks").select("*, tracked_products!inner(user_id)").eq("tracked_products.user_id", user.id).order("checked_at", { ascending: false }).limit(5),
    supabase.from("product_alerts").select("*", { count: "exact", head: true }).eq("user_id", user.id)
  ]);

  const trackedProducts = products ?? [];
  const owned = inventory ?? [];
  const collectionValue = owned.reduce((sum, item) => sum + item.estimated_sale_price * item.quantity, 0);
  const estimatedProfit = owned.reduce((sum, item) => sum + calculateProfit({
    estimatedSalePrice: item.estimated_sale_price,
    purchasePrice: item.purchase_price,
    fees: item.fees,
    shipping: item.shipping,
    quantity: item.quantity
  }).profit, 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold text-amber-200">Dashboard</p>
        <h1 className="mt-2 text-3xl font-black text-white">Your PackWatcher overview</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Jump into tracked products, alerts, inventory, and recent checks. Catalog browsing now lives in Watchlist.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardLink href="/watchlist#tracked">
          <StatCard title="Watched Products" value={Math.max(trackedProducts.length, productAlertCount ?? 0)} detail="Open tracked items" icon={<ListChecks />} />
        </DashboardLink>
        <DashboardLink href="/watchlist#tracked">
          <StatCard title="In-Stock Products" value={trackedProducts.filter((item) => item.status === "in_stock").length} detail="Review available tracked products" icon={<PackageCheck />} />
        </DashboardLink>
        <DashboardLink href="/alerts">
          <StatCard title="Recent Alerts" value={notifications?.length ?? 0} detail="Open alert history" icon={<BellRing />} />
        </DashboardLink>
        <DashboardLink href="/inventory">
          <StatCard title="Inventory Value" value={currency(collectionValue)} detail="Open inventory" icon={<Boxes />} />
        </DashboardLink>
        <DashboardLink href="/inventory">
          <StatCard title="Estimated Profit" value={currency(estimatedProfit)} detail="Open profit details" icon={<TrendingUp />} />
        </DashboardLink>
        <DashboardLink href="/watchlist#tracked">
          <StatCard title="Last Stock Checks" value={checks?.length ?? 0} detail={checks?.[0]?.checked_at ? new Date(checks[0].checked_at).toLocaleString() : "No checks yet"} icon={<Clock />} />
        </DashboardLink>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Recent alerts</h2>
          <div className="mt-4 space-y-3">
            {notifications?.length ? notifications.map((item) => (
              <div key={item.id} className="rounded-lg bg-white/5 p-3">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-sm text-slate-400">{item.message}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No notification records yet.</p>}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Last stock checks</h2>
          <div className="mt-4 space-y-3">
            {checks?.length ? checks.map((item) => (
              <div key={item.id} className="rounded-lg bg-white/5 p-3 text-sm">
                <p className="font-medium">{item.status}</p>
                <p className="mt-1 text-slate-400">{item.raw_match_reason ?? "No match reason"} - {new Date(item.checked_at).toLocaleString()}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No checks have been run.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

