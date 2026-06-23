"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { BellPlus, ExternalLink, PackageSearch, Search } from "lucide-react";
import { trackCatalogOffer, trackCatalogProduct } from "@/app/(app)/watchlist/actions";
import { currency } from "@/lib/profit";
import type { CatalogOffer, CatalogProduct, StockStatus } from "@/lib/types";

export type CatalogProductGroup = {
  product: CatalogProduct;
  offers: CatalogOffer[];
  trackedOfferUrls: string[];
  isProductTracked: boolean;
};

type CatalogFilter = "all" | "in_stock" | "trackable" | "etb" | "booster_pack" | "booster_box" | "collection_box" | "tin";

function statusLabel(status: StockStatus) {
  if (status === "in_stock") return "In stock";
  if (status === "out_of_stock") return "Out of stock";
  return "Trackable";
}

function groupStatus(group: CatalogProductGroup): StockStatus {
  if (group.offers.some((offer) => offer.status === "in_stock")) return "in_stock";
  if (group.offers.length && group.offers.every((offer) => offer.status === "out_of_stock")) return "out_of_stock";
  return "unknown";
}

function lowestPrice(group: CatalogProductGroup) {
  const prices = group.offers
    .map((offer) => offer.last_price)
    .filter((price): price is number => typeof price === "number");
  if (prices.length) return Math.min(...prices);
  return group.product.msrp;
}

function bestOffer(group: CatalogProductGroup) {
  const sorted = [...group.offers].sort((a, b) => {
    if (a.status === "in_stock" && b.status !== "in_stock") return -1;
    if (b.status === "in_stock" && a.status !== "in_stock") return 1;
    return (a.last_price ?? Number.MAX_SAFE_INTEGER) - (b.last_price ?? Number.MAX_SAFE_INTEGER);
  });
  return sorted[0] ?? null;
}

function matchesProductType(group: CatalogProductGroup, filter: CatalogFilter) {
  const text = [group.product.name, group.product.category, group.product.set_name].join(" ").toLowerCase();
  if (filter === "etb") return text.includes("elite trainer box") || text.includes(" etb");
  if (filter === "booster_pack") return text.includes("booster pack") || text.includes("blister");
  if (filter === "booster_box") return text.includes("booster box");
  if (filter === "collection_box") return text.includes("collection") || text.includes("box");
  if (filter === "tin") return text.includes("tin");
  return true;
}

function featuredScore(group: CatalogProductGroup) {
  const text = [group.product.name, group.product.category, group.product.set_name].join(" ").toLowerCase();
  if (text.includes("elite trainer box") || text.includes(" etb")) return 100;
  if (text.includes("booster box")) return 95;
  if (text.includes("booster bundle")) return 90;
  if (text.includes("ultra-premium") || text.includes("premium collection")) return 85;
  if (text.includes("collection")) return 75;
  if (text.includes("tin")) return 70;
  if (text.includes("booster pack") || text.includes("blister")) return 65;
  return 10;
}

