"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownAZ, CheckCircle2, Clock3, DollarSign, ExternalLink, Grid2X2, Layers3, Save, Search, Trash2 } from "lucide-react";
import { deleteInventoryItem, updateInventoryItem } from "@/app/(app)/inventory/actions";
import { SetCombobox } from "@/components/set-combobox";
import { cleanCardName } from "@/lib/cards/card-name";
import { compareCollectorNumbers, normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { calculateProfit, currency } from "@/lib/profit";
import type { InventoryItem } from "@/lib/types";

type SortMode = "recent" | "oldest" | "alpha" | "alpha_desc" | "set_alpha" | "collector_asc" | "collector_desc" | "price_desc" | "price_asc" | "quantity_desc" | "quantity_asc" | "profit_desc";
type ViewMode = "list" | "set";
type SetChecklistCard = {
  key: string;
  name: string;
  setName: string;
  cardNumber: string | null;
  variant: string | null;
  imageUrl: string | null;
};

const sortLabels: Record<SortMode, string> = {
  recent: "Recently added",
  oldest: "Oldest added",
  alpha: "Alphabetical",
  alpha_desc: "Name Z-A",
  set_alpha: "Set A-Z",
  collector_asc: "Collector # ascending",
  collector_desc: "Collector # descending",
  price_desc: "Price high to low",
  price_asc: "Price low to high",
  quantity_desc: "Quantity high to low",
  quantity_asc: "Quantity low to high",
  profit_desc: "Profit high to low"
};

export function InventoryCollection({ items }: { items: InventoryItem[] }) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [setFilter, setSetFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [checklist, setChecklist] = useState<SetChecklistCard[]>([]);
  const [allSetOptions, setAllSetOptions] = useState<string[]>([]);
  const [allSetObjects, setAllSetObjects] = useState<Array<{ id: string; name: string }>>([]);
  const [checklistStatus, setChecklistStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  const setOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      const setName = inventorySetName(item);
      if (setName) names.add(setName);
    }
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [items]);

  const selectedSet = setFilter !== "all" ? setFilter : setOptions[0] ?? "";
  const selectedSetId = useMemo(() => {
    const normalized = normalizeSetLabel(selectedSet);
    return allSetObjects.find((set) => normalizeSetLabel(set.name) === normalized)?.id ?? null;
  }, [allSetObjects, selectedSet]);
  const searchableSetOptions = useMemo(
    () => Array.from(new Set([...allSetOptions, ...setOptions])).sort((left, right) => left.localeCompare(right)),
    [allSetOptions, setOptions]
  );

  useEffect(() => {
    let ignore = false;
    async function loadSets() {
      const response = await fetch("/api/card-sets");
      const body = await response.json().catch(() => null) as { ok?: boolean; sets?: string[]; cardSets?: Array<{ id: string; name: string }> } | null;
      if (!ignore && response.ok && body?.sets?.length) setAllSetOptions(body.sets);
      if (!ignore && response.ok && body?.cardSets?.length) setAllSetObjects(body.cardSets);
    }
    void loadSets();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (viewMode !== "set" || !selectedSet) return;

    let ignore = false;
    async function loadChecklist() {
      setChecklistStatus("loading");
      const query = selectedSetId ? `setId=${encodeURIComponent(selectedSetId)}` : `set=${encodeURIComponent(selectedSet)}`;
      const response = await fetch(`/api/inventory/set-checklist?${query}`);
      const body = await response.json().catch(() => null) as { ok?: boolean; cards?: SetChecklistCard[] } | null;
      if (ignore) return;
      if (response.ok && body?.ok) {
        setChecklist(body.cards ?? []);
        setChecklistStatus("ready");
      } else {
        setChecklist([]);
        setChecklistStatus("failed");
      }
    }

    void loadChecklist();
    return () => {
      ignore = true;
    };
  }, [selectedSet, selectedSetId, viewMode]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visible = items.filter((item) => {
      const setName = inventorySetName(item);
      const text = `${item.name} ${item.card_name ?? ""} ${item.set_name ?? ""} ${item.card_number ?? ""} ${item.variant ?? ""} ${item.notes ?? ""}`.toLowerCase();
      const matchesQuery = normalizedQuery ? text.includes(normalizedQuery) : true;
      const matchesSet = setFilter === "all" ? true : setName === setFilter;
      return matchesQuery && matchesSet;
    });

    return [...visible].sort((left, right) => {
      const leftProfit = inventoryProfit(left).profit;
      const rightProfit = inventoryProfit(right).profit;
      const leftValue = Number(left.estimated_sale_price ?? 0);
      const rightValue = Number(right.estimated_sale_price ?? 0);
      const leftSet = inventorySetName(left) ?? "";
      const rightSet = inventorySetName(right) ?? "";

      switch (sortMode) {
        case "alpha":
          return left.name.localeCompare(right.name);
        case "alpha_desc":
          return right.name.localeCompare(left.name);
        case "set_alpha":
          return leftSet.localeCompare(rightSet) || compareInventoryCollectorNumbers(left, right) || left.name.localeCompare(right.name);
        case "collector_asc":
          return compareInventoryCollectorNumbers(left, right) || left.name.localeCompare(right.name);
        case "collector_desc":
          return compareInventoryCollectorNumbers(right, left) || left.name.localeCompare(right.name);
        case "price_desc":
          return rightValue - leftValue;
        case "price_asc":
          return leftValue - rightValue;
        case "quantity_desc":
          return Number(right.quantity ?? 0) - Number(left.quantity ?? 0);
        case "quantity_asc":
          return Number(left.quantity ?? 0) - Number(right.quantity ?? 0);
        case "profit_desc":
          return rightProfit - leftProfit;
        case "oldest":
          return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
        case "recent":
        default:
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }
    });
  }, [items, query, setFilter, sortMode]);

  const selectedSetItems = useMemo(
    () => items.filter((item) => selectedSet && inventorySetName(item) === selectedSet),
    [items, selectedSet]
  );
  const ownedChecklist = useMemo(() => buildOwnedSetChecklist(checklist, selectedSetItems), [checklist, selectedSetItems]);

  return (
    <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Current inventory</h2>
          <p className="mt-1 text-sm text-slate-400">{filteredItems.length} of {items.length} item{items.length === 1 ? "" : "s"} shown</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
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
            value={setFilter}
            onChange={(event) => setSetFilter(event.target.value)}
            className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-200 outline-none focus:border-amber-300 sm:max-w-56"
          >
            <option value="all">All sets</option>
            {searchableSetOptions.map((setName) => <option key={setName} value={setName}>{setName}</option>)}
          </select>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-200 outline-none focus:border-amber-300"
          >
            {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-1">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${viewMode === "list" ? "bg-amber-300 text-slate-950" : "text-slate-300"}`}
        >
          <Layers3 className="h-4 w-4" />
          Cards
        </button>
        <button
          type="button"
          onClick={() => setViewMode("set")}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${viewMode === "set" ? "bg-amber-300 text-slate-950" : "text-slate-300"}`}
        >
          <Grid2X2 className="h-4 w-4" />
          Full set
        </button>
      </div>

      <div className="scroll-panel mt-4 max-h-[68vh] space-y-3 pr-1">
        {viewMode === "list" ? (
          filteredItems.length ? filteredItems.map((item) => (
            <InventoryRow key={item.id} item={item} setOptions={searchableSetOptions} />
          )) : (
            <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
              No inventory items match this filter.
            </div>
          )
        ) : (
          <SetChecklistView
            setName={selectedSet}
            ownedCount={selectedSetItems.length}
            checklist={ownedChecklist}
            status={checklistStatus}
          />
        )}
      </div>
    </section>
  );
}

function InventoryRow({ item, setOptions }: { item: InventoryItem; setOptions: string[] }) {
  const [isEditing, setIsEditing] = useState(false);
  const result = inventoryProfit(item);
  const addedDate = item.created_at ? new Date(item.created_at).toLocaleDateString() : null;
  const profitTone = result.profit >= 0 ? "text-emerald-300" : "text-rose-300";
  const parsedLookup = parseInventoryLookup(item.name);
  const cardNumber = item.card_number || parsedLookup.cardNumber;
  const cardName = cleanCardName({
    rawName: item.card_name || parsedLookup.cardName || item.name,
    rawCollectorNumber: cardNumber,
    normalizedCollectorNumber: normalizeCollectorNumber(cardNumber)?.normalized
  }).canonicalName;
  const setName = inventorySetName(item);

  async function saveAndCollapse(formData: FormData) {
    await updateInventoryItem(formData);
    setIsEditing(false);
  }

  return (
    <article className="rounded-lg border border-cyan-300/10 bg-black/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
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
              <h3 className="truncate font-bold text-white">{cardName}</h3>
              <p className="mt-1 truncate text-xs text-slate-500">
                {[cardNumber, setName, item.variant, item.foil ? "Foil" : null].filter(Boolean).join(" - ") || "No set details"}{addedDate ? ` - Added ${addedDate}` : ""}
              </p>
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
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setIsEditing((current) => !current)}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-center text-sm font-semibold text-slate-100"
        >
          Edit card details
        </button>
        <Link href={`/inventory/ebay/${item.id}`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/25 px-3 text-center text-sm font-bold text-amber-100">
          <ExternalLink className="h-4 w-4 shrink-0" />
          <span className="truncate">Sell on eBay</span>
        </Link>
      </div>

      {isEditing ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/45 p-3">
        <form action={saveAndCollapse} className="grid gap-3">
          <input type="hidden" name="id" value={item.id} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_90px]">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
              <input name="name" defaultValue={item.name} className={fieldClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qty</span>
              <input name="quantity" type="number" min="1" step="1" defaultValue={item.quantity} className={fieldClass} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card name</span>
              <input name="card_name" defaultValue={cardName} className={fieldClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Set</span>
              <SetCombobox name="set_name" value={setName ?? ""} options={setOptions} placeholder="Search set" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card number</span>
              <input name="card_number" defaultValue={cardNumber ?? ""} className={fieldClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Finish</span>
              <select name="variant" defaultValue={item.variant ?? (item.foil ? "Holofoil" : "Normal")} className={fieldClass}>
                <option value="Normal">Normal</option>
                <option value="Holofoil">Foil / holo</option>
                <option value="Reverse Holofoil">Reverse holo</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
              <input name="foil" type="checkbox" defaultChecked={Boolean(item.foil)} className="h-5 w-5 accent-amber-300" />
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Foil card</span>
                <span className="text-sm text-slate-200">Use foil pricing context</span>
              </span>
            </label>
          </div>
          <input type="hidden" name="language" value={item.language ?? ""} />
          <div className="grid gap-3 sm:grid-cols-4">
            <MoneyField name="purchase_price" label="Cost" value={item.purchase_price} />
            <MoneyField name="estimated_sale_price" label="Value" value={item.estimated_sale_price} />
            <MoneyField name="fees" label="Fees" value={item.fees} />
            <MoneyField name="shipping" label="Shipping" value={item.shipping} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase date</span>
              <input name="purchase_date" type="date" defaultValue={item.purchase_date ?? ""} className={fieldClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Image URL</span>
              <input name="image_url" defaultValue={item.image_url ?? ""} className={fieldClass} />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span>
            <textarea name="notes" defaultValue={item.notes ?? ""} className="min-h-24 rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-100 outline-none focus:border-amber-300" />
          </label>
          <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-bold text-slate-950 sm:w-fit">
            <Save className="h-4 w-4" />
            Save changes
          </button>
        </form>
        <form action={deleteInventoryItem} className="mt-3 border-t border-white/10 pt-3">
          <input type="hidden" name="id" value={item.id} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-300/30 px-4 text-sm font-semibold text-rose-100">
            <Trash2 className="h-4 w-4" />
            Delete card
          </button>
          <p className="mt-2 text-xs text-slate-500">Deletes this inventory record from your collection.</p>
        </form>
        </div>
      ) : null}
    </article>
  );
}

function SetChecklistView({
  setName,
  ownedCount,
  checklist,
  status
}: {
  setName: string;
  ownedCount: number;
  checklist: Array<SetChecklistCard & { owned: boolean; ownedItem?: InventoryItem | null }>;
  status: "idle" | "loading" | "ready" | "failed";
}) {
  if (!setName) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
        Add cards with set names first, then choose Full set to see what is owned and missing.
      </div>
    );
  }

  const total = checklist.length;
  const ownedInChecklist = checklist.filter((card) => card.owned).length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
        <p className="pw-hud text-xs font-black">Set checklist</p>
        <h3 className="mt-1 text-xl font-black text-white">{setName}</h3>
        <p className="mt-1 text-sm text-slate-300">
          {status === "loading"
            ? "Loading full set..."
            : status === "failed"
              ? `${ownedCount} owned cards shown. Full checklist could not load right now.`
              : `${ownedInChecklist} of ${total} checklist card${total === 1 ? "" : "s"} owned.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {checklist.length ? checklist.map((card) => (
          <div key={card.key} className={`rounded-lg border p-2 ${card.owned ? "border-emerald-300/30 bg-emerald-300/10" : "border-white/10 bg-slate-950/45"}`}>
            {card.owned && card.imageUrl ? (
              <div className="aspect-[63/88] rounded-md bg-slate-900 bg-cover bg-center" style={{ backgroundImage: `url(${card.imageUrl})` }} />
            ) : (
              <div className="grid aspect-[63/88] place-items-center rounded-md border border-dashed border-white/15 bg-white/[0.03] text-4xl font-black text-slate-600">
                ?
              </div>
            )}
            <div className="mt-2 min-w-0">
              <p className="truncate text-sm font-bold text-white">{card.name}</p>
              <p className="truncate text-xs text-slate-500">{[card.cardNumber, card.variant].filter(Boolean).join(" - ") || "No number"}</p>
              <p className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${card.owned ? "bg-emerald-300/15 text-emerald-200" : "bg-white/5 text-slate-500"}`}>
                {card.owned ? <CheckCircle2 className="h-3 w-3" /> : null}
                {card.owned ? "Owned" : "Missing"}
              </p>
            </div>
          </div>
        )) : (
          <div className="col-span-full rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
            No cards found for this set yet.
          </div>
        )}
      </div>
    </div>
  );
}

const fieldClass = "h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300";

function MoneyField({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input name={name} type="number" min="0" step="0.01" defaultValue={value} className={fieldClass} />
    </label>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="pw-stat-tile rounded-md px-2 py-2">
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

function compareInventoryCollectorNumbers(left: InventoryItem, right: InventoryItem) {
  const leftLookup = parseInventoryLookup(left.name);
  const rightLookup = parseInventoryLookup(right.name);
  return compareCollectorNumbers(left.card_number ?? leftLookup.cardNumber, right.card_number ?? rightLookup.cardNumber);
}

function buildOwnedSetChecklist(checklist: SetChecklistCard[], ownedItems: InventoryItem[]) {
  const ownedByNumber = new Map<string, InventoryItem>();
  const ownedByName = new Map<string, InventoryItem>();

  for (const item of ownedItems) {
    const lookup = parseInventoryLookup(item.name);
    const cardNumber = normalizeCollectorNumber(item.card_number ?? lookup.cardNumber)?.normalized ?? "";
    const cardName = normalizeLookup(cleanCardName({
      rawName: item.card_name ?? lookup.cardName ?? item.name,
      rawCollectorNumber: item.card_number ?? lookup.cardNumber,
      normalizedCollectorNumber: cardNumber
    }).canonicalName);
    if (cardNumber) ownedByNumber.set(cardNumber, item);
    if (cardName) ownedByName.set(cardName, item);
  }

  return checklist.map((card) => {
    const numberMatch = normalizeCollectorNumber(card.cardNumber)?.normalized ?? "";
    const nameMatch = normalizeLookup(card.name);
    const ownedItem = (numberMatch ? ownedByNumber.get(numberMatch) : null) ?? ownedByName.get(nameMatch) ?? null;
    return {
      ...card,
      imageUrl: ownedItem?.image_url ?? card.imageUrl,
      owned: Boolean(ownedItem),
      ownedItem
    };
  });
}

function inventorySetName(item: InventoryItem) {
  return cleanInventoryText(item.set_name) ?? parseInventoryLookup(item.name).setName ?? parseNotesValue(item.notes, "Set");
}

function parseInventoryLookup(name: string) {
  const parts = name.split(" - ").map((part) => part.trim()).filter(Boolean);
  const cardName = parts[0] ?? name.trim();
  const maybeNumber = parts[1]?.match(/\d{1,4}(?:\s*\/\s*\d{1,4})?/)?.[0] ?? null;
  const setName = parts.length >= 3 ? parts.slice(2).join(" - ") : null;

  return {
    cardName,
    cardNumber: maybeNumber,
    setName
  };
}

function parseNotesValue(notes: string | null, label: string) {
  const match = notes?.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
  return cleanInventoryText(match?.[1]);
}

function cleanInventoryText(value?: string | null) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}

function normalizeLookup(value?: string | null) {
  return cleanInventoryText(value)
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
}

function normalizeSetLabel(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokémon/gi, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
