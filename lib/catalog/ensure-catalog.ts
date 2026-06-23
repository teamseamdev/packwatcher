import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAvailableCatalogsQuick } from "@/lib/catalog-importers/sync-all";
import { createAdminClient } from "@/lib/supabase/admin";

let lastWarmupAttemptAt = 0;

export async function ensureCatalogHasRows(supabase: SupabaseClient) {
  const { count } = await supabase.from("catalog_offers").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return { attempted: false, count: count ?? 0 };
  }

  const now = Date.now();
  if (now - lastWarmupAttemptAt < 5 * 60 * 1000) {
    return { attempted: false, count: 0 };
  }

  lastWarmupAttemptAt = now;
  const admin = createAdminClient();

  await Promise.race([
    syncAvailableCatalogsQuick(admin),
    new Promise((resolve) => setTimeout(resolve, 12_000))
  ]).catch(() => undefined);

  const { count: nextCount } = await supabase.from("catalog_offers").select("*", { count: "exact", head: true });
  return { attempted: true, count: nextCount ?? 0 };
}
