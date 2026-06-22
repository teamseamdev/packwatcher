import { BellRing, Boxes, Clock, ListChecks, PackageCheck, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { calculateProfit, currency } from "@/lib/profit";
import type { InventoryItem, TrackedProduct } from "@/lib/types";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [{ data: products }, { data: notifications }, { data: inventory }, { data: checks }] = await Promise.all([
    supabase.from("tracked_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<TrackedProduct[]>(),
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("inventory_items").select("*").eq("user_id", user.id).returns<InventoryItem[]>(),
    supabase.from("stock_checks").select("*, tracked_products!inner(user_id)").eq("tracked_products.user_id", user.id).order("checked_at", { ascending: false }).limit(5)
  ]);

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
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-teal-200">Dashboard</p>
        <h1 className="mt-2 text-3xl font-black text-white">Your collection command center</h1>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Watched Products" value={products?.length ?? 0} icon={<ListChecks />} />
        <StatCard title="In-Stock Products" value={products?.filter((item) => item.status === "in_stock").length ?? 0} icon={<PackageCheck />} />
        <StatCard title="Recent Alerts" value={notifications?.length ?? 0} icon={<BellRing />} />
        <StatCard title="Inventory Value" value={currency(collectionValue)} icon={<Boxes />} />
        <StatCard title="Estimated Profit" value={currency(estimatedProfit)} icon={<TrendingUp />} />
        <StatCard title="Last Stock Checks" value={checks?.length ?? 0} detail={checks?.[0]?.checked_at ? new Date(checks[0].checked_at).toLocaleString() : "No checks yet"} icon={<Clock />} />
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
                <p className="mt-1 text-slate-400">{item.raw_match_reason ?? "No match reason"} · {new Date(item.checked_at).toLocaleString()}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No checks have been run.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
