import Link from "next/link";
import { ScanLine } from "lucide-react";
import { InventoryCollection } from "@/components/inventory/InventoryCollection";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { TCGCSVProvider } from "@/lib/clips/providers/pricing";
import { calculateProfit, currency } from "@/lib/profit";
import type { InventoryItem } from "@/lib/types";

export default async function InventoryPage() {
  const { supabase, user } = await requireUser();
  const { data: items } = await supabase.from("inventory_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<InventoryItem[]>();
  const inventory = items ?? [];
  const displayInventory = await hydrateInventoryImages(inventory);
  const totals = inventory.reduce((sum, item) => {
    const result = calculateProfit({
      estimatedSalePrice: item.estimated_sale_price,
      purchasePrice: item.purchase_price,
      fees: item.fees,
      shipping: item.shipping,
      quantity: item.quantity
    });
    return {
      value: sum.value + result.sale,
      profit: sum.profit + result.profit,
      cost: sum.cost + result.cost
    };
  }, { value: 0, profit: 0, cost: 0 });
  const roi = totals.cost > 0 ? (totals.profit / totals.cost) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="pw-hero p-5 sm:p-6">
        <p className="pw-hud text-xs font-black">Inventory</p>
        <h1 className="mt-1 text-3xl font-black text-white">Collection tracker</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Scan cards into inventory from the PackWatcher scanner, then sort and review collection value here.</p>
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total collection value" value={currency(totals.value)} />
        <StatCard title="Estimated profit" value={currency(totals.profit)} />
        <StatCard title="ROI" value={`${roi.toFixed(1)}%`} />
      </section>
      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="pw-panel rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
          <h2 className="text-xl font-bold text-white">Add cards</h2>
          <p className="mt-2 text-sm text-slate-300">Use the scanner to identify cards, price them, and add them directly into inventory.</p>
          <Link href="/scanner" className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950">
            <ScanLine className="h-4 w-4" />
            Scan cards
          </Link>
        </aside>
        <InventoryCollection items={displayInventory} />
      </section>
    </div>
  );
}

async function hydrateInventoryImages(items: InventoryItem[]) {
  const provider = new TCGCSVProvider();
  const hydrated: InventoryItem[] = [];

  for (const item of items) {
    if (item.image_url) {
      hydrated.push(item);
      continue;
    }

    const lookup = parseInventoryLookup(item.name);
    if (!lookup.cardName) {
      hydrated.push(item);
      continue;
    }

    const prices = await provider.price(lookup).catch(() => []);
    hydrated.push({
      ...item,
      image_url: prices[0]?.imageUrl ?? null
    });
  }

  return hydrated;
}

function parseInventoryLookup(name: string) {
  const parts = name.split(" - ").map((part) => part.trim()).filter(Boolean);
  const cardName = parts[0] ?? name.trim();
  const maybeNumber = parts[1]?.match(/\d{1,4}(?:\s*\/\s*\d{1,4})?/)?.[0] ?? null;
  const setName = parts.length >= 3 ? parts.slice(2).join(" - ") : parts[1] ?? null;

  return {
    cardName,
    cardNumber: maybeNumber,
    setName
  };
}

