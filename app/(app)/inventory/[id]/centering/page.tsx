import { notFound } from "next/navigation";
import { CenteringCheckFlow } from "@/components/centering/CenteringCheckFlow";
import { requireUser } from "@/lib/auth";
import { cleanCardName } from "@/lib/cards/card-name";
import { normalizeCollectorNumber } from "@/lib/cards/collector-number";
import type { CardCenteringAnalysis, InventoryItem } from "@/lib/types";

export default async function InventoryCenteringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: item }, { data: latest }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", id).eq("user_id", user.id).single<InventoryItem>(),
    supabase
      .from("card_centering_analyses")
      .select("*")
      .eq("inventory_item_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<CardCenteringAnalysis>()
  ]);

  if (!item) notFound();

  const parsedLookup = parseInventoryLookup(item.name);
  const cardNumber = item.card_number || parsedLookup.cardNumber;
  const cardName = cleanCardName({
    rawName: item.card_name || parsedLookup.cardName || item.name,
    rawCollectorNumber: cardNumber,
    normalizedCollectorNumber: normalizeCollectorNumber(cardNumber)?.normalized
  }).canonicalName;
  const setName = cleanInventoryText(item.set_name) ?? parsedLookup.setName;

  return (
    <div className="mx-auto max-w-5xl">
      <CenteringCheckFlow
        inventoryItem={{
          id: item.id,
          name: item.name,
          cardName,
          setName,
          cardNumber,
          imageUrl: item.image_url ?? null,
          canonicalCardId: item.canonical_card_id ?? null
        }}
        latestAnalysis={latest ? {
          id: latest.id,
          front_lr_ratio: latest.front_lr_ratio,
          front_tb_ratio: latest.front_tb_ratio,
          back_lr_ratio: latest.back_lr_ratio,
          back_tb_ratio: latest.back_tb_ratio,
          overall_confidence: latest.overall_confidence,
          recommendation: latest.recommendation,
          created_at: latest.created_at
        } : null}
        returnTo={`/inventory/${item.id}/edit`}
      />
    </div>
  );
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

function cleanInventoryText(value?: string | null) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}
