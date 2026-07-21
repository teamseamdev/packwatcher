import { createAdminClient } from "@/lib/supabase/admin";
import { cleanCardName } from "@/lib/cards/card-name";
import { normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { type CanonicalCardCandidate, normalizeCardNameForMatch } from "@/lib/cards/set-matching";
import { TCGCSVProvider, type TcgCsvCard, type TcgCsvSetSummary } from "@/lib/clips/providers/pricing";

export type CanonicalSetSummary = {
  id: string;
  name: string;
  normalizedName: string;
  tcgplayerGroupId: number | null;
  releaseDate: string | null;
  printedTotal: number | null;
  actualTotal: number | null;
  logoUrl: string | null;
};

type DbSet = {
  id: string;
  name: string;
  normalized_name: string;
  tcgplayer_group_id: number | null;
  release_date: string | null;
  printed_total: number | null;
  actual_total: number | null;
  logo_url: string | null;
};

type DbCard = {
  id: string;
  set_id: string;
  name: string;
  normalized_name: string;
  collector_number_raw: string | null;
  collector_number_normalized: string | null;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  tcgplayer_product_id: number | null;
  source_metadata: Record<string, unknown> | null;
  pokemon_card_sets?: { name: string } | null;
};

const selectedSetCardCache = new Map<string, { cards: CanonicalCardCandidate[]; cachedAt: number }>();
const SELECTED_SET_CARD_CACHE_MS = 10 * 60 * 1000;

export async function listCanonicalSets() {
  const admin = createAdminClient();
  const provider = new TCGCSVProvider();
  const groups = await provider.listSetGroups();
  await upsertTcgCsvSetSummaries(groups);

  const { data, error } = await admin
    .from("pokemon_card_sets")
    .select("id,name,normalized_name,tcgplayer_group_id,release_date,printed_total,actual_total,logo_url")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapSet);
}

