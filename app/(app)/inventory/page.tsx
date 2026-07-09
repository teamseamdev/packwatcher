import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { calculateProfit, currency } from "@/lib/profit";
import type { InventoryItem } from "@/lib/types";
import { addInventoryItem } from "./actions";

export default async function InventoryPage() {
  const { supabase, user } = await requireUser();
  const { data: items } = await supabase.from("inventory_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<InventoryItem[]>();
  const inventory = items ?? [];
  const totals = inventory.reduce((sum, item) => {
    const result = calculateProfit({
      estimatedSalePrice: item.estimated_sale_price,
      purchasePrice: item.purchase_price,
      fees: item.fees,
      shipping: item.shipping,
      quantity: item.quantity
    });
    return {
      value: sum.value + result.sale,
      profit: sum.profit + result.profit,
      cost: sum.cost + result.cost
    };
  }, { value: 0, profit: 0, cost: 0 });
  const roi = totals.cost > 0 ? (totals.profit / totals.cost) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-amber-200">Inventory</p>
        <h1 className="mt-1 text-3xl font-black text-white">Collection tracker</h1>
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total collection value" value={currency(totals.value)} />
        <StatCard title="Estimated profit" value={currency(totals.profit)} />
        <StatCard title="ROI" value={`${roi.toFixed(1)}%`} />
      </section>
      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form action={addInventoryItem} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-xl font-bold text-white">Add owned item</h2>
          <div className="mt-5 space-y-3">
            {[
              ["name", "Product name"],
              ["quantity", "Quantity"],
              ["purchase_price", "Purchase price"],
              ["purchase_date", "Purchase date"],
              ["estimated_sale_price", "Estimated sale price"],
              ["fees", "Fees"],
              ["shipping", "Shipping"]
            ].map(([name, label]) => (
              <input key={name} name={name} placeholder={label} type={name === "purchase_date" ? "date" : "text"} className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-300" />
            ))}
            <textarea name="notes" placeholder="Notes" className="min-h-24 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-amber-300" />
            <button className="h-11 w-full rounded-lg bg-amber-300 font-semibold text-slate-950">Add item</button>
          </div>
        </form>
        <div className="space-y-3">
          {inventory.length ? inventory.map((item) => {
            const result = calculateProfit({
              estimatedSalePrice: item.estimated_sale_price,
              purchasePrice: item.purchase_price,
              fees: item.fees,
              shipping: item.shipping,
              quantity: item.quantity
            });
            return (
              <article key={item.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-white">{item.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">Qty {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-200">{currency(result.profit)}</p>
                    <p className="text-xs text-slate-400">{result.profitPercentage.toFixed(1)}% profit</p>
                  </div>
                </div>
              </article>
            );
          }) : <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-slate-300">No inventory items yet.</div>}
        </div>
      </section>
    </div>
  );
}

