"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowDownAZ, CheckCircle2, Clock3, DollarSign, ExternalLink, Grid2X2, Layers3, Search } from "lucide-react";
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
type OwnedSetChecklistCard = SetChecklistCard & {
  owned: boolean;
  ownedItem?: InventoryItem | null;
  ownedItems?: InventoryItem[];
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
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [setFilter, setSetFilter] = useState(() => cleanInventoryText(searchParams.get("set")) ?? "all");
  const [viewMode, setViewMode] = useState<ViewMode>(() => searchParams.get("view") === "full-set" ? "set" : "list");
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
            <InventoryRow key={item.id} item={item} />
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

function InventoryRow({ item }: { item: InventoryItem }) {
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
        <Link
          href={`/inventory/${item.id}/edit`}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-center text-sm font-semibold text-slate-100"
        >
          Edit card details
        </Link>
        <Link href={`/inventory/ebay/${item.id}`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/25 px-3 text-center text-sm font-bold text-amber-100">
          <ExternalLink className="h-4 w-4 shrink-0" />
          <span className="truncate">Sell on eBay</span>
        </Link>
      </div>
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
  checklist: OwnedSetChecklistCard[];
  status: "idle" | "loading" | "ready" | "failed";
}) {
  const [selectedCardRef, setSelectedCardRef] = useState<{ setName: string; key: string } | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  if (!setName) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
        Add cards with set names first, then choose Full set to see what is owned and missing.
      </div>
    );
  }

  const total = checklist.length;
  const ownedInChecklist = checklist.filter((card) => card.owned).length;
  const selectedKey = selectedCardRef?.setName === setName ? selectedCardRef.key : null;
  const selectedCard = selectedKey ? checklist.find((card) => card.key === selectedKey) ?? null : null;
  const returnTo = `/inventory?view=full-set&set=${encodeURIComponent(setName)}`;

  function closeActionSheet() {
    setSelectedCardRef(null);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

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
          <button
            key={card.key}
            type="button"
            onClick={(event) => {
              lastTriggerRef.current = event.currentTarget;
              setSelectedCardRef((current) => current?.setName === setName && current.key === card.key ? null : { setName, key: card.key });
            }}
            className={`rounded-lg border p-2 text-left transition ${
              selectedKey === card.key
                ? "border-amber-300 bg-amber-300/15 shadow-[0_0_18px_rgba(252,211,77,0.18)]"
                : card.owned
                  ? "border-emerald-300/30 bg-emerald-300/10 hover:border-emerald-200/70"
                  : "border-white/10 bg-slate-950/45 hover:border-white/25"
            }`}
          >
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
          </button>
        )) : (
          <div className="col-span-full rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
            No cards found for this set yet.
          </div>
        )}
      </div>

      <FullSetCardActionSheet
        card={selectedCard}
        returnTo={returnTo}
        onClose={closeActionSheet}
      />
    </div>
  );
}

