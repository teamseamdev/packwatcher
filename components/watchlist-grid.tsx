"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { Bell, BellOff, ExternalLink } from "lucide-react";
import { checkOwnProduct, toggleProductAlerts } from "@/app/(app)/watchlist/actions";
import { currency } from "@/lib/profit";
import type { StockStatus, TrackedProduct } from "@/lib/types";

type StatusFilter = "all" | StockStatus;
type AlertFilter = "all" | "enabled" | "disabled";
type SortMode = "newest" | "name" | "status" | "price" | "checked";

export function WatchlistGrid({ products }: { products: TrackedProduct[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [alerts, setAlerts] = useState<AlertFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sorted = products
      .filter((product) => {
        const text = [product.name, product.store_name, product.category, product.set_name].join(" ").toLowerCase();
        const matchesQuery = !normalizedQuery || text.includes(normalizedQuery);
        const matchesStatus = status === "all" || product.status === status;
        const matchesAlerts =
          alerts === "all" ||
          (alerts === "enabled" && product.alerts_enabled) ||
          (alerts === "disabled" && !product.alerts_enabled);
        return matchesQuery && matchesStatus && matchesAlerts;
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "status") return a.status.localeCompare(b.status);
        if (sort === "price") return (b.last_price ?? -1) - (a.last_price ?? -1);
        if (sort === "checked") return new Date(b.last_checked_at ?? 0).getTime() - new Date(a.last_checked_at ?? 0).getTime();
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    return sorted;
  }, [alerts, products, query, sort, status]);

  if (!products.length) {
    return <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-slate-300">No products yet. Paste a product URL to start tracking.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_150px_150px_150px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, stores, sets"
            className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-teal-300"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none">
            <option value="all">All status</option>
            <option value="in_stock">In stock</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="unknown">Unknown</option>
          </select>
          <select value={alerts} onChange={(event) => setAlerts(event.target.value as AlertFilter)} className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none">
            <option value="all">All alerts</option>
            <option value="enabled">Alerts on</option>
            <option value="disabled">Alerts off</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none">
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="price">Price</option>
            <option value="checked">Last checked</option>
          </select>
        </div>
        <p className="mt-3 text-xs text-slate-500">{filtered.length} of {products.length} tracked products shown</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.length ? filtered.map((product) => (
          <article key={product.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
            <div className="relative aspect-[16/10] bg-slate-900">
              {product.image_url ? <Image src={product.image_url} alt={product.name} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /> : <div className="grid h-full place-items-center text-slate-500">No image</div>}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">{product.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{product.store_name}</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">{product.status.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500">Last price</p><p>{currency(product.last_price)}</p></div>
                <div><p className="text-slate-500">Last checked</p><p>{product.last_checked_at ? new Date(product.last_checked_at).toLocaleDateString() : "Never"}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={checkOwnProduct.bind(null, product.id)}>
                  <button className="h-10 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950">Check now</button>
                </form>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm disabled:opacity-60"
                  disabled={isPending}
                  onClick={() => startTransition(() => toggleProductAlerts(product.id, !product.alerts_enabled))}
                >
                  {product.alerts_enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {product.alerts_enabled ? "Alerts on" : "Alerts off"}
                </button>
                <a href={product.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm">
                  <ExternalLink className="h-4 w-4" />
                  Open store
                </a>
              </div>
            </div>
          </article>
        )) : <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-slate-300">No products match those filters.</div>}
      </div>
    </div>
  );
}
