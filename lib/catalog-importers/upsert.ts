import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogImportResult, ImportedCatalogOffer } from "@/lib/catalog-importers/types";

export async function upsertImportedOffers(supabase: SupabaseClient, offers: ImportedCatalogOffer[]): Promise<CatalogImportResult> {
  const result: CatalogImportResult = { productsUpserted: 0, offersUpserted: 0, skipped: 0, errors: [] };

  for (const offer of offers) {
    try {
      const { data: product, error: productError } = await supabase
        .from("catalog_products")
        .upsert({
          source: offer.source,
          source_product_id: offer.sourceProductId,
          name: offer.name,
          tcg: offer.tcg,
          category: offer.category,
          set_name: offer.setName,
          image_url: offer.imageUrl,
          msrp: offer.msrp
        }, { onConflict: "source,source_product_id" })
        .select("id")
        .single();

      if (productError || !product) {
        result.errors.push(productError?.message ?? `No product returned for ${offer.name}`);
        continue;
      }

      result.productsUpserted += 1;

      const { error: offerError } = await supabase
        .from("catalog_offers")
        .upsert({
          catalog_product_id: product.id,
          store_name: offer.storeName,
          url: offer.url,
          status: offer.status,
          last_price: offer.lastPrice,
          last_checked_at: new Date().toISOString()
        }, { onConflict: "catalog_product_id,store_name,url" });

      if (offerError) {
        result.errors.push(offerError.message);
        continue;
      }

      result.offersUpserted += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Unknown catalog import error");
    }
  }

  return result;
}
