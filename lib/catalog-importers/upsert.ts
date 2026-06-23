import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogImportResult, ImportedCatalogOffer, ImportedCatalogPayload, ImportedCatalogProduct } from "@/lib/catalog-importers/types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

function productRow(product: ImportedCatalogProduct) {
  return {
    source: product.source,
    source_product_id: product.sourceProductId,
    source_id: product.sourceProductId,
    slug: product.slug ?? slugify(`${product.source}-${product.sourceProductId}-${product.title}`),
    name: product.title,
    title: product.title,
    brand: product.brand ?? "Pokemon",
    tcg: product.tcg,
    category: product.category,
    set_name: product.setName,
    series_name: product.seriesName ?? null,
    product_type: product.productType ?? product.category,
    image_url: product.imageUrl,
    msrp: product.msrp,
    metadata: product.metadata ?? {},
    updated_at: new Date().toISOString()
  };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function upsertImportedCatalog(supabase: SupabaseClient, payload: ImportedCatalogPayload): Promise<CatalogImportResult> {
  const result: CatalogImportResult = { productsUpserted: 0, offersUpserted: 0, offersChecked: 0, alertsTriggered: 0, skippedCount: 0, errors: [...payload.errors] };
  const productsByKey = new Map<string, ImportedCatalogProduct>();
  const productIdsByKey = new Map<string, string>();

  for (const product of payload.products) {
    productsByKey.set(`${product.source}:${product.sourceProductId}`, product);
  }

  for (const offer of payload.offers) {
    productsByKey.set(`${offer.source}:${offer.sourceProductId}`, offer);
  }

  for (const productBatch of chunks(Array.from(productsByKey.values()), 200)) {
    try {
      const { data, error } = await supabase
        .from("catalog_products")
        .upsert(productBatch.map(productRow), { onConflict: "source,source_product_id" })
        .select("id,source,source_product_id");

      if (error) {
        result.errors.push(error.message);
        continue;
      }

      for (const product of data ?? []) {
        productIdsByKey.set(`${product.source}:${product.source_product_id}`, product.id);
      }
      result.productsUpserted += data?.length ?? productBatch.length;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Unknown product upsert error");
    }
  }

  for (const offerBatch of chunks(payload.offers, 200)) {
    try {
      const prepared = offerBatch.flatMap((offer) => {
        const productId = productIdsByKey.get(`${offer.source}:${offer.sourceProductId}`);
        if (!productId) {
          result.errors.push(`No product returned for ${offer.title}`);
          return [];
        }

        const base = {
          catalog_product_id: productId,
          product_id: productId,
          store_name: offer.storeName,
          retailer: offer.storeName,
          retailer_product_id: offer.retailerProductId ?? null,
          title: offer.title,
          url: offer.url,
          status: offer.status,
          last_price: offer.lastPrice,
          price: offer.lastPrice,
          currency: "USD",
          image_url: offer.imageUrl,
          metadata: offer.metadata ?? {},
          updated_at: new Date().toISOString()
        };

        if (offer.status === "unknown") {
          return [{ row: base, hasLiveStatus: false }];
        }

        return [{
          row: {
            ...base,
            status: offer.status,
            in_stock: offer.status === "in_stock",
            availability_text: offer.availabilityText ?? offer.status.replaceAll("_", " "),
            last_checked_at: new Date().toISOString()
          },
          hasLiveStatus: true
        }];
      });

      if (!prepared.length) continue;

      const identityRows = prepared.filter((item) => !item.hasLiveStatus).map((item) => item.row);
      const liveRows = prepared.filter((item) => item.hasLiveStatus).map((item) => item.row);

      for (const rows of [identityRows, liveRows]) {
        if (!rows.length) continue;
        const { error: offerError } = await supabase
          .from("catalog_offers")
          .upsert(rows, { onConflict: "catalog_product_id,store_name,url" });

        if (offerError) {
          result.errors.push(offerError.message);
          continue;
        }

        result.offersUpserted += rows.length;
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Unknown offer upsert error");
    }
  }

  return result;
}

export async function upsertImportedOffers(supabase: SupabaseClient, offers: ImportedCatalogOffer[]): Promise<CatalogImportResult> {
  return upsertImportedCatalog(supabase, { products: offers, offers, errors: [] });
}
