import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { deleteInventoryItem, updateInventoryItem } from "@/app/(app)/inventory/actions";
import { SetCombobox } from "@/components/set-combobox";
import { requireUser } from "@/lib/auth";
import { cleanCardName } from "@/lib/cards/card-name";
import { normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { currency } from "@/lib/profit";
import type { InventoryItem } from "@/lib/types";

export default async function EditInventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  const [{ data: item }, { data: sets }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", id).eq("user_id", user.id).single<InventoryItem>(),
    supabase.from("pokemon_card_sets").select("name").order("name", { ascending: true }).returns<Array<{ name: string }>>()
  ]);

  if (!item) notFound();

  const parsedLookup = parseInventoryLookup(item.name);
  const cardNumber = item.card_number || parsedLookup.cardNumber;
  const setName = inventorySetName(item);
  const cardName = cleanCardName({
    rawName: item.card_name || parsedLookup.cardName || item.name,
    rawCollectorNumber: cardNumber,
    normalizedCollectorNumber: normalizeCollectorNumber(cardNumber)?.normalized
  }).canonicalName;
  const setOptions = Array.from(new Set([...(sets ?? []).map((set) => set.name), setName].filter(Boolean) as string[]))
    .sort((left, right) => left.localeCompare(right));

  async function saveAndReturn(formData: FormData) {
    "use server";
    await updateInventoryItem(formData);
    redirect("/inventory");
  }

  async function deleteAndReturn(formData: FormData) {
    "use server";
    await deleteInventoryItem(formData);
    redirect("/inventory");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/inventory" className="inline-flex items-center gap-2 text-sm font-bold text-slate-300">
        <ArrowLeft className="h-4 w-4" />
        Back to inventory
      </Link>

      <header className="pw-hero p-5">
        <p className="pw-hud text-xs font-black">Inventory</p>
        <h1 className="mt-1 text-3xl font-black text-white">Edit card details</h1>
        <p className="mt-2 text-sm text-slate-400">{cardName} - {currency(item.estimated_sale_price)}</p>
      </header>

      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
          {item.image_url ? (
            <div
              aria-hidden="true"
              className="aspect-[63/88] rounded-lg bg-slate-950 bg-cover bg-center"
              style={{ backgroundImage: `url(${item.image_url})` }}
            />
          ) : (
            <div className="grid aspect-[63/88] place-items-center rounded-lg border border-dashed border-white/15 bg-white/5 text-xs uppercase tracking-wide text-slate-500">
              No image
            </div>
          )}
          <form action={saveAndReturn} className="grid gap-3">
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

            <div className="grid gap-3 sm:grid-cols-2">
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
              <textarea name="notes" defaultValue={item.notes ?? ""} className="min-h-28 rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-100 outline-none focus:border-amber-300" />
            </label>

            <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 sm:w-fit">
              <Save className="h-4 w-4" />
              Save changes
            </button>
          </form>
        </div>
      </section>

      <form action={deleteAndReturn} className="pw-panel rounded-lg border border-rose-300/25 bg-rose-500/10 p-4">
        <input type="hidden" name="id" value={item.id} />
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-rose-300/30 px-4 text-sm font-semibold text-rose-100">
          <Trash2 className="h-4 w-4" />
          Delete card
        </button>
        <p className="mt-2 text-xs text-rose-100/75">Deletes this inventory record from your collection.</p>
      </form>
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
