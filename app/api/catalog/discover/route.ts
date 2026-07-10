import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importPokemonFromRetailerSearch } from "@/lib/catalog-importers/retailer-search";
import { upsertImportedCatalog } from "@/lib/catalog-importers/upsert";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const searchAttempts = new Map<string, number>();

function rateLimitKey(userId: string, query: string) {
  return `${userId}:${query.toLowerCase().trim()}`;
}

function assertRateLimit(userId: string, query: string) {
  const key = rateLimitKey(userId, query);
  const now = Date.now();
  const previous = searchAttempts.get(key) ?? 0;
  if (now - previous < 60_000) {
    throw new Error("Please wait a minute before running retailer discovery for this search again.");
  }
  searchAttempts.set(key, now);
}

async function recordSearch(admin: ReturnType<typeof createAdminClient>, query: string) {
  const normalized = query.trim();
  if (normalized.length < 3) return;

  const { data } = await admin
    .from("catalog_products")
    .select("id,search_count")
    .ilike("name", `%${normalized.replaceAll("%", "").replaceAll("_", "")}%`)
    .limit(12);

  for (const product of data ?? []) {
    await admin
      .from("catalog_products")
      .update({
        search_count: Number(product.search_count ?? 0) + 1,
        popularity_score: Number(product.search_count ?? 0) + 1
      })
      .eq("id", product.id);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to search retailer listings." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { query?: string };
  const query = String(body.query ?? "").trim();
  if (query.length < 3) {
    return NextResponse.json({ ok: false, error: "Search for at least 3 characters." }, { status: 400 });
  }
  if (query.length > 120) {
    return NextResponse.json({ ok: false, error: "Search is too long." }, { status: 400 });
  }

  try {
    assertRateLimit(user.id, query);
    const admin = createAdminClient();
    await recordSearch(admin, query).catch(() => undefined);

    const imported = await importPokemonFromRetailerSearch({
      query,
      perRetailerLimit: Number(process.env.USER_DISCOVERY_RESULT_LIMIT ?? process.env.RETAILER_SEARCH_LIMIT ?? 8)
    });
    const result = await upsertImportedCatalog(admin, imported);

    revalidatePath("/dashboard");
    revalidatePath("/watchlist");

    return NextResponse.json({
      ok: result.errors.length === 0,
      productsImported: result.productsUpserted,
      offersImported: result.offersUpserted,
      errors: result.errors,
      discoveryErrors: imported.errors
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Discovery failed." }, { status: 400 });
  }
}
