import type { SupabaseClient } from "@supabase/supabase-js";
import { checkExistingCatalogOffers } from "@/lib/catalog/check-offers";
import { importPokemonFromBestBuy } from "@/lib/catalog-importers/bestbuy";
import { importPokemonFromRetailerSearch } from "@/lib/catalog-importers/retailer-search";
import { importPokemonSealedFromTcgCsv } from "@/lib/catalog-importers/tcgcsv";
import type { CatalogImportResult } from "@/lib/catalog-importers/types";
import { upsertImportedCatalog } from "@/lib/catalog-importers/upsert";

type SourceResult = CatalogImportResult & {
  source: string;
  enabled: boolean;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
};

function emptyResult(): CatalogImportResult {
  return { productsUpserted: 0, offersUpserted: 0, offersChecked: 0, alertsTriggered: 0, skippedCount: 0, errors: [] };
}

function totals(sources: SourceResult[]) {
  return sources.reduce(
    (sum, source) => ({
      productsImported: sum.productsImported + source.productsUpserted,
      offersImported: sum.offersImported + source.offersUpserted,
      offersChecked: sum.offersChecked + source.offersChecked,
      alertsTriggered: sum.alertsTriggered + source.alertsTriggered,
      errors: sum.errors + source.errors.length
    }),
    { productsImported: 0, offersImported: 0, offersChecked: 0, alertsTriggered: 0, errors: 0 }
  );
}

export async function syncAvailableCatalogs(supabase: SupabaseClient) {
  console.log("[catalog-sync] sync started");
  const sources: SourceResult[] = [];

  try {
    console.log("[catalog-sync] source started: tcgcsv");
    const imported = await importPokemonSealedFromTcgCsv({
      maxGroups: Number(process.env.TCGCSV_MAX_GROUPS ?? 250),
      maxProducts: Number(process.env.TCGCSV_MAX_PRODUCTS ?? 5000)
    });
    const result = await upsertImportedCatalog(supabase, imported);
    sources.push({
      source: "tcgcsv",
      enabled: true,
      ok: result.errors.length === 0,
      ...result,
      errors: result.errors
    });
    console.log(`[catalog-sync] tcgcsv products=${result.productsUpserted} offers=${result.offersUpserted}`);
  } catch (error) {
    sources.push({
      source: "tcgcsv",
      enabled: true,
      ok: false,
      ...emptyResult(),
      errors: [error instanceof Error ? error.message : "TCGCSV import failed"]
    });
  }

  if (process.env.BESTBUY_API_KEY) {
    try {
      console.log("[catalog-sync] source started: bestbuy");
      const imported = await importPokemonFromBestBuy({
        query: process.env.BESTBUY_IMPORT_QUERY ?? "pokemon trading cards",
        pageSize: Number(process.env.BESTBUY_IMPORT_PAGE_SIZE ?? 100)
      });
      const result = await upsertImportedCatalog(supabase, imported);
      sources.push({
        source: "bestbuy",
        enabled: true,
        ok: result.errors.length === 0,
        ...result,
        errors: result.errors
      });
      console.log(`[catalog-sync] bestbuy products=${result.productsUpserted} offers=${result.offersUpserted}`);
    } catch (error) {
      sources.push({
        source: "bestbuy",
        enabled: true,
        ok: false,
        ...emptyResult(),
        errors: [error instanceof Error ? error.message : "Best Buy import failed"]
      });
    }
  } else {
    sources.push({
      source: "bestbuy",
      enabled: false,
      ok: false,
      skipped: true,
      reason: "BESTBUY_API_KEY missing",
      ...emptyResult(),
      errors: []
    });
  }

  const retailerSearchEnabled = ["TARGET_SEARCH_IMPORT", "WALMART_SEARCH_IMPORT", "GAMESTOP_SEARCH_IMPORT"]
    .some((key) => process.env[key] === "true");

  if (retailerSearchEnabled) {
    try {
      console.log("[catalog-sync] source started: retailer-search");
      const imported = await importPokemonFromRetailerSearch({
        perRetailerLimit: Number(process.env.RETAILER_SEARCH_LIMIT ?? 12)
      });
      const result = await upsertImportedCatalog(supabase, imported);
      sources.push({
        source: "retailer-search",
        enabled: true,
        ok: result.errors.length === 0,
        ...result,
        errors: result.errors
      });
      console.log(`[catalog-sync] retailer-search products=${result.productsUpserted} offers=${result.offersUpserted}`);
    } catch (error) {
      sources.push({
        source: "retailer-search",
        enabled: true,
        ok: false,
        ...emptyResult(),
        errors: [error instanceof Error ? error.message : "Retailer search import failed"]
      });
    }
  } else {
    sources.push({
      source: "retailer-search",
      enabled: false,
      ok: false,
      skipped: true,
      reason: "TARGET_SEARCH_IMPORT, WALMART_SEARCH_IMPORT, and GAMESTOP_SEARCH_IMPORT are disabled",
      ...emptyResult(),
      errors: []
    });
  }

  console.log("[catalog-sync] checking existing offers");
  const checked = await checkExistingCatalogOffers(supabase);
  sources.push({
    source: "offer-checks",
    enabled: true,
    ok: checked.errors.length === 0,
    productsUpserted: 0,
    offersUpserted: 0,
    offersChecked: checked.offersChecked,
    alertsTriggered: checked.alertsTriggered,
    skippedCount: 0,
    errors: checked.errors
  });

  const total = totals(sources);
  console.log(`[catalog-sync] completed products=${total.productsImported} offers=${total.offersImported} checked=${total.offersChecked} alerts=${total.alertsTriggered} errors=${total.errors}`);

  return {
    ok: total.errors === 0,
    productsImported: total.productsImported,
    offersImported: total.offersImported,
    offersChecked: total.offersChecked,
    alertsTriggered: total.alertsTriggered,
    sources: Object.fromEntries(sources.map((source) => [source.source, source])),
    errors: sources.flatMap((source) => source.errors.map((message) => `${source.source}: ${message}`))
  };
}

export async function syncAvailableCatalogsQuick(supabase: SupabaseClient) {
  console.log("[catalog-sync] quick sync started");
  const sources: SourceResult[] = [];

  try {
    const imported = await importPokemonSealedFromTcgCsv({
      maxGroups: Number(process.env.TCGCSV_QUICK_MAX_GROUPS ?? 40),
      maxProducts: Number(process.env.TCGCSV_QUICK_MAX_PRODUCTS ?? 1000)
    });
    const result = await upsertImportedCatalog(supabase, imported);
    sources.push({
      source: "tcgcsv-quick",
      enabled: true,
      ok: result.errors.length === 0,
      ...result,
      errors: result.errors
    });
  } catch (error) {
    sources.push({
      source: "tcgcsv-quick",
      enabled: true,
      ok: false,
      ...emptyResult(),
      errors: [error instanceof Error ? error.message : "TCGCSV quick import failed"]
    });
  }

  const total = totals(sources);
  console.log(`[catalog-sync] quick completed products=${total.productsImported} offers=${total.offersImported} errors=${total.errors}`);

  return {
    ok: total.errors === 0,
    productsImported: total.productsImported,
    offersImported: total.offersImported,
    offersChecked: 0,
    alertsTriggered: 0,
    sources: Object.fromEntries(sources.map((source) => [source.source, source])),
    errors: sources.flatMap((source) => source.errors.map((message) => `${source.source}: ${message}`))
  };
}
