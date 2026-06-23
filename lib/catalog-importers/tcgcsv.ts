import type { ImportedCatalogOffer, ImportedCatalogProduct } from "@/lib/catalog-importers/types";

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
  results?: T[];
};

type TcgCsvGroup = {
  groupId: number;
  name: string;
  abbreviation?: string | null;
};

type TcgCsvProduct = {
  productId: number;
  name: string;
  cleanName?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  categoryName?: string | null;
  groupName?: string | null;
};

type TcgCsvPrice = {
  productId: number;
  marketPrice?: number | null;
  midPrice?: number | null;
  lowPrice?: number | null;
};

async function tcgcsvFetch<T>(path: string): Promise<T[]> {
  console.log(`[catalog-sync] TCGCSV fetch ${path}`);
  const response = await fetch(`${TCGCSV_BASE}${path}`, {
    headers: { "user-agent": "PackWatcher/0.1 catalog importer" },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`TCGCSV ${response.status} for ${path}`);
  }

  const json = await response.json() as T[] | TcgCsvCollection<T>;
  if (Array.isArray(json)) return json;
  return json.results ?? [];
}

function isSealedProduct(product: TcgCsvProduct) {
  const name = product.name.toLowerCase();
  return sealedTerms.some((term) => name.includes(term));
}

function productType(product: TcgCsvProduct) {
  const name = product.name.toLowerCase();
  if (name.includes("elite trainer box") || name.includes(" etb")) return "Elite Trainer Box";
  if (name.includes("booster box")) return "Booster Box";
  if (name.includes("booster bundle")) return "Booster Bundle";
  if (name.includes("booster pack") || name.includes("blister")) return "Booster Pack";
  if (name.includes("tin")) return "Tin";
  if (name.includes("collection")) return "Collection Box";
  return "Sealed Product";
}

function priceFor(productId: number, prices: TcgCsvPrice[]) {
  const price = prices.find((item) => item.productId === productId);
  return price?.marketPrice ?? price?.midPrice ?? price?.lowPrice ?? null;
}

function tcgplayerUrl(product: TcgCsvProduct) {
  return product.url ?? `https://www.tcgplayer.com/product/${product.productId}`;
}

export async function importPokemonSealedFromTcgCsv(options: { maxGroups?: number; maxProducts?: number } = {}) {
  const maxGroups = options.maxGroups ?? 30;
  const maxProducts = options.maxProducts ?? 500;
  const groups = await tcgcsvFetch<TcgCsvGroup>(`/${POKEMON_CATEGORY_ID}/groups`);
  const products: ImportedCatalogProduct[] = [];
  const offers: ImportedCatalogOffer[] = [];
  const errors: string[] = [];

  console.log(`[catalog-sync] TCGCSV groups found: ${groups.length}`);

  const selectedGroups = groups.slice(0, maxGroups);
  const batchSize = 5;

  for (let index = 0; index < selectedGroups.length && products.length < maxProducts; index += batchSize) {
    const batch = selectedGroups.slice(index, index + batchSize);
    const results = await Promise.all(batch.map(async (group) => {
      try {
        const [groupProducts, prices] = await Promise.all([
          tcgcsvFetch<TcgCsvProduct>(`/${POKEMON_CATEGORY_ID}/${group.groupId}/products`),
          tcgcsvFetch<TcgCsvPrice>(`/${POKEMON_CATEGORY_ID}/${group.groupId}/prices`)
        ]);
        return { group, groupProducts, prices, error: null };
      } catch (error) {
        return { group, groupProducts: [] as TcgCsvProduct[], prices: [] as TcgCsvPrice[], error };
      }
    }));

    for (const result of results) {
      if (result.error) {
        errors.push(result.error instanceof Error ? result.error.message : `Failed group ${result.group.name}`);
        continue;
      }

      const sealedProducts = result.groupProducts.filter(isSealedProduct);
      console.log(`[catalog-sync] TCGCSV ${result.group.name}: ${sealedProducts.length} sealed products`);

      for (const product of sealedProducts) {
        if (products.length >= maxProducts) break;

        const title = product.cleanName || product.name;
        const importedProduct: ImportedCatalogProduct = {
          source: "tcgcsv",
          sourceProductId: String(product.productId),
          title,
          brand: "Pokemon",
          tcg: "pokemon",
          category: "Sealed Product",
          setName: product.groupName ?? result.group.name,
          seriesName: result.group.name,
          productType: productType(product),
          imageUrl: product.imageUrl?.replace("_200w", "_in_1000x1000") ?? null,
          msrp: null,
          metadata: {
            groupId: result.group.groupId,
            groupName: result.group.name,
            categoryName: product.categoryName ?? null
          }
        };

        products.push(importedProduct);
        offers.push({
          ...importedProduct,
          storeName: "TCGplayer",
          retailerProductId: String(product.productId),
          url: tcgplayerUrl(product),
          lastPrice: priceFor(product.productId, result.prices),
          status: "unknown",
          availabilityText: "Trackable marketplace listing"
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.log(`[catalog-sync] TCGCSV products prepared: ${products.length}, offers prepared: ${offers.length}`);
  return { products, offers, errors };
}
