import { CatalogOfferPicker } from "@/components/catalog-offer-picker";
import { WatchlistGrid } from "@/components/watchlist-grid";
import { requireUser } from "@/lib/auth";
import type { CatalogOffer, TrackedProduct } from "@/lib/types";
import { addProduct } from "./actions";

export default async function WatchlistPage() {
  const { supabase, user } = await requireUser();
  const [{ data: products }, { data: offers }] = await Promise.all([
    supabase.from("tracked_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<TrackedProduct[]>(),
    supabase.from("catalog_offers").select("*, catalog_products(*)").order("created_at", { ascending: false }).limit(100)
  ]);
  const trackedProducts = products ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-6">
        <CatalogOfferPicker offers={(offers ?? []) as CatalogOffer[]} trackedProducts={trackedProducts} />
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h1 className="text-2xl font-black text-white">Add by URL</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Use this when the catalog does not have the product yet. PackWatcher will pull safe public metadata when available.</p>
          <form action={addProduct} className="mt-5 space-y-3">
            {[
              ["url", "Product URL"],
              ["name", "Product name optional"],
              ["store_name", "Store name optional"],
              ["category", "Category"],
              ["set_name", "Set name"],
              ["image_url", "Product image URL optional"],
              ["msrp", "MSRP"],
              ["target_price", "Target price"]
            ].map(([name, label]) => (
              <input key={name} name={name} placeholder={label} className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-teal-300" />
            ))}
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input name="alerts_enabled" value="true" type="checkbox" defaultChecked className="h-4 w-4" />
              Alerts enabled
            </label>
            <textarea name="notes" placeholder="Notes" className="min-h-24 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-teal-300" />
            <button className="h-11 w-full rounded-lg bg-teal-300 font-semibold text-slate-950">Add to watchlist</button>
          </form>
        </section>
      </div>
      <section>
        <div className="mb-4">
          <p className="text-sm font-semibold text-teal-200">Watchlist</p>
          <h2 className="mt-1 text-3xl font-black text-white">Tracked products</h2>
        </div>
        <WatchlistGrid products={trackedProducts} />
      </section>
    </div>
  );
}
