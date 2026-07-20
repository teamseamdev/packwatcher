import { normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { ensureSetCardsImported, listCanonicalSets, normalizeSetName } from "@/lib/cards/catalog";
import { normalizeCardNameForMatch } from "@/lib/cards/set-matching";
import { createAdminClient } from "@/lib/supabase/admin";

type InventoryRow = {
  id: string;
  user_id: string;
  name: string;
  card_name: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
};

type CardRow = {
  id: string;
  set_id: string;
  name: string;
  collector_number_normalized: string | null;
  normalized_name: string;
  image_large: string | null;
  image_small: string | null;
};

export type InventoryReconciliationResult = {
  scanned: number;
  linked: number;
  skipped: number;
  ambiguous: number;
  missingSet: number;
  missingCard: number;
};

export async function reconcileInventoryCanonicalCards(limit = 500): Promise<InventoryReconciliationResult> {
  const admin = createAdminClient();
  await listCanonicalSets();

  const { data, error } = await admin
    .from("inventory_items")
    .select("id,user_id,name,card_name,set_name,card_number,image_url")
    .is("canonical_card_id", null)
    .not("set_name", "is", null)
    .limit(limit)
    .returns<InventoryRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  const result: InventoryReconciliationResult = {
    scanned: rows.length,
    linked: 0,
    skipped: 0,
    ambiguous: 0,
    missingSet: 0,
    missingCard: 0
  };

  const sets = await listCanonicalSets();
  const setsByName = new Map(sets.map((set) => [set.normalizedName, set]));
  const cardCache = new Map<string, CardRow[]>();

  for (const row of rows) {
    const setName = cleanText(row.set_name) ?? parseInventoryName(row.name).setName;
    const cardName = cleanText(row.card_name) ?? parseInventoryName(row.name).cardName;
    const cardNumber = normalizeCollectorNumber(row.card_number ?? parseInventoryName(row.name).cardNumber)?.normalized ?? null;
    if (!setName || (!cardName && !cardNumber)) {
      result.skipped += 1;
      continue;
    }

    const set = setsByName.get(normalizeSetName(setName));
    if (!set) {
      result.missingSet += 1;
      continue;
    }

    await ensureSetCardsImported(set.id);
    let cards = cardCache.get(set.id);
    if (!cards) {
      const loaded = await admin
        .from("pokemon_cards")
        .select("id,set_id,name,collector_number_normalized,normalized_name,image_large,image_small")
        .eq("set_id", set.id)
        .returns<CardRow[]>();
      if (loaded.error) throw loaded.error;
      cards = loaded.data ?? [];
      cardCache.set(set.id, cards);
    }

    const matchesByNumber = cardNumber
      ? cards.filter((card) => card.collector_number_normalized === cardNumber)
      : [];
    const normalizedName = normalizeCardNameForMatch(cardName);
    const matchesByName = normalizedName
      ? cards.filter((card) => card.normalized_name === normalizedName)
      : [];
    const deterministicMatches = matchesByNumber.length ? matchesByNumber : matchesByName.length === 1 ? matchesByName : [];

    if (deterministicMatches.length !== 1) {
      if (matchesByNumber.length > 1 || matchesByName.length > 1) result.ambiguous += 1;
      else result.missingCard += 1;
      continue;
    }

    const card = deterministicMatches[0];
    const { error: updateError } = await admin
      .from("inventory_items")
      .update({
        canonical_set_id: set.id,
        canonical_card_id: card.id,
        set_name: set.name,
        card_name: card.name,
        card_number: card.collector_number_normalized,
        image_url: row.image_url ?? card.image_large ?? card.image_small
      })
      .eq("id", row.id);
    if (updateError) throw updateError;
    result.linked += 1;
  }

  return result;
}

function parseInventoryName(name: string) {
  const parts = name.split(" - ").map((part) => part.trim()).filter(Boolean);
  return {
    cardName: parts[0] ?? null,
    cardNumber: parts[1]?.match(/[A-Z-]*\d{1,4}[A-Z]?(?:\s*\/\s*[A-Z-]*\d{1,4})?/i)?.[0] ?? null,
    setName: parts.length >= 3 ? parts.slice(2).join(" - ") : null
  };
}

function cleanText(value?: string | null) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}
