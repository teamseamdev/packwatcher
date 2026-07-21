import { createHash } from "crypto";
import type { StockStatus } from "@/lib/types";

export type AvailabilityType = "online" | "local" | "marketplace";
export type ConfidenceLevel = "high" | "medium" | "low" | "last_known";

export type AvailabilityObservationInput = {
  catalogOfferId: string;
  productId: string;
  retailer: string;
  storeId?: string | null;
  previousStatus?: StockStatus | null;
  status: StockStatus;
  price: number | null;
  currency?: string | null;
  availabilityType?: AvailabilityType;
  shippingAvailable?: boolean | null;
  pickupAvailable?: boolean | null;
  deliveryAvailable?: boolean | null;
  quantityHint?: string | null;
  sellerName?: string | null;
  officialRetailerSeller?: boolean;
  confidence: number;
  sourceStatus?: string | null;
  extractionStrategy?: string | null;
  adapterVersion?: string | null;
  checkedAt: string;
  rawMetadata?: Record<string, unknown>;
  isTest?: boolean;
};

export type LatestAvailabilityState = {
  status: StockStatus;
  price: number | null;
  currency: string;
  availabilityType: AvailabilityType;
  confidence: number;
  lastCheckedAt: string | null;
  stateVersion: number;
};

export type RetailerReducerPolicy = {
  retailer: string;
  sourceStrength: "official" | "structured" | "web";
  minimumRestockConfidence: number;
  requireConfirmationForWeb: boolean;
  staleAfterMinutes: number;
};

export type AvailabilityTransition = {
  nextState: LatestAvailabilityState;
  sufficientEvidence: boolean;
  requiresVerification: boolean;
  createRestockEvent: boolean;
  createPriceChangeEvent: boolean;
  eventKey: string | null;
  reason: string;
  confidenceLevel: ConfidenceLevel;
};

const availableStatuses = new Set<StockStatus>([
  "in_stock",
  "limited_stock",
  "preorder",
  "backorder",
  "pickup_available",
  "shipping_available",
  "delivery_available",
  "pickup_only",
  "shipping_only",
  "delivery_only"
]);

const unavailableStatuses = new Set<StockStatus>([
  "out_of_stock",
  "unavailable",
  "unavailable_at_location",
  "listing_removed"
]);

export const defaultRetailerReducerPolicy: RetailerReducerPolicy = {
  retailer: "generic",
  sourceStrength: "web",
  minimumRestockConfidence: 0.72,
  requireConfirmationForWeb: true,
  staleAfterMinutes: 60
};

export function isAvailableStatus(status: StockStatus) {
  return availableStatuses.has(status);
}

export function isUnavailableStatus(status: StockStatus | null | undefined) {
  return status ? unavailableStatuses.has(status) : false;
}

export function confidenceLevel(confidence: number, checkedAt?: string | null, now = new Date()): ConfidenceLevel {
  if (checkedAt) {
    const ageMinutes = (now.getTime() - new Date(checkedAt).getTime()) / 60000;
    if (ageMinutes > 120) return "last_known";
  }
  if (confidence >= 0.82) return "high";
  if (confidence >= 0.58) return "medium";
  return "low";
}

export function evidenceHash(input: Pick<AvailabilityObservationInput, "status" | "price" | "retailer" | "storeId" | "sellerName" | "sourceStatus" | "rawMetadata">) {
  return createHash("sha256")
    .update(JSON.stringify({
      status: input.status,
      price: input.price,
      retailer: input.retailer,
      storeId: input.storeId ?? "online",
      sellerName: input.sellerName ?? null,
      sourceStatus: input.sourceStatus ?? null,
      rawMetadata: input.rawMetadata ?? {}
    }))
    .digest("hex");
}

export function restockEventKey(input: {
  catalogOfferId: string;
  storeId?: string | null;
  previousStatus?: StockStatus | null;
  status: StockStatus;
  price: number | null;
  isTest?: boolean;
}) {
  const priceBucket = input.price === null ? "unknown" : Math.round(input.price * 100).toString();
  return [
    input.isTest ? "test" : "live",
    input.catalogOfferId,
    input.storeId ?? "online",
    input.previousStatus ?? "unknown",
    input.status,
    priceBucket
  ].join(":");
}

export function reduceAvailabilityState(
  previousState: LatestAvailabilityState | null,
  observation: AvailabilityObservationInput,
  policy: RetailerReducerPolicy = defaultRetailerReducerPolicy
): AvailabilityTransition {
  const previousStatus = previousState?.status ?? observation.previousStatus ?? null;
  const wasAvailable = isAvailableStatus(previousStatus ?? "unknown");
  const nowAvailable = isAvailableStatus(observation.status);
  const wasUnavailable = !previousStatus || isUnavailableStatus(previousStatus) || previousStatus === "unknown";
  const officialOrStructured = policy.sourceStrength === "official" || policy.sourceStrength === "structured";
  const sufficientEvidence = observation.confidence >= policy.minimumRestockConfidence || officialOrStructured;
  const requiresVerification = nowAvailable && !sufficientEvidence && policy.requireConfirmationForWeb;
  const priceChanged = previousState?.price !== undefined
    && previousState.price !== null
    && observation.price !== null
    && Math.abs(previousState.price - observation.price) >= 0.01;
  const createRestockEvent = nowAvailable && !wasAvailable && wasUnavailable && sufficientEvidence;
  const nextVersion = previousState
    ? previousState.status === observation.status && previousState.price === observation.price
      ? previousState.stateVersion
      : previousState.stateVersion + 1
    : 1;

  return {
    nextState: {
      status: observation.status,
      price: observation.price,
      currency: observation.currency ?? previousState?.currency ?? "USD",
      availabilityType: observation.availabilityType ?? previousState?.availabilityType ?? "online",
      confidence: clampConfidence(observation.confidence),
      lastCheckedAt: observation.checkedAt,
      stateVersion: nextVersion
    },
    sufficientEvidence,
    requiresVerification,
    createRestockEvent,
    createPriceChangeEvent: priceChanged,
    eventKey: createRestockEvent ? restockEventKey({
      catalogOfferId: observation.catalogOfferId,
      storeId: observation.storeId,
      previousStatus,
      status: observation.status,
      price: observation.price,
      isTest: observation.isTest
    }) : null,
    confidenceLevel: confidenceLevel(observation.confidence, observation.checkedAt),
    reason: createRestockEvent
      ? "confirmed_restock_transition"
      : requiresVerification
        ? "availability_requires_confirmation"
        : priceChanged
          ? "price_changed"
          : "state_updated"
  };
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