export function CatalogBrowser({ groups, isAdmin }: { groups: CatalogProductGroup[]; isAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(groups[0]?.product.id ?? null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return groups
      .filter((group) => {
        const status = groupStatus(group);
        const searchable = [
          group.product.name,
          group.product.tcg,
          group.product.category,
          group.product.set_name,
          ...group.offers.map((offer) => offer.store_name)
        ].join(" ").toLowerCase();

        const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
        const matchesFilter =
          filter === "all" ||
          (filter === "in_stock" && status === "in_stock") ||
          (filter === "trackable" && group.offers.length > 0) ||
          matchesProductType(group, filter);

        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        const aInStock = groupStatus(a) === "in_stock";
        const bInStock = groupStatus(b) === "in_stock";
        if (aInStock !== bInStock) return aInStock ? -1 : 1;
        return featuredScore(b) - featuredScore(a);
      });
  }, [filter, groups, query]);

  function trackOffer(offerId: string) {
    startTransition(async () => {
      setMessage("");
      try {
        await trackCatalogOffer(offerId);
        setMessage("Tracking enabled. You will get alerts when this offer comes back in stock.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not track this product.");
      }
    });
  }

  function trackProduct(productId: string) {
    startTransition(async () => {
      setMessage("");
      try {
        await trackCatalogProduct(productId);
        setMessage("Tracking enabled. PackWatcher will alert you when any retailer offer comes back in stock.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not track this product.");
      }
    });
  }

  if (!groups.length) {
    return (
      <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-start gap-3">
          <PackageSearch className="mt-1 h-6 w-6 text-teal-300" />
          <div>
            <h2 className="text-xl font-bold text-white">Catalog is being prepared</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Pokemon sealed products will appear here as soon as catalog sync finishes.
            </p>
            {isAdmin ? (
              <Link href="/admin" className="mt-4 inline-flex h-10 items-center rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950">
                Run catalog sync
              </Link>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Check back soon.</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-teal-200">Pokemon catalog</p>
        <h2 className="mt-1 text-2xl font-black text-white">Top Pokemon products to track</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Browse sealed Pokemon products already in the catalog. Search narrows the visible products instead of starting from a blank page.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Pokemon products, sets, or stores"
              className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 pl-9 pr-3 text-sm outline-none focus:border-teal-300"
            />
          </label>
          <select value={filter} onChange={(event) => setFilter(event.target.value as CatalogFilter)} className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none">
            <option value="all">All products</option>
            <option value="in_stock">In stock</option>
            <option value="trackable">Trackable</option>
            <option value="etb">ETBs</option>
            <option value="booster_pack">Booster packs</option>
            <option value="booster_box">Booster boxes</option>
            <option value="collection_box">Collection boxes</option>
            <option value="tin">Tins</option>
          </select>
        </div>
        <p className="mt-3 text-xs text-slate-500">{filteredGroups.length} of {groups.length} catalog products shown</p>
      </div>

      {message ? <p className="rounded-lg border border-teal-300/20 bg-teal-300/10 p-3 text-sm text-teal-100">{message}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredGroups.length ? filteredGroups.map((group) => {
          const status = groupStatus(group);
          const offer = bestOffer(group);
          const isExpanded = expandedId === group.product.id;
          const alreadyTracked = group.isProductTracked || group.offers.some((item) => group.trackedOfferUrls.includes(item.url));

          return (
            <article key={group.product.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
              <div className="relative aspect-[16/10] bg-slate-900">
                {group.product.image_url ? (
                  <Image src={group.product.image_url} alt={group.product.name} fill sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-slate-500">No image yet</div>
                )}
                <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${status === "in_stock" ? "bg-teal-300 text-slate-950" : status === "out_of_stock" ? "bg-red-400/20 text-red-100" : "bg-white/15 text-white"}`}>
                  {statusLabel(status)}
                </span>
              </div>
              <div className="p-4">
                <div className="min-h-20">
                  <Link href={`/catalog/${group.product.id}`} className="line-clamp-2 font-bold text-white hover:text-teal-200">
                    {group.product.title ?? group.product.name}
                  </Link>
                  <p className="mt-2 text-sm text-slate-400">{group.product.category ?? "Sealed Product"}{group.product.set_name ? ` - ${group.product.set_name}` : ""}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Lowest price</p>
                    <p className="font-semibold text-white">{currency(lowestPrice(group))}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Retailers</p>
                    <p className="font-semibold text-white">{group.offers.length}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={alreadyTracked || isPending}
                    onClick={() => trackProduct(group.product.id)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BellPlus className="h-4 w-4" />
                    {alreadyTracked ? "Tracking" : status === "in_stock" ? "Track this" : "Notify me"}
                  </button>
                  <button onClick={() => setExpandedId(isExpanded ? null : group.product.id)} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
                    {isExpanded ? "Hide offers" : "View offers"}
                  </button>
                  <Link href={`/catalog/${group.product.id}`} className="inline-flex h-10 items-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
                    Product page
                  </Link>
                </div>
                {isExpanded ? (
                  <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                    {group.offers.map((item) => {
                      const itemTracked = group.trackedOfferUrls.includes(item.url);
                      return (
                        <div key={item.id} className="rounded-lg bg-slate-950/60 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{item.store_name}</p>
                              <p className="mt-1 text-xs text-slate-400">{statusLabel(item.status)} - {currency(item.last_price)}</p>
                            </div>
                            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-slate-200">
                              <ExternalLink className="h-3 w-3" />
                              Store
                            </a>
                          </div>
                          <button
                            disabled={itemTracked || isPending}
                            onClick={() => trackOffer(item.id)}
                            className="mt-3 h-8 rounded-lg bg-white px-3 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {itemTracked ? "Tracking" : "Notify me"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </article>
          );
        }) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-slate-300">
            No catalog products match those filters.
          </div>
        )}
      </div>
    </section>
  );
}
