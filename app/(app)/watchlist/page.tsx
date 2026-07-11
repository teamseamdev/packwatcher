import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CatalogOfferPicker } from "@/components/catalog-offer-picker";
import { WatchlistGrid } from "@/components/watchlist-grid";
import { isAdmin, requireProfile } from "@/lib/auth";
import { ensureCatalogHasRows } from "@/lib/catalog/ensure-catalog";
import { optionalCurrency } from "@/lib/profit";
import type { CatalogOffer, TrackedProduct } from "@/lib/types";
import { addProduct, untrackCatalogProduct } from "./actions";

function metadataText(offer: CatalogOffer, key: string) {
  const value = offer.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function WatchlistPage() {
  const { supabase, user, profile } = await requireProfile();
  await ensureCatalogHasRows(supabase);
  const [{ data: products }, { data: offers }, { data: productAlerts }] = await Promise.all([
    supabase.from("tracked_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<TrackedProduct[]>(),
    supabase.from("catalog_offers").select("*, catalog_products!catalog_offers_catalog_product_id_fkey(*)").order("created_at", { ascending: false }).limit(1000),
    supabase
      .from("product_alerts")
      .select("id,product_id,notify_push,catalog_products(id,name,title,set_name,product_type)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
  ]);
  const trackedProducts = products ?? [];
  const catalogAlertCount = productAlerts?.length ?? 0;
  const trackedUrlCount = trackedProducts.length;
  const inStockTrackedCount = trackedProducts.filter((product) => product.status === "in_stock").length;
  const catalogOffers = (offers ?? []) as CatalogOffer[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-amber-200">Watchlist</p>
        <h1 className="mt-1 text-3xl font-black text-white">Tracked products and catalog</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Browse the catalog, search retailer listings, and manage the products you are tracking for restock alerts.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <a href="#tracked" className="rounded-lg border border-white/10 bg-white/[0.04] p-4 transition hover:border-amber-300/30">
          <p className="text-sm text-slate-400">Tracked items</p>
          <p className="mt-2 text-3xl font-black text-white">{catalogAlertCount + trackedUrlCount}</p>
        </a>
        <a href="#tracked" className="rounded-lg border border-white/10 bg-white/[0.04] p-4 transition hover:border-amber-300/30">
          <p className="text-sm text-slate-400">Tracked URLs</p>
          <p className="mt-2 text-3xl font-black text-white">{trackedUrlCount}</p>
        </a>
        <a href="#catalog" className="rounded-lg border border-white/10 bg-white/[0.04] p-4 transition hover:border-amber-300/30">
          <p className="text-sm text-slate-400">In stock tracked</p>
          <p className="mt-2 text-3xl font-black text-white">{inStockTrackedCount}</p>
        </a>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-black text-white">Tracked catalog alerts</h2>
            <p className="mt-2 text-sm text-slate-400">{catalogAlertCount} canonical product{catalogAlertCount === 1 ? "" : "s"} tracked.</p>
            <div className="mt-4 max-h-96 space-y-3 overflow-auto pr-1">
              {productAlerts?.length ? productAlerts.map((alert) => {
                const related = alert.catalog_products as unknown as {
                  id: string;
                  name: string;
                  title: string | null;
                  set_name: string | null;
                  product_type: string | null;
                } | null;
                if (!related) return null;
                const relatedOffers = catalogOffers
                  .filter((offer) => (offer.product_id ?? offer.catalog_product_id) === related.id)
                  .sort((a, b) => {
                    if (a.status === "in_stock" && b.status !== "in_stock") return -1;
                    if (b.status === "in_stock" && a.status !== "in_stock") return 1;
                    return (a.last_price ?? Number.MAX_SAFE_INTEGER) - (b.last_price ?? Number.MAX_SAFE_INTEGER);
                  });
                return (
                  <details key={alert.id} className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{related.title ?? related.name}</p>
                          <p className="mt-1 text-sm text-slate-300">
                            {[related.product_type, related.set_name].filter(Boolean).join(" - ") || "Pokemon sealed product"} - Push alerts {alert.notify_push ? "on" : "off"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-950/70 px-2 py-1 text-[11px] text-amber-100">{relatedOffers.length} retailers</span>
                      </div>
                    </summary>
                    <div className="mt-4 space-y-3 border-t border-amber-300/20 pt-4">
                      <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                        <p><span className="text-slate-500">Type:</span> {related.product_type ?? "Sealed product"}</p>
                        <p><span className="text-slate-500">Set:</span> {related.set_name ?? "Unknown"}</p>
                      </div>
                      <Link href={`/catalog/${related.id}`} className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-white">
                        Product page
                      </Link>
                      <form action={untrackCatalogProduct.bind(null, related.id)} className="inline-block">
                        <button className="ml-2 inline-flex h-9 items-center rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100 hover:bg-red-400/10">
                          Untrack
                        </button>
                      </form>
                      <div className="space-y-2">
                        {relatedOffers.length ? relatedOffers.map((offer) => (
                          <div key={offer.id} className="rounded-lg bg-slate-950/70 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">{offer.retailer ?? offer.store_name}</p>
                                <p className="mt-1 text-xs text-slate-400">{offer.status.replaceAll("_", " ")} - {optionalCurrency(offer.last_price ?? offer.price)}</p>
                                {metadataText(offer, "shippingText") ? <p className="mt-1 text-[11px] text-slate-500">Shipping: {metadataText(offer, "shippingText")}</p> : null}
                                {metadataText(offer, "pickupText") ? <p className="mt-1 text-[11px] text-slate-500">Pickup: {metadataText(offer, "pickupText")}</p> : null}
                                {offer.availability_text ? <p className="mt-1 text-[11px] text-slate-500">{offer.availability_text}</p> : null}
                                <p className="mt-1 text-[11px] text-slate-500">Checked {offer.last_checked_at ? new Date(offer.last_checked_at).toLocaleString() : "not yet"}</p>
                              </div>
                              <a href={offer.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-slate-200">
                                <ExternalLink className="h-3 w-3" />
                                Store
                              </a>
                            </div>
                          </div>
                        )) : (
                          <p className="rounded-lg bg-slate-950/70 p-3 text-sm text-slate-400">No retailer offers discovered yet.</p>
                        )}
                      </div>
                    </div>
                  </details>
                );
              }) : (
                <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
                  No catalog products tracked yet. Choose a product from the catalog to start alerts.
                </p>
              )}
            </div>
          </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-2xl font-black text-white">Add by URL</h2>
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
              <input key={name} name={name} placeholder={label} className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-300" />
            ))}
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input name="alerts_enabled" value="true" type="checkbox" defaultChecked className="h-4 w-4" />
              Alerts enabled
            </label>
            <textarea name="notes" placeholder="Notes" className="min-h-24 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-amber-300" />
            <button className="h-11 w-full rounded-lg bg-amber-300 font-semibold text-slate-950">Add to watchlist</button>
          </form>
        </section>
        </div>

        <div id="catalog">
          <CatalogOfferPicker
            offers={catalogOffers}
            trackedProducts={trackedProducts}
            trackedProductIds={(productAlerts ?? []).map((alert) => alert.product_id)}
            isAdmin={isAdmin(profile)}
          />
        </div>
      </div>

      <section id="tracked" className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-amber-200">Tracked URLs</p>
          <h2 className="mt-1 text-2xl font-black text-white">Products added by URL</h2>
        </div>
        <WatchlistGrid products={trackedProducts} />
      </section>
    </div>
  );
}

