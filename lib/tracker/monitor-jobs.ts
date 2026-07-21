import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCatalogOffer } from "@/lib/catalog/check-offers";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import type { CatalogOffer, CatalogProduct } from "@/lib/types";

type MonitorJob = {
  id: string;
  catalog_offer_id: string | null;
  retailer: string;
  priority: number;
  attempt_count: number;
};

type OfferRow = CatalogOffer & {
  catalog_products: CatalogProduct | null;
};

export async function enqueueCatalogOfferMonitorJobs(supabase: SupabaseClient, limit = 1000) {
  const { data: offers, error } = await supabase
    .from("catalog_offers")
    .select("id,retailer,store_name,in_stock,last_checked_at,active")
    .neq("active", false)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return { enqueued: 0, error: error.message };

  const now = Date.now();
  const rows = (offers ?? []).map((offer) => ({
    catalog_offer_id: offer.id,
    retailer: offer.retailer ?? offer.store_name ?? "unknown",
    priority: priorityForOffer({
      inStock: offer.in_stock === true,
      lastCheckedAt: offer.last_checked_at
    }),
    scheduled_at: nextScheduleForOffer({
      now,
      inStock: offer.in_stock === true,
      lastCheckedAt: offer.last_checked_at
    }),
    status: "queued",
    metadata: {
      source: "catalog_offer",
      generatedAt: new Date(now).toISOString()
    },
    updated_at: new Date(now).toISOString()
  }));

  if (!rows.length) return { enqueued: 0, error: null };

  const { error: upsertError } = await supabase
    .from("monitor_jobs")
    .upsert(rows, { onConflict: "catalog_offer_id" });

  return { enqueued: upsertError ? 0 : rows.length, error: upsertError?.message ?? null };
}

export async function runMonitorJobBatch(
  supabase: SupabaseClient,
  options: { limit?: number; workerId?: string; enqueueFirst?: boolean } = {}
) {
  const workerId = options.workerId ?? `packwatcher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const limit = Math.max(1, Math.min(100, options.limit ?? Number(process.env.MONITOR_JOB_BATCH_LIMIT ?? 25)));
  if (options.enqueueFirst) await enqueueCatalogOfferMonitorJobs(supabase, Number(process.env.MONITOR_JOB_ENQUEUE_LIMIT ?? 1000));

  const { data: jobs, error: claimError } = await supabase.rpc("claim_monitor_jobs", {
    p_worker: workerId,
    p_limit: limit,
    p_lease_seconds: Number(process.env.MONITOR_JOB_LEASE_SECONDS ?? 300)
  });

  if (claimError) {
    await logAppEvent({
      category: "retailer",
      severity: "error",
      message: "Monitor job claim failed",
      metadata: { ...errorMetadata(claimError), workerId }
    });
    return { workerId, claimed: 0, checked: 0, alertsQueued: 0, errors: [claimError.message] };
  }

  let checked = 0;
  let alertsQueued = 0;
  const errors: string[] = [];

  for (const job of (jobs ?? []) as MonitorJob[]) {
    if (!job.catalog_offer_id) {
      await completeJob(supabase, job, { status: "failed", error: "Missing catalog offer ID" });
      errors.push(`${job.id}: missing catalog offer ID`);
      continue;
    }

    const { data: offer, error: offerError } = await supabase
      .from("catalog_offers")
      .select("*, catalog_products!catalog_offers_catalog_product_id_fkey(*)")
      .eq("id", job.catalog_offer_id)
      .maybeSingle<OfferRow>();

    if (offerError || !offer || offer.active === false) {
      const message = offerError?.message ?? "Catalog offer missing or inactive";
      await completeJob(supabase, job, { status: "failed", error: message });
      errors.push(`${job.id}: ${message}`);
      continue;
    }

    try {
      const result = await checkCatalogOffer(supabase, offer);
      if (result.checked) checked += 1;
      alertsQueued += result.outboxQueued;
      await completeJob(supabase, job, {
        status: "queued",
        nextScheduledAt: new Date(Date.now() + nextIntervalMs(offer.in_stock === true)).toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown monitor check error";
      errors.push(`${offer.store_name}: ${message}`);
      await completeJob(supabase, job, {
        status: job.attempt_count + 1 >= 5 ? "dead_letter" : "retry",
        error: message,
        nextScheduledAt: new Date(Date.now() + retryIntervalMs(job.attempt_count + 1)).toISOString()
      });
      await logAppEvent({
        category: "retailer",
        severity: "error",
        message: "Monitor job check failed",
        metadata: { ...errorMetadata(error), jobId: job.id, offerId: offer.id, retailer: offer.retailer ?? offer.store_name }
      });
    }
  }

  return {
    workerId,
    claimed: (jobs ?? []).length,
    checked,
    alertsQueued,
    errors
  };
}

function priorityForOffer(input: { inStock: boolean; lastCheckedAt: string | null }) {
  if (!input.lastCheckedAt) return 95;
  if (input.inStock) return 80;
  const ageMinutes = (Date.now() - new Date(input.lastCheckedAt).getTime()) / 60000;
  if (ageMinutes > 24 * 60) return 85;
  if (ageMinutes > 180) return 70;
  return 50;
}

function nextScheduleForOffer(input: { now: number; inStock: boolean; lastCheckedAt: string | null }) {
  if (!input.lastCheckedAt) return new Date(input.now).toISOString();
  return new Date(input.now + nextIntervalMs(input.inStock)).toISOString();
}

function nextIntervalMs(inStock: boolean) {
  const minutes = inStock
    ? Number(process.env.MONITOR_JOB_IN_STOCK_INTERVAL_MINUTES ?? 20)
    : Number(process.env.MONITOR_JOB_OUT_OF_STOCK_INTERVAL_MINUTES ?? 120);
  return withJitter(minutes * 60 * 1000);
}

function retryIntervalMs(attempt: number) {
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempt - 1));
  return withJitter(minutes * 60 * 1000);
}

function withJitter(milliseconds: number) {
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.round(milliseconds * jitter);
}

async function completeJob(
  supabase: SupabaseClient,
  job: MonitorJob,
  result: { status: "queued" | "retry" | "failed" | "dead_letter"; nextScheduledAt?: string; error?: string }
) {
  await supabase
    .from("monitor_jobs")
    .update({
      status: result.status,
      attempt_count: result.status === "queued" ? 0 : job.attempt_count + 1,
      scheduled_at: result.nextScheduledAt ?? new Date(Date.now() + retryIntervalMs(job.attempt_count + 1)).toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error: result.error ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id);
}