function FullSetCardActionSheet({
  card,
  returnTo,
  onClose
}: {
  card: OwnedSetChecklistCard | null;
  returnTo: string;
  onClose: () => void;
}) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const ownedEntries = card?.ownedItems?.length ? card.ownedItems : card?.ownedItem ? [card.ownedItem] : [];
  const selectedEntry = ownedEntries.find((entry) => entry.id === selectedEntryId) ?? ownedEntries[0] ?? null;
  const metadata = [card?.cardNumber, card?.setName, card?.variant].filter(Boolean).join(" - ") || "No number";

  useEffect(() => {
    if (!card) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "contain";

    window.requestAnimationFrame(() => {
      const firstFocusable = sheetRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])");
      firstFocusable?.focus();
    });

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior = previousDocumentOverscroll;
    };
  }, [card]);

  if (!card || typeof document === "undefined") return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !sheetRef.current) return;
    const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"))
      .filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const scanHref = `/scanner?set=${encodeURIComponent(card.setName)}&number=${encodeURIComponent(card.cardNumber ?? "")}`;
  const editHref = selectedEntry ? `/inventory/${selectedEntry.id}/edit?returnTo=${encodeURIComponent(returnTo)}` : "#";
  const sellHref = selectedEntry ? `/inventory/ebay/${selectedEntry.id}?returnTo=${encodeURIComponent(returnTo)}` : "#";

  return createPortal(
    <div
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} actions`}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        aria-label="Close card actions"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-72px)] overflow-y-auto rounded-t-2xl border border-amber-300/25 bg-slate-950 p-4 pb-[calc(env(safe-area-inset-bottom)+92px)] shadow-[0_-18px_50px_rgba(0,0,0,0.55)] sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3">
            {card.imageUrl ? (
              <div
                aria-hidden="true"
                className="h-24 w-16 rounded-md bg-slate-900 bg-cover bg-center"
                style={{ backgroundImage: `url(${card.imageUrl})` }}
              />
            ) : (
              <div className="grid h-24 w-16 place-items-center rounded-md border border-dashed border-white/15 bg-white/[0.03] text-3xl font-black text-slate-600">
                ?
              </div>
            )}
            <div className="min-w-0 pt-1">
              <p className="pw-hud text-xs font-black">{ownedEntries.length ? "Inventory card" : "Missing card"}</p>
              <h4 className="mt-1 truncate text-lg font-black text-white">{card.name}</h4>
              <p className="mt-1 truncate text-xs text-slate-400">{metadata}</p>
              {selectedEntry ? (
                <p className="mt-2 text-sm text-slate-300">
                  Qty {selectedEntry.quantity ?? 1} - <span className="font-black text-amber-200">{currency(selectedEntry.estimated_sale_price)}</span>
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-200"
          >
            Close
          </button>
        </div>

        {ownedEntries.length > 1 ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Choose copy</p>
            <div className="mt-2 grid gap-2">
              {ownedEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedEntryId(entry.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    selectedEntry?.id === entry.id
                      ? "border-amber-300 bg-amber-300/15 text-white"
                      : "border-white/10 bg-slate-950/50 text-slate-300"
                  }`}
                >
                  {[entry.variant, entry.condition, entry.language, `Qty ${entry.quantity ?? 1}`].filter(Boolean).join(" - ")}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {selectedEntry ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href={editHref}
              className="inline-flex h-12 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 text-center text-sm font-black text-cyan-50"
            >
              Edit
            </Link>
            <Link
              href={sellHref}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 text-center text-sm font-black text-amber-100"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              Sell
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            <Link
              href={scanHref}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950"
            >
              Scan this set
            </Link>
            <p className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-400">
              This card is missing from your inventory. Sell is only available after you add an owned copy.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-bold text-slate-200"
        >
          Close
        </button>
      </div>
    </div>,
    document.body
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
  const ownedByNumber = new Map<string, InventoryItem[]>();
  const ownedByName = new Map<string, InventoryItem[]>();

  for (const item of ownedItems) {
    const lookup = parseInventoryLookup(item.name);
    const cardNumber = normalizeCollectorNumber(item.card_number ?? lookup.cardNumber)?.normalized ?? "";
    const cardName = normalizeLookup(cleanCardName({
      rawName: item.card_name ?? lookup.cardName ?? item.name,
      rawCollectorNumber: item.card_number ?? lookup.cardNumber,
      normalizedCollectorNumber: cardNumber
    }).canonicalName);
    if (cardNumber) appendInventoryMatch(ownedByNumber, cardNumber, item);
    if (cardName) appendInventoryMatch(ownedByName, cardName, item);
  }

  return checklist.map((card) => {
    const numberMatch = normalizeCollectorNumber(card.cardNumber)?.normalized ?? "";
    const nameMatch = normalizeLookup(card.name);
    const matchedItems = (numberMatch ? ownedByNumber.get(numberMatch) : null) ?? ownedByName.get(nameMatch) ?? [];
    const ownedItem = matchedItems[0] ?? null;
    return {
      ...card,
      imageUrl: ownedItem?.image_url ?? card.imageUrl,
      owned: Boolean(ownedItem),
      ownedItem,
      ownedItems: matchedItems
    };
  });
}

function appendInventoryMatch(map: Map<string, InventoryItem[]>, key: string, item: InventoryItem) {
  const existing = map.get(key);
  if (existing) {
    if (!existing.some((match) => match.id === item.id)) existing.push(item);
  } else {
    map.set(key, [item]);
  }
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
