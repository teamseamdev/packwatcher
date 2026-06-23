import type { ImportedCatalogOffer } from "@/lib/catalog-importers/types";

type BestBuyProduct = {
  sku: number;
  name: string;
  salePrice?: number | null;
  regularPrice?: number | null;
  url?: string | null;
  image?: string | null;
  onlineAvailability?: boolean | null;
  active?: boolean | null;
};

type BestBuyResponse = {
  products: BestBuyProduct[];
};

export async function importPokemonFromBestBuy(options: { query?: string; pageSize?: number } = {}) {
  const apiKey = process.env.BESTBUY_API_KEY;
  if (!apiKey) {
    throw new Error("BESTBUY_API_KEY is not configured.");
  }

  const query = options.query ?? "pokemon trading cards";
  const pageSize = options.pageSize ?? 50;
  const url = new URL(`https://api.bestbuy.com/v1/products((search=${encodeURIComponent(query)}))`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("show", "sku,name,salePrice,regularPrice,url,image,onlineAvailability,active");

  const response = await fetch(url, { next: { revalidate: 0 } });
  if (!response.ok) {
    throw new Error(`Best Buy API ${response.status}`);
  }

  const data = await response.json() as BestBuyResponse;
  const offers: ImportedCatalogOffer[] = data.products
    .filter((product) => product.active !== false && product.url)
    .map((product) => ({
      source: "bestbuy",
      sourceProductId: String(product.sku),
      name: product.name,
      tcg: "pokemon",
      category: "Sealed Product",
      setName: null,
      imageUrl: product.image ?? null,
      msrp: product.regularPrice ?? null,
      storeName: "Best Buy",
      url: product.url!,
      lastPrice: product.salePrice ?? product.regularPrice ?? null,
      status: product.onlineAvailability ? "in_stock" : "out_of_stock"
    }));

  return { offers, errors: [] as string[] };
}
