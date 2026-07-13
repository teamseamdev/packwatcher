export type PricingCandidate = {
  value: number;
  currency: "USD";
  source: string;
  confidence: number;
  label?: string | null;
  imageUrl?: string | null;
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

function bestProductMatch(products: TcgCsvProduct[], input: { cardName: string; cardNumber?: string | null; variant?: string | null }) {
  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, input) }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.product ?? null;
}

function scoreProduct(product: TcgCsvProduct, input: { cardName: string; cardNumber?: string | null; variant?: string | null }) {
  const productName = normalize(product.cleanName ?? product.name);
  const cardName = normalize(input.cardName);
  if (!productName || !cardName) return 0;

  let score = 0;
  if (productName === cardName) score += 0.95;
  else if (productName.includes(cardName) || cardName.includes(productName)) score += 0.78;
  else score += tokenSimilarity(productName, cardName) * 0.72;

  if (input.cardNumber && productName.includes(normalize(input.cardNumber))) score += 0.12;
  if (input.variant && productName.includes(normalize(input.variant))) score += 0.08;

  return Math.min(1, score);
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
  return product.imageUrl ?? product.image_url ?? product.image ?? null;
}
