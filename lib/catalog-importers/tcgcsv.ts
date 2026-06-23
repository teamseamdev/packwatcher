import type { ImportedCatalogOffer } from "@/lib/catalog-importers/types";

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const POKEMON_CATEGORY_ID = 3;
const sealedTerms = [
  "booster box",
  "booster bundle",
  "elite trainer box",
  "etb",
  "collection box",
  "collector chest",
  "ultra-premium",
  "premium collection",
  "tin",
  "mini tin",
  "booster pack",
  "blister",
  "build & battle",
  "battle deck",
  "trainer toolkit",
  "poster collection",
  "binder collection"
];

type TcgCsvCollection<T> = {
  results: T[];
};

type TcgCsvGroup = {
  groupId: number;
  name: string;
};

type TcgCsvProduct = {
  productId: number;
  name: string;
  cleanName?: string | null;
  imageUrl?: string | null;
  url?: string | null;
};

type TcgCsvPrice = {
  productId: number;
  marketPrice?: number | null;
  midPrice?: number | null;
  lowPrice?: number | null;
};

async function tcgcsvFetch<T>(path: string): Promise<TcgCsvCollection<T>> {
  const response = await fetch(`${TCGCSV_BASE}${path}`, {
    headers: { "user-agent": "PackWatcher/0.1 catalog importer" },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`TCGCSV ${response.status} for ${path}`);
  }

  return response.json() as Promise<TcgCsvCollection<T>>;
}

function isSealedProduct(product: TcgCsvProduct) {
  const name = product.name.toLowerCase();
  return sealedTerms.some((term) => name.includes(term));
}

function priceFor(productId: number, prices: TcgCsvPrice[]) {
  const price = prices.find((item) => item.productId === productId);
  return price?.marketPrice ?? price?.midPrice ?? price?.lowPrice ?? null;
}

export async function importPokemonSealedFromTcgCsv(options: { maxGroups?: number; maxProducts?: number } = {}) {
  const maxGroups = options.maxGroups ?? 30;
  const maxProducts = options.maxProducts ?? 500;
  const groups = await tcgcsvFetch<TcgCsvGroup>(`/${POKEMON_CATEGORY_ID}/groups`);
  const offers: ImportedCatalogOffer[] = [];
  const errors: string[] = [];

  for (const group of groups.results.slice(0, maxGroups)) {
    if (offers.length >= maxProducts) break;

    try {
      const [products, prices] = await Promise.all([
        tcgcsvFetch<TcgCsvProduct>(`/${POKEMON_CATEGORY_ID}/${group.groupId}/products`),
        tcgcsvFetch<TcgCsvPrice>(`/${POKEMON_CATEGORY_ID}/${group.groupId}/prices`)
      ]);

      for (const product of products.results.filter(isSealedProduct)) {
        if (offers.length >= maxProducts) break;
        if (!product.url) continue;

        offers.push({
          source: "tcgcsv",
          sourceProductId: String(product.productId),
          name: product.cleanName || product.name,
          tcg: "pokemon",
          category: "Sealed Product",
          setName: group.name,
          imageUrl: product.imageUrl?.replace("_200w", "_in_1000x1000") ?? null,
          msrp: null,
          storeName: "TCGplayer",
          url: product.url,
          lastPrice: priceFor(product.productId, prices.results),
          status: "unknown"
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 125));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed group ${group.name}`);
    }
  }

  return { offers, errors };
}
