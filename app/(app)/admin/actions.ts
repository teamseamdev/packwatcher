"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdmin, requireProfile } from "@/lib/auth";
import type { ImportedCatalogOffer } from "@/lib/catalog-importers/types";
import { importPokemonFromBestBuy } from "@/lib/catalog-importers/bestbuy";
import { importPokemonFromRetailerSearch } from "@/lib/catalog-importers/retailer-search";
import { syncAvailableCatalogs } from "@/lib/catalog-importers/sync-all";
import { importPokemonSealedFromTcgCsv } from "@/lib/catalog-importers/tcgcsv";
import { upsertImportedCatalog, upsertImportedOffers } from "@/lib/catalog-importers/upsert";
import { fetchProductMetadata } from "@/lib/product-metadata";
import { sendPushToUser } from "@/lib/push";
import { getAdapter } from "@/lib/stock-checkers";
import { runProductCheck } from "@/lib/stock-checkers/run-check";
import { createAdminClient } from "@/lib/supabase/admin";

const CatalogOfferSchema = z.object({
  name: z.string().min(1),
  tcg: z.string().min(1).default("pokemon"),
  category: z.string().optional(),
  set_name: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
  msrp: z.coerce.number().optional(),
  store_name: z.string().min(1),
  url: z.string().url(),
  last_price: z.coerce.number().optional()
});

const UserPlanSchema = z.object({
  user_id: z.string().uuid(),
  plan: z.enum(["free", "pro", "admin"])
});

const TestNotificationSchema = z.object({
  user_id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  send_push: z.coerce.boolean().optional()
});