export async function getCanonicalSet(setId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pokemon_card_sets")
    .select("id,name,normalized_name,tcgplayer_group_id,release_date,printed_total,actual_total,logo_url")
    .eq("id", setId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSet(data as DbSet) : null;
}

export async function ensureSetCardsImported(setId: string) {
  const admin = createAdminClient();
  const selectedSet = await getCanonicalSet(setId);
  if (!selectedSet) return null;

  const existing = await admin
    .from("pokemon_cards")
    .select("id", { count: "exact", head: true })
    .eq("set_id", setId);
  if (existing.error) throw existing.error;
  if ((existing.count ?? 0) > 0) return selectedSet;

  const provider = new TCGCSVProvider();
  const catalog = selectedSet.tcgplayerGroupId
    ? await provider.getSetCatalogByGroupId(selectedSet.tcgplayerGroupId)
    : await provider.getSetCatalog(selectedSet.name);
  if (!catalog) return selectedSet;

  await upsertTcgCsvSetSummaries([catalog.group]);
  await upsertTcgCsvCards(setId, catalog.cards);
  return selectedSet;
}

export async function getCardsForSelectedSet(setId: string): Promise<CanonicalCardCandidate[]> {
  const cached = selectedSetCardCache.get(setId);
  if (cached && Date.now() - cached.cachedAt < SELECTED_SET_CARD_CACHE_MS) return cached.cards;

  const admin = createAdminClient();
  const selectedSet = await ensureSetCardsImported(setId);
  if (!selectedSet) return [];

  const { data, error } = await admin
    .from("pokemon_cards")
    .select("id,set_id,name,normalized_name,collector_number_raw,collector_number_normalized,rarity,image_small,image_large,tcgplayer_product_id,source_metadata")
    .eq("set_id", setId)
    .order("set_sort_key", { ascending: true });
  if (error) throw error;

  const cards = (data ?? []).map((card) => dbCardToCandidate(card as DbCard, selectedSet.name));
  selectedSetCardCache.set(setId, { cards, cachedAt: Date.now() });
  return cards;
}

export async function getSetChecklist(setId: string) {
  const selectedSet = await ensureSetCardsImported(setId);
  const cards = await getCardsForSelectedSet(setId);
  return cards.map((card) => ({
    key: card.id,
    id: card.id,
    setId: card.setId,
    productId: card.tcgplayerProductId,
    name: card.name,
    setName: selectedSet?.name ?? card.setName,
    cardNumber: card.collectorNumberNormalized,
    variant: null,
    rarity: card.rarity ?? null,
    imageUrl: card.imageUrl ?? null,
    marketPrice: card.marketPrice ?? null
  }));
}

export function normalizeSetName(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokemon/gi, "pokemon")
    .replace(/pokémon/gi, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[''`]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\b(tcg|pokemon|cards?|set|expansion)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function upsertTcgCsvSetSummaries(groups: TcgCsvSetSummary[]) {
  if (!groups.length) return;
  const admin = createAdminClient();
  const rows = groups.map((group) => ({
    name: group.name,
    normalized_name: normalizeSetName(group.name),
    tcgplayer_group_id: group.groupId,
    source_metadata: { source: "tcgcsv", groupId: group.groupId }
  }));
  const { error } = await admin
    .from("pokemon_card_sets")
    .upsert(rows, { onConflict: "tcgplayer_group_id" });
  if (error) throw error;
}

async function upsertTcgCsvCards(setId: string, cards: TcgCsvCard[]) {
  if (!cards.length) return;
  const admin = createAdminClient();
  const rows = cards.map((card) => {
    const cleaned = cleanCardName({
      rawName: card.name,
      rawCollectorNumber: card.cardNumber,
      normalizedCollectorNumber: card.normalizedCollectorNumber,
      printedSetTotal: card.denominatorNumeric
    });
    return {
      set_id: setId,
      name: cleaned.canonicalName,
      normalized_name: normalizeCardNameForMatch(cleaned.canonicalName),
      collector_number_raw: card.cardNumber,
      collector_number_normalized: card.normalizedCollectorNumber,
      collector_number_prefix: card.collectorNumberPrefix,
      collector_number_numeric: card.collectorNumberNumeric,
      collector_number_suffix: card.collectorNumberSuffix,
      denominator_raw: card.denominator,
      denominator_numeric: card.denominatorNumeric,
      set_sort_key: card.sortKey ?? normalizeCollectorNumber(card.cardNumber)?.sortKey ?? null,
      rarity: card.rarity ?? null,
      image_small: card.imageUrl,
      image_large: card.imageUrl,
      tcgplayer_product_id: card.productId,
      source_metadata: {
        ...card.sourceMetadata,
        sourceNameRaw: card.sourceMetadata.rawName ?? card.name,
        displayNameBeforeCleanup: cleaned.changed ? card.name : null,
        nameCleanupRemovedSuffix: cleaned.removedSuffix ?? null,
        marketPrice: card.marketPrice ?? null
      }
    };
  });
  const { error } = await admin
    .from("pokemon_cards")
    .upsert(rows, { onConflict: "tcgplayer_product_id" });
  if (error) throw error;
}

function dbCardToCandidate(card: DbCard, setName: string): CanonicalCardCandidate {
  const metadata = card.source_metadata ?? {};
  const marketPrice = typeof metadata.marketPrice === "number" ? metadata.marketPrice : null;
  const cleaned = cleanCardName({
    rawName: card.name,
    rawCollectorNumber: card.collector_number_raw,
    normalizedCollectorNumber: card.collector_number_normalized
  });
  return {
    id: card.id,
    setId: card.set_id,
    setName,
    name: cleaned.canonicalName,
    normalizedName: cleaned.changed ? normalizeCardNameForMatch(cleaned.canonicalName) : card.normalized_name,
    collectorNumberRaw: card.collector_number_raw,
    collectorNumberNormalized: card.collector_number_normalized,
    rarity: card.rarity,
    imageUrl: card.image_large ?? card.image_small,
    tcgplayerProductId: card.tcgplayer_product_id,
    marketPrice
  };
}

function mapSet(row: DbSet): CanonicalSetSummary {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    tcgplayerGroupId: row.tcgplayer_group_id,
    releaseDate: row.release_date,
    printedTotal: row.printed_total,
    actualTotal: row.actual_total,
    logoUrl: row.logo_url
  };
}
