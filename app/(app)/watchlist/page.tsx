import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CatalogOfferPicker } from "@/components/catalog-offer-picker";
import { WatchlistGrid } from "@/components/watchlist-grid";
import { isAdmin, requireProfile } from "@/lib/auth";
import { ensureCatalogHasRows } from "@/lib/catalog/ensure-catalog";
import { compareCatalogOffers, fulfillmentLabel, fulfillmentText, fulfillmentTone, metadataText, verificationLabel } from "@/lib/catalog/offer-ranking";
import { resolveRetailerUrl } from "@/lib/catalog/retailer-url";
import { optionalCurrency } from "@/lib/profit";
import type { CatalogOffer, TrackedProduct } from "@/lib/types";
import { addProduct, untrackCatalogProduct } from "./actions";

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
    <div className="space-y-4">
      <header className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Watchlist</p>
            <h1 className="mt-1 text-2xl font-black text-white">Find and track sealed Pokemon</h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <a href="#tracked" className="rounded-lg bg-slate-950/70 px-3 py-2 transition hover:bg-slate-900">
              <p className="text-lg font-black text-white">{catalogAlertCount + trackedUrlCount}</p>
              <p className="text-[11px] text-slate-500">Tracked</p>
            </a>
            <a href="#tracked" className="rounded-lg bg-slate-950/70 px-3 py-2 transition hover:bg-slate-900">
              <p className="text-lg font-black text-white">{inStockTrackedCount}</p>
              <p className="text-[11px] text-slate-500">In stock</p>
            </a>
            <a href="#add-url" className="rounded-lg bg-slate-950/70 px-3 py-2 transition hover:bg-slate-900">
              <p className="text-lg font-black text-white">{trackedUrlCount}</p>
              <p className="text-[11px] text-slate-500">URLs</p>
            </a>
          </div>
        </div>
      </header>

      <div id="catalog">
        <CatalogOfferPicker
          offers={catalogOffers}
          trackedProducts={trackedProducts}
          trackedProductIds={(productAlerts ?? []).map((alert) => alert.product_id)}
          isAdmin={isAdmin(profile)}
          defaultPostalCode={profile?.postal_code}
        />
      </div>

      <section id="tracked" className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <details open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">Tracked products</h2>
              <p className="text-sm text-slate-400">{catalogAlertCount + trackedUrlCount} item{catalogAlertCount + trackedUrlCount === 1 ? "" : "s"} being watched</p>
            </div>
            <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-slate-950">Manage</span>
          </summary>

          <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
            <div>
              <h3 className="text-sm font-semibold text-amber-200">Catalog alerts</h3>
              <div className="mt-3 max-h-[520px] space-y-3 overflow-auto pr-1">
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
                  .sort((a, b) => compareCatalogOffers(a, b));
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
                                <p className="mt-1 text-xs text-slate-400">{fulfillmentLabel(offer)} - {optionalCurrency(offer.last_price ?? offer.price)}</p>
                                {metadataText(offer, "shippingText") ? <p className="mt-1 text-[11px] text-slate-500">Shipping: {metadataText(offer, "shippingText")}</p> : null}
                                {metadataText(offer, "pickupText") ? <p className="mt-1 text-[11px] text-slate-500">Pickup: {metadataText(offer, "pickupText")}</p> : null}
                                {fulfillmentText(offer) ? <p className="mt-1 text-[11px] text-slate-500">{fulfillmentText(offer)}</p> : null}
                                <p className="mt-1 text-[11px] text-slate-500">{verificationLabel(offer)}</p>
                                <p className="mt-1 text-[11px] text-slate-500">Checked {offer.last_checked_at ? new Date(offer.last_checked_at).toLocaleString() : "not yet"}</p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${fulfillmentTone(offer)}`}>
                                {fulfillmentLabel(offer)}
                              </span>
                              <a
                                href={resolveRetailerUrl(offer.url, offer.retailer ?? offer.store_name, offer.title ?? related.title ?? related.name)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-slate-200"
                              >
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
            </div>

            <div>
              <h3 className="text-sm font-semibold text-amber-200">Tracked URLs</h3>
              <div className="mt-3">
                <WatchlistGrid products={trackedProducts} />
              </div>
            </div>
          </div>
        </details>
      </section>

      <section id="add-url" className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">Add a retailer URL</h2>
              <p className="text-sm text-slate-400">Use this only when search cannot find the product.</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200">Manual</span>
          </summary>

          <form action={addProduct} className="mt-4 space-y-3">
            <input name="url" placeholder="Product URL" className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <details className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-200">Optional details</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ["name", "Product name"],
                  ["store_name", "Store name"],
                  ["category", "Category"],
                  ["set_name", "Set name"],
                  ["image_url", "Image URL"],
                  ["msrp", "MSRP"],
                  ["target_price", "Target price"]
                ].map(([name, label]) => (
                  <input key={name} name={name} placeholder={label} className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-300" />
                ))}
              </div>
              <textarea name="notes" placeholder="Notes" className="mt-3 min-h-20 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-amber-300" />
            </details>
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input name="alerts_enabled" value="true" type="checkbox" defaultChecked className="h-4 w-4" />
              Alerts enabled
            </label>
            <button className="h-11 w-full rounded-lg bg-amber-300 font-semibold text-slate-950">Add to watchlist</button>
          </form>
        </details>
      </section>
    </div>
  );
}

