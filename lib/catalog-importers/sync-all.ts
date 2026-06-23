import type { SupabaseClient } from "@supabase/supabase-js";
import { importPokemonFromBestBuy } from "@/lib/catalog-importers/bestbuy";
import { importPokemonSealedFromTcgCsv } from "@/lib/catalog-importers/tcgcsv";
import type { CatalogImportResult } from "@/lib/catalog-importers/types";
import { upsertImportedOffers } from "@/lib/catalog-importers/upsert";

type SourceResult = CatalogImportResult & {
  source: string;
  enabled: boolean;
};

export async function syncAvailableCatalogs(supabase: SupabaseClient) {
  const sources: SourceResult[] = [];

  try {
    const imported = await importPokemonSealedFromTcgCsv({
      maxGroups: Number(process.env.TCGCSV_MAX_GROUPS ?? 250),
      maxProducts: Number(process.env.TCGCSV_MAX_PRODUCTS ?? 5000)
    });
    const result = await upsertImportedOffers(supabase, imported.offers);
    sources.push({
      source: "tcgcsv-pokemon-sealed",
      enabled: true,
      ...result,
      errors: [...imported.errors, ...result.errors]
    });
  } catch (error) {
    sources.push({
      source: "tcgcsv-pokemon-sealed",
      enabled: true,
      productsUpserted: 0,
      offersUpserted: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : "TCGCSV import failed"]
    });
  }

  if (process.env.BESTBUY_API_KEY) {
    try {
      const imported = await importPokemonFromBestBuy({
        query: process.env.BESTBUY_IMPORT_QUERY ?? "pokemon trading cards",
        pageSize: Number(process.env.BESTBUY_IMPORT_PAGE_SIZE ?? 100)
      });
      const result = await upsertImportedOffers(supabase, imported.offers);
      sources.push({
        source: "bestbuy-pokemon",
        enabled: true,
        ...result,
        errors: [...imported.errors, ...result.errors]
      });
    } catch (error) {
      sources.push({
        source: "bestbuy-pokemon",
        enabled: true,
        productsUpserted: 0,
        offersUpserted: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Best Buy import failed"]
      });
    }
  } else {
    sources.push({
      source: "bestbuy-pokemon",
      enabled: false,
      productsUpserted: 0,
      offersUpserted: 0,
      skipped: 0,
      errors: ["BESTBUY_API_KEY is not configured."]
    });
  }

  return {
    sources,
    totals: sources.reduce(
      (sum, source) => ({
        productsUpserted: sum.productsUpserted + source.productsUpserted,
        offersUpserted: sum.offersUpserted + source.offersUpserted,
        skipped: sum.skipped + source.skipped,
        errors: sum.errors + source.errors.length
      }),
      { productsUpserted: 0, offersUpserted: 0, skipped: 0, errors: 0 }
    )
  };
}

export async function syncAvailableCatalogsQuick(supabase: SupabaseClient) {
  const sources: SourceResult[] = [];

  try {
    const imported = await importPokemonSealedFromTcgCsv({
      maxGroups: Number(process.env.TCGCSV_QUICK_MAX_GROUPS ?? 40),
      maxProducts: Number(process.env.TCGCSV_QUICK_MAX_PRODUCTS ?? 1000)
    });
    const result = await upsertImportedOffers(supabase, imported.offers);
    sources.push({
      source: "tcgcsv-pokemon-sealed-quick",
      enabled: true,
      ...result,
      errors: [...imported.errors, ...result.errors]
    });
  } catch (error) {
    sources.push({
      source: "tcgcsv-pokemon-sealed-quick",
      enabled: true,
      productsUpserted: 0,
      offersUpserted: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : "TCGCSV quick import failed"]
    });
  }

  if (process.env.BESTBUY_API_KEY) {
    try {
      const imported = await importPokemonFromBestBuy({
        query: process.env.BESTBUY_IMPORT_QUERY ?? "pokemon trading cards",
        pageSize: Number(process.env.BESTBUY_IMPORT_PAGE_SIZE ?? 100)
      });
      const result = await upsertImportedOffers(supabase, imported.offers);
      sources.push({
        source: "bestbuy-pokemon",
        enabled: true,
        ...result,
        errors: [...imported.errors, ...result.errors]
      });
    } catch (error) {
      sources.push({
        source: "bestbuy-pokemon",
        enabled: true,
        productsUpserted: 0,
        offersUpserted: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Best Buy import failed"]
      });
    }
  }

  return {
    sources,
    totals: sources.reduce(
      (sum, source) => ({
        productsUpserted: sum.productsUpserted + source.productsUpserted,
        offersUpserted: sum.offersUpserted + source.offersUpserted,
        skipped: sum.skipped + source.skipped,
        errors: sum.errors + source.errors.length
      }),
      { productsUpserted: 0, offersUpserted: 0, skipped: 0, errors: 0 }
    )
  };
}
