"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { BellPlus, Search } from "lucide-react";
import { trackCatalogOffer } from "@/app/(app)/watchlist/actions";
import { currency } from "@/lib/profit";
import type { CatalogOffer, TrackedProduct } from "@/lib/types";

type SortMode = "name" | "store" | "status" | "price" | "checked";

export function CatalogOfferPicker({ offers, trackedProducts }: { offers: CatalogOffer[]; trackedProducts: TrackedProduct[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [isPending, startTransition] = useTransition();
  const trackedUrls = useMemo(() => new Set(trackedProducts.map((product) => product.url)), [trackedProducts]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return offers
      .filter((offer) => {
        const product = offer.catalog_products;
        const text = [product?.name, product?.tcg, product?.category, product?.set_name, offer.store_name, offer.status].join(" ").toLowerCase();
        return !normalized || text.includes(normalized);
      })
      .sort((a, b) => {
        if (sort === "store") return a.store_name.localeCompare(b.store_name);
        if (sort === "status") return a.status.localeCompare(b.status);
        if (sort === "price") return (b.last_price ?? -1) - (a.last_price ?? -1);
        if (sort === "checked") return new Date(b.last_checked_at ?? 0).getTime() - new Date(a.last_checked_at ?? 0).getTime();
        return (a.catalog_products?.name ?? "").localeCompare(b.catalog_products?.name ?? "");
      });
  }, [offers, query, sort]);

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div>
        <p className="text-sm font-semibold text-teal-200">Catalog</p>
        <h2 className="mt-1 text-2xl font-black text-white">Track without a URL</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Pick a known product offer and PackWatcher will create the tracker with the stored retailer link.</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_140px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search catalog"
            className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 pl-9 pr-3 text-sm outline-none focus:border-teal-300"
          />
        </label>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none">
          <option value="name">Name</option>
          <option value="store">Store</option>
          <option value="status">Status</option>
          <option value="price">Price</option>
          <option value="checked">Checked</option>
        </select>
      </div>
      <div className="mt-4 grid max-h-[520px] gap-3 overflow-auto pr-1">
        {filtered.length ? filtered.map((offer) => {
          const product = offer.catalog_products;
          const alreadyTracked = trackedUrls.has(offer.url);

          return (
            <article key={offer.id} className="grid grid-cols-[72px_1fr] gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3">
              <div className="relative h-20 overflow-hidden rounded-lg bg-slate-900">
                {product?.image_url ? <Image src={product.image_url} alt={product.name} fill sizes="72px" className="object-cover" /> : <div className="grid h-full place-items-center text-xs text-slate-600">No image</div>}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-white">{product?.name ?? "Catalog product"}</h3>
                    <p className="mt-1 text-xs text-slate-400">{offer.store_name} · {product?.set_name ?? product?.tcg ?? "TCG"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] text-slate-300">{offer.status.replaceAll("_", " ")}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-teal-200">{currency(offer.last_price ?? product?.msrp)}</p>
                  <button
                    disabled={alreadyTracked || isPending}
                    onClick={() => startTransition(() => trackCatalogOffer(offer.id))}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-300 px-3 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BellPlus className="h-4 w-4" />
                    {alreadyTracked ? "Tracked" : "Track"}
                  </button>
                </div>
              </div>
            </article>
          );
        }) : <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">No catalog offers found.</p>}
      </div>
    </section>
  );
}
