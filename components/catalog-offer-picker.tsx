"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BellOff, BellPlus, ExternalLink, Loader2, PackageSearch, Search } from "lucide-react";
import { removeTrackedProduct, trackCatalogProduct, untrackCatalogProduct } from "@/app/(app)/watchlist/actions";
import { LocationPostalCodeField } from "@/components/location-postal-code-field";
import { isLikelyPokemonProduct } from "@/lib/catalog-importers/pokemon-product-filter";
import { isCatalogOfferAvailable } from "@/lib/catalog/offer-availability";
import { compareCatalogOffers, fulfillmentLabel, fulfillmentText, fulfillmentTone, metadataText, verificationLabel, verificationText } from "@/lib/catalog/offer-ranking";
import { resolveRetailerUrl } from "@/lib/catalog/retailer-url";
import { optionalCurrency } from "@/lib/profit";
import type { CatalogOffer, CatalogProduct, TrackedProduct } from "@/lib/types";

type SortMode = "recommended" | "name" | "store" | "status" | "price" | "checked";

function productForOffer(offer: CatalogOffer) {
  const related = offer.catalog_products as CatalogProduct | CatalogProduct[] | null;
  return Array.isArray(related) ? related[0] ?? null : related;
}

export function CatalogOfferPicker({
  offers,
  trackedProducts,
  trackedProductIds = [],
  isAdmin = false,
  defaultPostalCode = ""
}: {
  offers: CatalogOffer[];
  trackedProducts: TrackedProduct[];
  trackedProductIds?: string[];
  isAdmin?: boolean;
  defaultPostalCode?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [postalCode, setPostalCode] = useState(defaultPostalCode ?? "");
  const [sort, setSort] = useState<SortMode>("recommended");
  const [message, setMessage] = useState("");
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const trackedCatalogProducts = useMemo(() => new Set(trackedProductIds), [trackedProductIds]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return offers
      .filter((offer) => {
        const product = productForOffer(offer);
        if (!isLikelyPokemonProduct({
          title: product?.title ?? product?.name ?? offer.title,
          productUrl: offer.url,
          storeName: offer.store_name
        })) {
          return false;
        }
        const text = [product?.name, product?.tcg, product?.category, product?.set_name, offer.store_name, offer.status].join(" ").toLowerCase();
        return !normalized || text.includes(normalized);
      })
      .sort((a, b) => {
        const productA = productForOffer(a);
        const productB = productForOffer(b);
        if (sort === "recommended") return compareCatalogOffers(a, b, postalCode);
        if (sort === "store") return a.store_name.localeCompare(b.store_name);
        if (sort === "status") return a.status.localeCompare(b.status);
        if (sort === "price") return (b.last_price ?? -1) - (a.last_price ?? -1);
        if (sort === "checked") return new Date(b.last_checked_at ?? 0).getTime() - new Date(a.last_checked_at ?? 0).getTime();
        return (productA?.name ?? "").localeCompare(productB?.name ?? "");
      });
  }, [offers, postalCode, query, sort]);

  function track(productId: string) {
    startTransition(async () => {
      setMessage("");
      try {
        await trackCatalogProduct(productId);
        setMessage("Tracking enabled. You will get alerts when any retailer offer comes back in stock.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not track this product.");
      }
    });
  }

  function untrack(productId: string) {
    startTransition(async () => {
      setMessage("");
      try {
        await untrackCatalogProduct(productId);
        setMessage("Tracking removed for this product.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not untrack this product.");
      }
    });
  }

  function untrackUrl(productId: string) {
    startTransition(async () => {
      setMessage("");
      try {
        await removeTrackedProduct(productId);
        setMessage("Tracked retailer URL removed.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not untrack this retailer URL.");
      }
    });
  }

  function discoverRetailers() {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setMessage("Search for at least 3 characters before checking retailer listings.");
      return;
    }

    startTransition(async () => {
      setMessage("");
      try {
        const response = await fetch("/api/catalog/discover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: trimmed, postalCode: postalCode.trim() || undefined })
        });
        const result = await response.json() as { offersImported?: number; error?: string; errors?: string[]; discoveryErrors?: string[] };
        if (!response.ok) throw new Error(result.error ?? "Retailer discovery failed.");

        router.refresh();
        const issueCount = (result.errors?.length ?? 0) + (result.discoveryErrors?.length ?? 0);
        setMessage(
          result.offersImported
            ? `Retailer search saved ${result.offersImported} listing${result.offersImported === 1 ? "" : "s"} for "${trimmed}".${issueCount ? " Some sources could not be checked." : ""}`
            : `Retailer search ran for "${trimmed}", but no new listings were saved.${issueCount ? " Some sources could not be checked." : ""}`
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Retailer discovery failed.");
      }
    });
  }

  return (
    <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="pw-hud text-xs font-black">Discover</p>
          <h2 className="mt-1 text-xl font-black text-white">Search Pokemon products</h2>
        </div>
        <p className="text-xs text-slate-500">{filtered.length} shown</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-[1fr_220px_140px_180px]">
        <label className="relative col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search set, box, pack..."
            className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 pl-9 pr-3 text-sm outline-none focus:border-amber-300"
          />
        </label>
        <LocationPostalCodeField
          value={postalCode}
          onChange={setPostalCode}
          placeholder="ZIP"
          className="col-span-2 lg:col-span-1"
        />
        <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none">
          <option value="recommended">Local first</option>
          <option value="name">Name</option>
          <option value="store">Store</option>
          <option value="status">Status</option>
          <option value="price">Price</option>
          <option value="checked">Checked</option>
        </select>
        <button
          type="button"
          disabled={isPending || query.trim().length < 3}
          onClick={discoverRetailers}
          className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-1"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}
          Search retailers
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">ZIP or Locate me prioritizes nearby in-store pickup results. Change it here for a one-off search, or update the default in Account.</p>
      {message ? <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{message}</p> : null}

      <div className="scroll-panel mt-3 grid max-h-[64vh] gap-2 pr-1">
        {offers.length ? (
          filtered.length ? filtered.map((offer) => {
            const product = productForOffer(offer);
            const trackedUrlProduct = trackedProducts.find((trackedProduct) => trackedProduct.url === offer.url);
            const isUrlTracked = Boolean(trackedUrlProduct);
            const isCatalogTracked = product ? trackedCatalogProducts.has(product.id) : false;

            return (
              <article key={offer.id} className="rounded-lg border border-cyan-300/10 bg-black/45 p-3 transition hover:border-amber-300/35 hover:shadow-[0_0_28px_rgba(255,208,47,0.08)]">
                <button
                  type="button"
                  onClick={() => setExpandedOfferId(expandedOfferId === offer.id ? null : offer.id)}
                  className="grid w-full grid-cols-[72px_1fr] gap-3 text-left"
                >
                <div className="relative h-20 overflow-hidden rounded-lg bg-slate-900">
                  {product?.image_url ? <Image src={product.image_url} alt={product.name} fill sizes="72px" className="object-cover" /> : <div className="grid h-full place-items-center text-xs text-slate-600">No image</div>}
                </div>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-bold text-white">{product?.name ?? "Catalog product"}</h3>
                      <p className="mt-1 text-xs text-slate-400">{offer.store_name} - {product?.set_name ?? product?.tcg ?? "TCG"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${fulfillmentTone(offer)}`}>{fulfillmentLabel(offer)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-amber-200">{optionalCurrency(offer.last_price ?? offer.price ?? product?.msrp)}</p>
                    <span className="text-xs text-slate-500">{expandedOfferId === offer.id ? "Hide details" : "Show details"}</span>
                  </div>
                  {fulfillmentText(offer) ? <p className="mt-2 line-clamp-1 text-xs text-slate-500">{fulfillmentText(offer)}</p> : null}
                  <p className="mt-1 text-[11px] font-semibold text-cyan-200/55">{verificationLabel(offer)}</p>
                </div>
                </button>
                {expandedOfferId === offer.id ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                      <p><span className="text-slate-500">Retailer:</span> {offer.retailer ?? offer.store_name}</p>
                      <p><span className="text-slate-500">Fulfillment:</span> {fulfillmentLabel(offer)}</p>
                      <p><span className="text-slate-500">Raw status:</span> {offer.status.replaceAll("_", " ")}</p>
                      <p><span className="text-slate-500">Source:</span> {verificationLabel(offer)}</p>
                      <p><span className="text-slate-500">Price:</span> {optionalCurrency(offer.last_price ?? offer.price ?? product?.msrp)}</p>
                      <p><span className="text-slate-500">Checked:</span> {offer.last_checked_at ? new Date(offer.last_checked_at).toLocaleString() : "not yet"}</p>
                      {metadataText(offer, "shippingText") ? <p><span className="text-slate-500">Shipping:</span> {metadataText(offer, "shippingText")}</p> : null}
                      {metadataText(offer, "pickupText") ? <p><span className="text-slate-500">Pickup:</span> {metadataText(offer, "pickupText")}</p> : null}
                      {offer.availability_text ? <p className="sm:col-span-2"><span className="text-slate-500">Availability:</span> {offer.availability_text}</p> : null}
                      <p className="sm:col-span-2 text-slate-500">{verificationText(offer)}</p>
                      <p className="sm:col-span-2"><span className="text-slate-500">Product:</span> {product?.title ?? product?.name ?? offer.title ?? "Catalog product"}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isCatalogTracked && product ? (
                        <button
                          disabled={isPending}
                          onClick={() => untrack(product.id)}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <BellOff className="h-4 w-4" />
                          Untrack
                        </button>
                      ) : isUrlTracked && trackedUrlProduct ? (
                        <button
                          disabled={isPending}
                          onClick={() => untrackUrl(trackedUrlProduct.id)}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <BellOff className="h-4 w-4" />
                          Untrack URL
                        </button>
                      ) : (
                        <button
                          disabled={isPending || !product}
                          onClick={() => product ? track(product.id) : undefined}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-300 px-3 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <BellPlus className="h-4 w-4" />
                          {isCatalogOfferAvailable(offer) ? "Track this" : "Notify me"}
                        </button>
                      )}
                      {product ? (
                        <Link href={`/catalog/${product.id}`} className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-white">
                          Product page
                        </Link>
                      ) : null}
                      <a
                        href={resolveRetailerUrl(offer.url, offer.retailer ?? offer.store_name, offer.title ?? product?.title ?? product?.name)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Retailer
                      </a>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          }) : (
            <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">No catalog offers match that search.</p>
          )
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 p-5">
            <div className="flex gap-3">
              <PackageSearch className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="font-semibold text-white">Catalog is empty</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Pokemon products will appear here after catalog sync runs.
                </p>
                {isAdmin ? (
                  <Link href="/admin" className="mt-4 inline-flex h-10 items-center rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">
                    Run catalog sync
                  </Link>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">Catalog is being prepared. Check back soon.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

