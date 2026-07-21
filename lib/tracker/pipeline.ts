import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { sendPushToUser } from "@/lib/push";
import { notificationEventKey, shouldSendRestockAlert } from "@/lib/retailers/shared/restock-events";
import type { CatalogOffer, CatalogProduct, ProductAlert, StockStatus } from "@/lib/types";
import {
  defaultRetailerReducerPolicy,
  evidenceHash,
  isAvailableStatus,
  reduceAvailabilityState,
  type AvailabilityObservationInput,
  type LatestAvailabilityState,
  type RetailerReducerPolicy
} from "@/lib/tracker/availability-reducer";

type OfferWithProduct = CatalogOffer & {
  catalog_products: CatalogProduct | null;
};

type PipelineInput = {
  supabase: SupabaseClient;
  offer: OfferWithProduct;
  observation: Omit<AvailabilityObservationInput, "catalogOfferId" | "productId" | "retailer" | "previousStatus">;
  policy?: Partial<RetailerReducerPolicy>;
};

type PipelineResult = {
  observationId: string | null;
  restockEventId: string | null;
  outboxQueued: number;
  pushSent: number;
  requiresVerification: boolean;
  transitionReason: string;
};

export async function recordCatalogOfferObservation({
  supabase,
  offer,
  observation,
  policy
}: PipelineInput): Promise<PipelineResult> {
  const productId = offer.product_id ?? offer.catalog_product_id;
  const retailer = offer.retailer ?? offer.store_name;
  const previousState = await loadLatestState(supabase, offer.id);
  const previousStatus = previousState?.status ?? offer.status ?? null;
  const fullObservation: AvailabilityObservationInput = {
    ...observation,
    catalogOfferId: offer.id,
    productId,
    retailer,
    previousStatus
  };
  const transition = reduceAvailabilityState(previousState, fullObservation, {
    ...defaultRetailerReducerPolicy,
    retailer,
    sourceStrength: observation.extractionStrategy === "official_api" ? "official" : "web",
    ...policy
  });
  const hash = evidenceHash(fullObservation);

  const { data: insertedObservation, error: observationError } = await supabase
    .from("availability_observations")
    .insert({
      catalog_offer_id: offer.id,
      product_id: productId,
      retailer,
      store_id: fullObservation.storeId ?? null,
      previous_status: previousStatus,
      status: fullObservation.status,
      price: fullObservation.price,
      currency: fullObservation.currency ?? "USD",
      availability_type: fullObservation.availabilityType ?? "online",
      shipping_available: fullObservation.shippingAvailable ?? null,
      pickup_available: fullObservation.pickupAvailable ?? null,
      delivery_available: fullObservation.deliveryAvailable ?? null,
      quantity_hint: fullObservation.quantityHint ?? null,
      seller_name: fullObservation.sellerName ?? null,
      official_retailer_seller: fullObservation.officialRetailerSeller ?? true,
      confidence: fullObservation.confidence,
      evidence_hash: hash,
      source_status: fullObservation.sourceStatus ?? null,
      extraction_strategy: fullObservation.extractionStrategy ?? "catalog_offer_check",
      adapter_version: fullObservation.adapterVersion ?? "catalog-offer-v1",
      checked_at: fullObservation.checkedAt,
      raw_metadata: fullObservation.rawMetadata ?? {},
      is_test: fullObservation.isTest ?? false
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (observationError) {
    await logAppEvent({
      category: "retailer",
      severity: "error",
      message: "Availability observation insert failed",
      metadata: { ...errorMetadata(observationError), offerId: offer.id, retailer }
    });
    return { observationId: null, restockEventId: null, outboxQueued: 0, pushSent: 0, requiresVerification: true, transitionReason: "observation_insert_failed" };
  }

  const observationId = insertedObservation?.id ?? null;
  await supabase
    .from("listing_latest_state")
    .upsert({
      catalog_offer_id: offer.id,
      product_id: productId,
      retailer,
      store_id: fullObservation.storeId ?? null,
      previous_status: previousStatus,
      status: transition.nextState.status,
      price: transition.nextState.price,
      currency: transition.nextState.currency,
      availability_type: transition.nextState.availabilityType,
      in_stock: isAvailableStatus(transition.nextState.status),
      confidence: transition.nextState.confidence,
      last_observation_id: observationId,
      last_checked_at: transition.nextState.lastCheckedAt,
      state_version: transition.nextState.stateVersion,
      updated_at: new Date().toISOString()
    }, { onConflict: "catalog_offer_id" });

  if (!transition.createRestockEvent || !transition.eventKey || !observationId) {
    return {
      observationId,
      restockEventId: null,
      outboxQueued: 0,
      pushSent: 0,
      requiresVerification: transition.requiresVerification,
      transitionReason: transition.reason
    };
  }

  const restockEventId = await createRestockEvent(supabase, {
    eventKey: transition.eventKey,
    offer,
    observation: fullObservation,
    observationId,
    previousStatus
  });

  if (!restockEventId) {
    return {
      observationId,
      restockEventId: null,
      outboxQueued: 0,
      pushSent: 0,
      requiresVerification: transition.requiresVerification,
      transitionReason: "duplicate_or_failed_event"
    };
  }

  const queued = await queueMatchingAlerts(supabase, offer, fullObservation, restockEventId);
  const delivered = await processNotificationOutbox(supabase, { limit: queued, restockEventId });

  return {
    observationId,
    restockEventId,
    outboxQueued: queued,
    pushSent: delivered.sent,
    requiresVerification: false,
    transitionReason: transition.reason
  };
}

async function loadLatestState(supabase: SupabaseClient, catalogOfferId: string): Promise<LatestAvailabilityState | null> {
  const { data } = await supabase
    .from("listing_latest_state")
    .select("status,price,currency,availability_type,confidence,last_checked_at,state_version")
    .eq("catalog_offer_id", catalogOfferId)
    .maybeSingle<{
      status: StockStatus;
      price: number | null;
      currency: string | null;
      availability_type: "online" | "local" | "marketplace" | null;
      confidence: number | null;
      last_checked_at: string | null;
      state_version: number | null;
    }>();

  if (!data) return null;
  return {
    status: data.status,
    price: data.price,
    currency: data.currency ?? "USD",
    availabilityType: data.availability_type ?? "online",
    confidence: Number(data.confidence ?? 0.5),
    lastCheckedAt: data.last_checked_at,
    stateVersion: Number(data.state_version ?? 1)
  };
}

async function createRestockEvent(
  supabase: SupabaseClient,
  input: {
    eventKey: string;
    offer: OfferWithProduct;
    observation: AvailabilityObservationInput;
    observationId: string;
    previousStatus: StockStatus | null;
  }
) {
  const { data, error } = await supabase
    .from("restock_events")
    .insert({
      event_key: input.eventKey,
      product_id: input.observation.productId,
      catalog_offer_id: input.offer.id,
      store_id: input.observation.storeId ?? null,
      previous_status: input.previousStatus,
      new_status: input.observation.status,
      price: input.observation.price,
      seller_name: input.observation.sellerName ?? input.offer.store_name,
      observed_at: input.observation.checkedAt,
      confirmed_at: new Date().toISOString(),
      confidence: input.observation.confidence,
      trigger_observation_ids: [input.observationId],
      event_source: input.observation.isTest ? "admin_simulation" : "catalog_offer_check",
      is_test: input.observation.isTest ?? false
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error?.code === "23505") return null;
  if (error) {
    await logAppEvent({
      category: "retailer",
      severity: "error",
      message: "Restock event insert failed",
      metadata: { ...errorMetadata(error), offerId: input.offer.id, eventKey: input.eventKey }
    });
    return null;
  }

  return data?.id ?? null;
}

async function queueMatchingAlerts(
  supabase: SupabaseClient,
  offer: OfferWithProduct,
  observation: AvailabilityObservationInput,
  restockEventId: string
) {
  const productId = offer.product_id ?? offer.catalog_product_id;
  const { data: alerts } = await supabase
    .from("product_alerts")
    .select("*")
    .eq("product_id", productId);
  const productName = offer.catalog_products?.title ?? offer.catalog_products?.name ?? offer.title ?? "A tracked Pokemon product";
  const rows = [];

  for (const alert of (alerts ?? []) as ProductAlert[]) {
    const snapshot = {
      retailerProductId: offer.retailer_product_id ?? offer.id,
      retailer: observation.retailer,
      productId,
      status: observation.status,
      previousStatus: observation.previousStatus ?? null,
      price: observation.price,
      sellerName: observation.sellerName ?? offer.store_name,
      officialRetailerSeller: observation.officialRetailerSeller ?? true,
      availabilityType: observation.availabilityType ?? "online",
      storeId: observation.storeId ?? null
    };

    if (!shouldSendRestockAlert(alert, snapshot)) continue;

    const eventKey = notificationEventKey(alert.user_id, snapshot);
    const title = `${productName} restocked`;
    const body = `${observation.retailer} reports ${productName} as ${observation.status.replaceAll("_", " ")}${observation.price !== null ? ` at $${observation.price.toFixed(2)}` : ""}. Confirm on the retailer page.`;

    const { error: notificationEventError } = await supabase.from("notification_events").insert({
      user_id: alert.user_id,
      product_id: productId,
      event_key: eventKey,
      status: observation.status,
      price: observation.price,
      retailer: observation.retailer,
      availability_type: observation.availabilityType ?? "online",
      store_id: observation.storeId ?? null,
      metadata: {
        offerId: offer.id,
        restockEventId,
        url: offer.url,
        isTest: observation.isTest ?? false,
        checkedAt: observation.checkedAt
      }
    });

    if (notificationEventError?.code === "23505") continue;

    await supabase.from("notifications").insert({
      user_id: alert.user_id,
      tracked_product_id: null,
      type: observation.isTest ? "test_restock" : "restock",
      title,
      message: body
    });

    rows.push({
      user_id: alert.user_id,
      restock_event_id: restockEventId,
      channel: "web_push",
      status: alert.notify_push ? "pending" : "skipped",
      payload: {
        title,
        body,
        url: `/catalog/${productId}`,
        productId,
        offerId: offer.id,
        restockEventId,
        retailer: observation.retailer,
        type: observation.isTest ? "test_restock" : "restock"
      },
      is_test: observation.isTest ?? false
    });
  }

  if (!rows.length) return 0;
  const { error } = await supabase.from("notification_outbox").insert(rows);
  if (error) {
    await logAppEvent({
      category: "notification",
      severity: "error",
      message: "Notification outbox insert failed",
      metadata: { ...errorMetadata(error), restockEventId }
    });
    return 0;
  }
  await supabase.from("restock_events").update({ notification_status: "queued" }).eq("id", restockEventId);
  return rows.filter((row) => row.status === "pending").length;
}

export async function processNotificationOutbox(
  supabase: SupabaseClient,
  options: { limit?: number; restockEventId?: string | null } = {}
) {
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  let query = supabase
    .from("notification_outbox")
    .select("id,user_id,restock_event_id,payload,attempts")
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options.restockEventId) query = query.eq("restock_event_id", options.restockEventId);
  const { data: jobs } = await query;

  let sent = 0;
  let failed = 0;

  for (const job of (jobs ?? []) as Array<{ id: string; user_id: string; restock_event_id: string | null; payload: Record<string, unknown>; attempts: number }>) {
    await supabase.from("notification_outbox").update({
      status: "sending",
      attempts: job.attempts + 1,
      updated_at: new Date().toISOString()
    }).eq("id", job.id).eq("status", "pending");

    try {
      const push = await sendPushToUser(job.user_id, {
        title: String(job.payload.title ?? "PackWatcher alert"),
        body: String(job.payload.body ?? "A tracked product changed availability."),
        url: typeof job.payload.url === "string" ? job.payload.url : "/alerts"
      });

      await supabase.from("notification_outbox").update({
        status: push.skipped ? "skipped" : "sent",
        sent_at: new Date().toISOString(),
        provider_response: push,
        updated_at: new Date().toISOString()
      }).eq("id", job.id);

      if (!push.skipped) sent += push.sent;
    } catch (error) {
      failed += 1;
      await supabase.from("notification_outbox").update({
        status: job.attempts + 1 >= 3 ? "failed" : "pending",
        available_at: new Date(Date.now() + Math.min(30, 2 ** job.attempts) * 60 * 1000).toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown push error",
        updated_at: new Date().toISOString()
      }).eq("id", job.id);
    }
  }

  if (options.restockEventId && jobs?.length) {
    await supabase
      .from("restock_events")
      .update({ notification_status: failed ? "partial" : "sent" })
      .eq("id", options.restockEventId);
  }

  return { processed: jobs?.length ?? 0, sent, failed };
}
