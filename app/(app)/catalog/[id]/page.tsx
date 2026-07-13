import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ProductTrackButton } from "@/components/product-track-button";
import { requireProfile } from "@/lib/auth";
import { compareCatalogOffers, metadataText } from "@/lib/catalog/offer-ranking";
import { resolveRetailerUrl } from "@/lib/catalog/retailer-url";
import { optionalCurrency } from "@/lib/profit";
import { aggregatePrices } from "@/lib/retailers/shared/price-aggregation";
import type { CatalogOffer, CatalogProduct } from "@/lib/types";

function offerStatus(offer: CatalogOffer) {
  if (offer.in_stock || offer.status === "in_stock") return "In stock";
  if (offer.status === "out_of_stock") return "Out of stock";
  return offer.availability_text ?? "Trackable";
}

export default async function CatalogProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireProfile();
  const [{ data: productRow }, { data: offerRows }, { data: alert }] = await Promise.all([
    supabase.from("catalog_products").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("catalog_offers")
      .select("*")
      .or(`product_id.eq.${id},catalog_product_id.eq.${id}`)
      .order("in_stock", { ascending: false })
      .order("price", { ascending: true, nullsFirst: false }),
    supabase.from("product_alerts").select("id").eq("user_id", user.id).eq("product_id", id).maybeSingle()
  ]);

  if (!productRow) notFound();

  const product = productRow as CatalogProduct;
  const offers = ((offerRows ?? []) as CatalogOffer[]).sort((a, b) => compareCatalogOffers(a, b));
  const priceSummary = aggregatePrices(offers.map((offer) => ({
    retailerProductId: offer.retailer_product_id ?? offer.id,
    retailer: offer.retailer ?? offer.store_name,
    status: offer.status,
    price: offer.price && offer.price > 0 ? offer.price : offer.last_price,
    sellerName: typeof offer.metadata?.sellerName === "string" ? offer.metadata.sellerName : offer.store_name,
    officialRetailerSeller: typeof offer.metadata?.officialRetailerSeller === "boolean" ? offer.metadata.officialRetailerSeller : true,
    checkedAt: offer.last_checked_at
  })));
  const lastCheckedTimes = offers.flatMap((offer) => offer.last_checked_at ? [new Date(offer.last_checked_at).getTime()] : []);
  const lastUpdated = lastCheckedTimes.length ? new Date(Math.max(...lastCheckedTimes)).toLocaleString() : "not yet";

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-slate-900">
          {product.image_url ? (
            <Image src={product.image_url} alt={product.title ?? product.name} fill sizes="360px" className="object-contain p-4" priority />
          ) : (
            <div className="grid h-full place-items-center text-sm text-slate-500">No product image available</div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-200">{product.brand ?? "Pokemon"} sealed product</p>
          <h1 className="mt-2 text-3xl font-black text-white">{product.title ?? product.name}</h1>
          <p className="mt-3 text-sm text-slate-400">
            {[product.product_type ?? product.category, product.set_name, product.series_name].filter(Boolean).join(" - ")}
          </p>
          <div className="mt-6">
            <ProductTrackButton productId={product.id} initialTracked={Boolean(alert)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-400">Average available price</p>
          <p className="mt-2 text-2xl font-black text-white">{optionalCurrency(priceSummary.averageAvailablePrice)}</p>
          <p className="mt-1 text-xs text-slate-500">Based on {priceSummary.qualifyingListingCount} in-stock listing{priceSummary.qualifyingListingCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-400">Lowest current price</p>
          <p className="mt-2 text-2xl font-black text-white">{optionalCurrency(priceSummary.lowestCurrentPrice)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-400">Retailer listings</p>
          <p className="mt-2 text-2xl font-black text-white">{priceSummary.activeListingCount}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-400">Currently in stock</p>
          <p className="mt-2 text-2xl font-black text-white">{priceSummary.inStockListingCount}</p>
          <p className="mt-1 text-xs text-slate-500">{priceSummary.retailerCount} retailer{priceSummary.retailerCount === 1 ? "" : "s"} carrying it</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-400">Last updated</p>
          <p className="mt-2 text-sm font-semibold text-white">{lastUpdated}</p>
        </div>
      </section>

      <section>
        <div>
          <p className="text-sm font-semibold text-amber-200">Retailer offers</p>
          <h2 className="mt-1 text-2xl font-black text-white">{offers.length} offer{offers.length === 1 ? "" : "s"} found</h2>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {offers.length ? offers.map((offer) => {
            const inStock = offer.in_stock || offer.status === "in_stock";
            return (
              <article key={offer.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-white">{offer.retailer ?? offer.store_name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{offer.title ?? product.title ?? product.name}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${inStock ? "bg-amber-300 text-slate-950" : "bg-white/10 text-slate-300"}`}>
                    {offerStatus(offer)}
                  </span>
                </div>
                <p className="mt-5 text-2xl font-black text-white">{optionalCurrency(offer.price ?? offer.last_price)}</p>
                {metadataText(offer, "shippingText") ? <p className="mt-2 text-sm text-slate-300">Shipping: {metadataText(offer, "shippingText")}</p> : null}
                {metadataText(offer, "pickupText") ? <p className="mt-1 text-sm text-slate-300">Pickup: {metadataText(offer, "pickupText")}</p> : null}
                {offer.availability_text ? <p className="mt-2 text-xs text-slate-500">{offer.availability_text}</p> : null}
                <p className="mt-2 text-xs text-slate-500">
                  Last checked {offer.last_checked_at ? new Date(offer.last_checked_at).toLocaleString() : "not yet"}
                </p>
                <a
                  href={resolveRetailerUrl(offer.url, offer.retailer ?? offer.store_name, offer.title ?? product.title ?? product.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  View at retailer
                </a>
              </article>
            );
          }) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300">
              No retailer offers have been discovered yet. You can still track this product and PackWatcher will notify you as offers are added and become available.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

