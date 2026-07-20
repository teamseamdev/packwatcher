import { compareCollectorNumbers, normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { normalizeCardNameForMatch } from "@/lib/cards/set-matching";

export type PricingCandidate = {
  value: number;
  currency: "USD";
  source: string;
  confidence: number;
  label?: string | null;
  imageUrl?: string | null;
};

export type SetChecklistCard = {
  key: string;
  id?: string | null;
  productId?: number | null;
  setId?: string | null;
  name: string;
  setName: string;
  cardNumber: string | null;
  variant: string | null;
  rarity?: string | null;
  imageUrl: string | null;
  marketPrice?: number | null;
};

export type TcgCsvSetSummary = {
  groupId: number;
  name: string;
};

export type TcgCsvCard = SetChecklistCard & {
  productId: number;
  groupId: number;
  normalizedName: string;
  normalizedCollectorNumber: string | null;
  collectorNumberPrefix: string;
  collectorNumberNumeric: number | null;
  collectorNumberSuffix: string;
  denominator: string | null;
  denominatorNumeric: number | null;
  sortKey: string | null;
  sourceMetadata: Record<string, unknown>;
};

export type PricingProvider = {
  name: string;
  price(input: { cardName: string; setName?: string | null; cardNumber?: string | null; variant?: string | null }): Promise<PricingCandidate[]>;
};

export class ManualPricingProvider implements PricingProvider {
  name = "manual";

  async price(): Promise<PricingCandidate[]> {
    return [];
  }
}

export class TCGCSVProvider implements PricingProvider {
  name = "tcgcsv";

  async price(input: { cardName: string; setName?: string | null; cardNumber?: string | null; variant?: string | null }): Promise<PricingCandidate[]> {
    return searchTcgCsvPrice(input);
  }

  async listSetCards(setName: string): Promise<SetChecklistCard[]> {
    return listTcgCsvSetCards(setName);
  }

  async listSets(): Promise<string[]> {
    const groups = await this.listSetGroups();
    return groups.map((group) => group.name);
  }

  async listSetGroups(): Promise<TcgCsvSetSummary[]> {
    const groups = await getGroups();
    return groups
      .filter((group) => !isLikelySealedProduct(group.name))
      .map((group) => ({ groupId: group.groupId, name: group.name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getSetCatalogByGroupId(groupId: number): Promise<{ group: TcgCsvSetSummary; cards: TcgCsvCard[] }> {
    const groups = await getGroups();
    const group = groups.find((item) => item.groupId === groupId);
    if (!group) throw new Error(`TCGCSV Pokemon group ${groupId} was not found.`);
    const data = await getGroupData(group);
    const cards = data.products
      .filter((product) => !isLikelySealedProduct(product.name))
      .map((product) => parseTcgCsvCard(product, group, data.prices))
      .filter((card) => Boolean(card.name));
    return { group: { groupId: group.groupId, name: group.name }, cards: cards.sort(compareChecklistCards) };
  }

  async getSetCatalog(setName: string): Promise<{ group: TcgCsvSetSummary; cards: TcgCsvCard[] } | null> {
    const groups = await getGroups();
    const group = selectChecklistGroups(groups, setName)[0] ?? null;
    return group ? this.getSetCatalogByGroupId(group.groupId) : null;
  }
}

export class PriceChartingProvider implements PricingProvider {
  name = "pricecharting_placeholder";

  async price(): Promise<PricingCandidate[]> {
    return [];
  }
}

export class JustTCGProvider implements PricingProvider {
  name = "justtcg_placeholder";

  async price(): Promise<PricingCandidate[]> {
    return [];
  }
}

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const POKEMON_CATEGORY_ID = 3;

type TcgCsvCollection<T> = {
  results?: T[];
};

type TcgCsvGroup = {
  groupId: number;
  name: string;
};

type TcgCsvProduct = {
  productId: number;
  name: string;
  cleanName?: string | null;
  groupName?: string | null;
  extendedData?: unknown;
  imageUrl?: string | null;
  image_url?: string | null;
  image?: string | null;
};

type TcgCsvPrice = {
  productId: number;
  marketPrice?: number | null;
  midPrice?: number | null;
  lowPrice?: number | null;
};

type CachedGroup = {
  group: TcgCsvGroup;
  products: TcgCsvProduct[];
  prices: TcgCsvPrice[];
};

let groupCache: TcgCsvGroup[] | null = null;
const productCache = new Map<number, CachedGroup>();

async function searchTcgCsvPrice(input: { cardName: string; setName?: string | null; cardNumber?: string | null; variant?: string | null }) {
  const cardName = input.cardName.trim();
  if (!cardName) return [];

  const groups = await getGroups();
  const selectedGroups = selectGroups(groups, input.setName).slice(0, Number(process.env.CLIPS_TCGCSV_MAX_GROUPS ?? 40));
  const candidates: PricingCandidate[] = [];

  for (const group of selectedGroups) {
    const data = await getGroupData(group);
    const product = bestProductMatch(data.products, input);
    if (!product) continue;

    const price = data.prices.find((item) => item.productId === product.productId);
    const value = firstPositive(price?.marketPrice, price?.midPrice, price?.lowPrice);
    if (value === null) continue;

    candidates.push({
      value,
      currency: "USD",
      source: thisSource(product, group),
      confidence: scoreProduct(product, input),
      label: product.cleanName ?? product.name,
      imageUrl: productImageUrl(product)
    });

    if (candidates.length >= 3) break;
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

async function listTcgCsvSetCards(setName: string) {
  const normalizedSet = normalize(setName);
  if (!normalizedSet) return [];

  const groups = await getGroups();
  const selectedGroups = selectChecklistGroups(groups, setName).slice(0, 3);

  const cards = new Map<string, SetChecklistCard>();
  for (const group of selectedGroups) {
    const data = await getGroupData(group);
    for (const product of data.products) {
      if (isLikelySealedProduct(product.name)) continue;
      const parsed = parseProductCard(product, group.name);
      if (!parsed.name || (!parsed.cardNumber && cards.size > 220)) continue;
      const key = checklistKey(parsed.name, parsed.cardNumber);
      const existing = cards.get(key);
      if (!existing || preferChecklistProduct(parsed, existing)) cards.set(key, parsed);
    }
  }

  return Array.from(cards.values()).sort(compareChecklistCards);
}

async function tcgcsvFetch<T>(path: string): Promise<T[]> {
  const response = await fetch(`${TCGCSV_BASE}${path}`, {
    headers: { "user-agent": "PackWatcher/0.1 clips pricing" },
    next: { revalidate: 60 * 60 }
  });

  if (!response.ok) throw new Error(`TCGCSV ${response.status} for ${path}`);

  const json = await response.json() as T[] | TcgCsvCollection<T>;
  if (Array.isArray(json)) return json;
  return json.results ?? [];
}

async function getGroups() {
  groupCache ??= await tcgcsvFetch<TcgCsvGroup>(`/${POKEMON_CATEGORY_ID}/groups`);
  return groupCache;
}

async function getGroupData(group: TcgCsvGroup): Promise<CachedGroup> {
  const cached = productCache.get(group.groupId);
  if (cached) return cached;

  const [products, prices] = await Promise.all([
    tcgcsvFetch<TcgCsvProduct>(`/${POKEMON_CATEGORY_ID}/${group.groupId}/products`),
    tcgcsvFetch<TcgCsvPrice>(`/${POKEMON_CATEGORY_ID}/${group.groupId}/prices`)
  ]);
  const data = { group, products, prices };
  productCache.set(group.groupId, data);
  return data;
}

function selectGroups(groups: TcgCsvGroup[], setName?: string | null) {
  if (!setName) return groups;
  const normalizedSet = normalize(setName);
  const preferred = groups.filter((group) => normalize(group.name).includes(normalizedSet) || normalizedSet.includes(normalize(group.name)));
  const rest = groups.filter((group) => !preferred.includes(group));
  return [...preferred, ...rest];
}

function selectChecklistGroups(groups: TcgCsvGroup[], setName: string) {
  const normalizedSet = normalize(setName);
  const queryTokens = setTokens(normalizedSet);

  return groups
    .map((group) => {
      const groupName = normalize(group.name);
      const groupTokens = setTokens(groupName);
      const tokenHits = queryTokens.filter((token) => groupTokens.includes(token)).length;
      const score = groupName === normalizedSet
        ? 10
        : groupName.includes(normalizedSet) || normalizedSet.includes(groupName)
          ? 8
          : queryTokens.length
            ? tokenHits / queryTokens.length
            : 0;
      return { group, score };
    })
    .filter((item) => item.score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.group);
}

function setTokens(value: string) {
  return value.split(" ").filter((token) => token.length > 2 && !["the", "and", "set", "card", "cards"].includes(token));
}

function bestProductMatch(products: TcgCsvProduct[], input: { cardName: string; cardNumber?: string | null; variant?: string | null }) {
  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, input) }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.product ?? null;
}

function scoreProduct(product: TcgCsvProduct, input: { cardName: string; cardNumber?: string | null; variant?: string | null }) {
  const rawProductName = `${product.cleanName ?? product.name}`.toLowerCase();
  const productName = normalize(product.cleanName ?? product.name);
  const cardName = normalize(input.cardName);
  if (!productName || !cardName) return 0;

  let score = 0;
  if (productName === cardName) score += 0.95;
  else if (productName.includes(cardName) || cardName.includes(productName)) score += 0.78;
  else score += tokenSimilarity(productName, cardName) * 0.72;

  if (input.cardNumber && productName.includes(normalize(input.cardNumber))) score += 0.12;
  const variantScore = scoreVariant(rawProductName, input.variant);
  score += variantScore;

  return Math.min(1, score);
}

function scoreVariant(productName: string, variant?: string | null) {
  const requested = normalizeVariant(variant);
  if (!requested) return 0;

  const isReverse = /reverse\s*holo|reverse\s*holofoil/.test(productName);
  const isFoil = /holofoil|holo\s*foil|foil|holo/.test(productName);
  if (requested === "reverse_holo") return isReverse ? 0.16 : -0.12;
  if (requested === "foil") return isFoil && !isReverse ? 0.14 : -0.08;
  if (requested === "normal") return !isFoil ? 0.08 : -0.06;
  return 0;
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  const union = new Set([...Array.from(a), ...Array.from(b)]).size;
  return union ? intersection / union : 0;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s#-]/g, " ")
    .replace(/\b(pokemon|pok mon|tcg|holofoil|reverse holofoil|foil)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstPositive(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Number(value.toFixed(2));
  }
  return null;
}

function thisSource(product: TcgCsvProduct, group: TcgCsvGroup) {
  return `tcgcsv:${group.groupId}:${product.productId}`;
}

function productImageUrl(product: TcgCsvProduct) {
  return product.imageUrl ?? product.image_url ?? product.image ?? `https://tcgplayer-cdn.tcgplayer.com/product/${product.productId}_in_1000x1000.jpg`;
}

function parseTcgCsvCard(product: TcgCsvProduct, group: TcgCsvGroup, prices: TcgCsvPrice[] = []): TcgCsvCard {
  const rawName = product.cleanName ?? product.name;
  const extended = parseExtendedData(product.extendedData);
  const cardNumberRaw = firstText(
    extended["number"],
    extended["card number"],
    extended["collector number"],
    rawName.match(/\b[A-Z]{0,5}\s*-?\s*\d{1,4}[A-Z]?\s*\/\s*[A-Z]{0,5}\s*\d{1,4}\b/i)?.[0],
    rawName.match(/\b(?:TG|GG|RC|SV|XY|SM|SWSH|SVP|SH|H)\s*-?\s*\d{1,4}[A-Z]?\b/i)?.[0]
  );
  const normalizedNumber = normalizeCollectorNumber(cardNumberRaw);
  const variant = extractVariant(rawName);
  const name = cleanCardName(stripKnownCardMetadata(rawName, cardNumberRaw, group.name));
  const price = prices.find((item) => item.productId === product.productId);

  return {
    key: checklistKey(name, normalizedNumber?.normalized ?? cardNumberRaw),
    productId: product.productId,
    groupId: group.groupId,
    name,
    normalizedName: normalizeCardNameForMatch(name),
    setName: group.name,
    cardNumber: normalizedNumber?.normalized ?? cardNumberRaw ?? null,
    normalizedCollectorNumber: normalizedNumber?.normalized ?? null,
    collectorNumberPrefix: normalizedNumber?.prefix ?? "",
    collectorNumberNumeric: normalizedNumber?.numeric ?? null,
    collectorNumberSuffix: normalizedNumber?.suffix ?? "",
    denominator: normalizedNumber?.denominator ?? null,
    denominatorNumeric: normalizedNumber?.denominatorNumeric ?? null,
    sortKey: normalizedNumber?.sortKey ?? null,
    variant,
    rarity: firstText(extended["rarity"]),
    imageUrl: productImageUrl(product),
    marketPrice: firstPositive(price?.marketPrice, price?.midPrice, price?.lowPrice),
    sourceMetadata: {
      source: "tcgcsv",
      groupId: group.groupId,
      productId: product.productId,
      rawName: product.name,
      cleanName: product.cleanName ?? null,
      extendedData: product.extendedData ?? null,
      parsedExtendedData: extended
    }
  };
}

function parseProductCard(product: TcgCsvProduct, setName: string): SetChecklistCard {
  return parseTcgCsvCard(product, { groupId: 0, name: setName });
}

function cleanCardName(value: string) {
  return value
    .replace(/\b(reverse holofoil|holofoil|normal)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVariant(value: string) {
  const text = value.toLowerCase();
  if (/reverse\s*holo|reverse\s*holofoil/.test(text)) return "Reverse Holofoil";
  if (/holofoil|holo\s*foil|foil|holo/.test(text)) return "Holofoil";
  return null;
}

function normalizeVariant(value?: string | null) {
  const text = (value ?? "").toLowerCase();
  if (!text || text === "auto") return null;
  if (/reverse/.test(text)) return "reverse_holo";
  if (/foil|holo/.test(text)) return "foil";
  if (/normal|nonfoil|non-foil/.test(text)) return "normal";
  return null;
}

function checklistKey(name: string, cardNumber?: string | null) {
  return `${normalize(cardNumber ?? "") || "no-number"}:${normalize(name)}`;
}

function parseExtendedData(value: unknown) {
  const data: Record<string, string> = {};
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const name = firstText(record.name, record.displayName, record.key, record.label);
      const itemValue = firstText(record.value, record.displayValue, record.text);
      if (name && itemValue) data[name.toLowerCase()] = itemValue;
    }
  } else if (value && typeof value === "object") {
    for (const [key, itemValue] of Object.entries(value as Record<string, unknown>)) {
      const text = firstText(itemValue);
      if (text) data[key.toLowerCase()] = text;
    }
  }
  return data;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function stripKnownCardMetadata(rawName: string, cardNumber?: string | null, setName?: string | null) {
  let text = rawName;
  if (cardNumber) text = text.replace(cardNumber, " ");
  if (setName) text = text.replace(new RegExp(escapeRegExp(setName), "ig"), " ");
  return text
    .split(" - ")[0]
    .replace(/\b[A-Z]{0,5}\s*-?\s*\d{1,4}[A-Z]?\s*\/\s*[A-Z]{0,5}\s*\d{1,4}\b/gi, " ")
    .replace(/\b(?:TG|GG|RC|SV|XY|SM|SWSH|SVP|SH|H)\s*-?\s*\d{1,4}[A-Z]?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function preferChecklistProduct(next: SetChecklistCard, existing: SetChecklistCard) {
  if (next.cardNumber && !existing.cardNumber) return true;
  if (next.imageUrl && !existing.imageUrl) return true;
  if (!next.variant && existing.variant) return true;
  return false;
}

function compareChecklistCards(left: SetChecklistCard, right: SetChecklistCard) {
  const numberSort = compareCollectorNumbers(left.cardNumber, right.cardNumber);
  if (numberSort !== 0) return numberSort;
  return left.name.localeCompare(right.name);
}

function isLikelySealedProduct(name: string) {
  return /\b(booster|bundle|box|elite trainer|collection|tin|sleeved|blister|pack|deck|toolkit|stadium|display)\b/i.test(name);
}