export async function adminCheckProduct(productId: string) {
  const { profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");
  await runProductCheck(productId, { enforceRateLimit: false });
  revalidatePath("/admin");
}

export async function updateUserPlan(formData: FormData) {
  const { supabase, profile, user } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");
  const parsed = UserPlanSchema.parse(Object.fromEntries(formData));

  if (parsed.user_id === user.id && parsed.plan !== "admin") {
    throw new Error("You cannot remove your own admin access from this panel.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ plan: parsed.plan })
    .eq("id", parsed.user_id);

  if (error) throw new Error(error.message);

  const admin = createAdminClient();
  const { error: billingError } = await admin
    .from("billing_status")
    .upsert({
      user_id: parsed.user_id,
      plan: parsed.plan,
      status: parsed.plan === "free" ? "inactive" : "active"
    }, { onConflict: "user_id" });

  if (billingError) throw new Error(billingError.message);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/account");
}

export async function sendAdminTestNotification(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");
  const parsed = TestNotificationSchema.parse(Object.fromEntries(formData));

  const { data: recipients } = parsed.user_id === "all"
    ? await supabase.from("profiles").select("id").order("created_at", { ascending: false }).limit(100)
    : await supabase.from("profiles").select("id").eq("id", parsed.user_id).limit(1);

  const recipientIds = (recipients ?? []).map((recipient) => recipient.id as string);
  if (!recipientIds.length) throw new Error("No notification recipients found.");

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    tracked_product_id: null,
    type: "admin_test",
    title: parsed.title,
    message: parsed.message
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) throw new Error(error.message);

  if (parsed.send_push) {
    for (const userId of recipientIds) {
      await sendPushToUser(userId, {
        title: parsed.title,
        body: parsed.message,
        url: "/alerts"
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/alerts");
}

export async function addCatalogOffer(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const parsed = CatalogOfferSchema.parse(Object.fromEntries(formData));
  const { data: product, error } = await supabase
    .from("catalog_products")
    .insert({
      name: parsed.name,
      title: parsed.name,
      brand: parsed.tcg.toLowerCase() === "pokemon" ? "Pokemon" : parsed.tcg,
      tcg: parsed.tcg,
      category: parsed.category || null,
      set_name: parsed.set_name || null,
      product_type: parsed.category || "Sealed Product",
      image_url: parsed.image_url || null,
      msrp: parsed.msrp || null
    })
    .select("id")
    .single();

  if (error || !product) {
    throw new Error(error?.message ?? "Could not create catalog product.");
  }

  await supabase.from("catalog_offers").insert({
    catalog_product_id: product.id,
    product_id: product.id,
    store_name: parsed.store_name,
    retailer: parsed.store_name,
    title: parsed.name,
    url: parsed.url,
    status: "unknown",
    in_stock: false,
    availability_text: "Trackable",
    last_price: parsed.last_price || parsed.msrp || null,
    price: parsed.last_price || parsed.msrp || null
  });

  revalidatePath("/admin");
  revalidatePath("/watchlist");
}

export async function importTcgCsvPokemonCatalog(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const maxGroups = Number(formData.get("max_groups") ?? 30);
  const maxProducts = Number(formData.get("max_products") ?? 500);
  const imported = await importPokemonSealedFromTcgCsv({ maxGroups, maxProducts });
  await upsertImportedCatalog(supabase, imported);

  revalidatePath("/admin");
  revalidatePath("/watchlist");
}

export async function importBestBuyPokemonCatalog(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const query = String(formData.get("query") ?? "pokemon trading cards");
  const pageSize = Number(formData.get("page_size") ?? 50);
  const imported = await importPokemonFromBestBuy({ query, pageSize });
  await upsertImportedCatalog(supabase, imported);

  revalidatePath("/admin");
  revalidatePath("/watchlist");
}

export async function importRetailerSearchCatalog(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const retailer = String(formData.get("retailer") ?? "target");
  const query = String(formData.get("query") ?? "pokemon cards");
  const limit = Number(formData.get("limit") ?? 8);

  const imported = await importPokemonFromRetailerSearch({
    perRetailerLimit: limit,
    sourceKeys: [retailer],
    query
  });
  await upsertImportedCatalog(supabase, imported);

  revalidatePath("/admin");
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}

export async function syncAllAvailableCatalogs() {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const result = await syncAvailableCatalogs(supabase);

  revalidatePath("/admin");
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");

  return result;
}

export type SyncActionState = {
  ok: boolean | null;
  result?: Awaited<ReturnType<typeof syncAvailableCatalogs>>;
  error?: string;
};

export async function syncAllAvailableCatalogsWithState(
  _previousState: SyncActionState,
  _formData: FormData
): Promise<SyncActionState> {
  try {
    const result = await syncAllAvailableCatalogs();
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Catalog sync failed." };
  }
}

function storeNameFromUrl(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (/pokemoncenter\.com/i.test(host)) return "Pokemon Center";
  if (/amazon\.com/i.test(host)) return "Amazon";
  if (/target\.com/i.test(host)) return "Target";
  if (/walmart\.com/i.test(host)) return "Walmart";
  if (/bestbuy\.com/i.test(host)) return "Best Buy";
  return host.split(".").slice(0, -1).join(".") || host;
}

export async function importRetailerUrlsToCatalog(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const rawUrls = String(formData.get("urls") ?? "");
  const fallbackSetName = String(formData.get("set_name") ?? "").trim() || null;
  const urls = rawUrls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);

  const offers: ImportedCatalogOffer[] = [];

  for (const url of urls) {
    try {
      const storeName = storeNameFromUrl(url);
      const metadata = await fetchProductMetadata(url).catch(() => null);
      const adapter = getAdapter(url, storeName);
      const check = await adapter.check({ id: url, url, storeName }).catch(() => null);
      const sourceProductId = createHash("sha256").update(url).digest("hex").slice(0, 32);

      offers.push({
        source: `url-${storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        sourceProductId,
        title: metadata?.title || check?.title || `${storeName} Pokemon product`,
        brand: "Pokemon",
        tcg: "pokemon",
        category: "Sealed Product",
        setName: fallbackSetName,
        seriesName: fallbackSetName,
        productType: "Sealed Product",
        imageUrl: metadata?.imageUrl || check?.imageUrl || null,
        msrp: metadata?.price ?? check?.price ?? null,
        storeName,
        retailerProductId: sourceProductId,
        url,
        lastPrice: check?.price ?? metadata?.price ?? null,
        status: check?.status ?? "unknown",
        availabilityText: check?.rawMatchReason ?? "Trackable retailer URL"
      });

      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch {
      // Keep bulk imports moving; failed lines can be retried individually.
    }
  }

  await upsertImportedOffers(supabase, offers);

  revalidatePath("/admin");
  revalidatePath("/watchlist");
}

export async function approveProductMatch(formData: FormData) {
  const { supabase, profile, user } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const reviewId = String(formData.get("review_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  if (!reviewId || !productId) throw new Error("Review ID and product ID are required.");

  await supabase
    .from("product_match_reviews")
    .update({
      product_id: productId,
      suggested_product_id: productId,
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", reviewId);

  revalidatePath("/admin");
}

export async function rejectProductMatch(formData: FormData) {
  const { supabase, profile, user } = await requireProfile();
  if (!isAdmin(profile)) throw new Error("Admin access required.");

  const reviewId = String(formData.get("review_id") ?? "");
  if (!reviewId) throw new Error("Review ID is required.");

  await supabase
    .from("product_match_reviews")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", reviewId);

  revalidatePath("/admin");
}
