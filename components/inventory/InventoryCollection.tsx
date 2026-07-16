"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownAZ, Clock3, DollarSign, Search } from "lucide-react";
import { calculateProfit, currency } from "@/lib/profit";
import type { InventoryItem } from "@/lib/types";

type SortMode = "recent" | "alpha" | "price_desc" | "price_asc" | "profit_desc";

const sortLabels: Record<SortMode, string> = {
  recent: "Recently added",
  alpha: "Alphabetical",
  price_desc: "Price high to low",
  price_asc: "Price low to high",
  profit_desc: "Profit high to low"
};

export function InventoryCollection({ items }: { items: InventoryItem[] }) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visible = normalizedQuery
      ? items.filter((item) => `${item.name} ${item.notes ?? ""}`.toLowerCase().includes(normalizedQuery))
      : items;

    return [...visible].sort((left, right) => {
      const leftProfit = inventoryProfit(left).profit;
      const rightProfit = inventoryProfit(right).profit;
      const leftValue = Number(left.estimated_sale_price ?? 0);
      const rightValue = Number(right.estimated_sale_price ?? 0);

      switch (sortMode) {
        case "alpha":
          return left.name.localeCompare(right.name);
        case "price_desc":
          return rightValue - leftValue;
        case "price_asc":
          return leftValue - rightValue;
        case "profit_desc":
          return rightProfit - leftProfit;
        case "recent":
        default:
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }
    });
  }, [items, query, sortMode]);

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Current inventory</h2>
          <p className="mt-1 text-sm text-slate-400">{filteredItems.length} of {items.length} item{items.length === 1 ? "" : "s"} shown</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inventory"
              className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-amber-300 sm:w-56"
            />
          </label>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-200 outline-none focus:border-amber-300"
          >
            {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="scroll-panel mt-4 max-h-[68vh] space-y-3 pr-1">
        {filteredItems.length ? filteredItems.map((item) => (
          <InventoryRow key={item.id} item={item} />
        )) : (
          <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
            No inventory items match this filter.
          </div>
        )}
      </div>
    </section>
  );
}

function InventoryRow({ item }: { item: InventoryItem }) {
  const result = inventoryProfit(item);
  const addedDate = item.created_at ? new Date(item.created_at).toLocaleDateString() : null;
  const profitTone = result.profit >= 0 ? "text-emerald-300" : "text-rose-300";

  return (
    <article className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg border border-white/10 bg-slate-950/45 p-3">
      {item.image_url ? (
        <div
          aria-hidden="true"
          className="h-24 w-[72px] rounded-md bg-slate-900 bg-cover bg-center"
          style={{ backgroundImage: `url(${item.image_url})` }}
        />
      ) : (
        <div className="grid h-24 w-[72px] place-items-center rounded-md border border-white/10 bg-white/5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          No image
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-white">{item.name}</h3>
            <p className="mt-1 text-xs text-slate-500">Qty {item.quantity}{addedDate ? ` - Added ${addedDate}` : ""}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-black text-amber-200">{currency(result.sale)}</p>
            <p className={`text-xs font-bold ${profitTone}`}>{currency(result.profit)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Metric icon={<DollarSign className="h-3.5 w-3.5" />} label="Price" value={currency(item.estimated_sale_price)} />
          <Metric icon={<Clock3 className="h-3.5 w-3.5" />} label="Cost" value={currency(item.purchase_price)} />
          <Metric icon={<ArrowDownAZ className="h-3.5 w-3.5" />} label="ROI" value={`${result.roi.toFixed(1)}%`} />
        </div>
      </div>
    </article>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.04] px-2 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">{icon}{label}</p>
      <p className="mt-1 truncate font-bold text-slate-100">{value}</p>
    </div>
  );
}

function inventoryProfit(item: InventoryItem) {
  return calculateProfit({
    estimatedSalePrice: Number(item.estimated_sale_price ?? 0),
    purchasePrice: Number(item.purchase_price ?? 0),
    fees: Number(item.fees ?? 0),
    shipping: Number(item.shipping ?? 0),
    quantity: Number(item.quantity ?? 1)
  });
}
