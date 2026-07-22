import { createHash } from "node:crypto";

export type EbayAccountDeletionEnv = {
  [key: string]: string | undefined;
  EBAY_ACCOUNT_DELETION_ENDPOINT?: string;
  EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN?: string;
};

export type EbayDeletionIdentifiers = {
  notificationId: string;
  eventDate: string | null;
  ebayUserId: string | null;
  username: string | null;
  eiasToken: string | null;
};

export type EbayDeletionStore = {
  recordReceived(input: EbayDeletionIdentifiers): Promise<{ duplicate: boolean; status?: string | null }>;
  findMatchingConnection(input: EbayDeletionIdentifiers): Promise<{ userId: string } | null>;
  deleteConnection(userId: string): Promise<void>;
  deleteListingDefaults(userId: string): Promise<void>;
  scrubListings(userId: string): Promise<void>;
  markProcessed(notificationId: string, status: "processed" | "processed_no_match" | "duplicate"): Promise<void>;
  markFailed(notificationId: string, errorMessage: string): Promise<void>;
};

export type EbayChallengeResult =
  | { ok: true; challengeResponse: string }
  | { ok: false; status: 400 | 500; error: string };

export type EbayDeletionProcessResult = {
  notificationId: string;
  status: "processed" | "processed_no_match" | "duplicate";
  matchedUserId: string | null;
};

export function challengeResponseForRequest(requestUrl: string, env: EbayAccountDeletionEnv = process.env): EbayChallengeResult {
  const url = new URL(requestUrl);
  const challengeCode = url.searchParams.get("challenge_code");
  if (!challengeCode) {
    return { ok: false, status: 400, error: "challenge_code is required." };
  }

  const verificationToken = env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;
  const endpoint = env.EBAY_ACCOUNT_DELETION_ENDPOINT;
  if (!verificationToken || !endpoint) {
    return { ok: false, status: 500, error: "eBay account deletion endpoint environment is not configured." };
  }

  return {
    ok: true,
    challengeResponse: computeEbayAccountDeletionChallengeResponse(challengeCode, verificationToken, endpoint)
  };
}

export function computeEbayAccountDeletionChallengeResponse(challengeCode: string, verificationToken: string, endpoint: string) {
  const hash = createHash("sha256");
  hash.update(challengeCode, "utf8");
  hash.update(verificationToken, "utf8");
  hash.update(endpoint, "utf8");
  return hash.digest("hex").toLowerCase();
}

export function extractEbayDeletionIdentifiers(payload: unknown, rawBody = ""): EbayDeletionIdentifiers {
  const notification = objectAt(payload, "notification");
  const data = objectAt(notification, "data");
  const notificationId = stringAt(notification, "notificationId") ?? fallbackNotificationId(rawBody || JSON.stringify(payload ?? null));

  return {
    notificationId,
    eventDate: stringAt(notification, "eventDate"),
    ebayUserId: stringAt(data, "userId"),
    username: stringAt(data, "username"),
    eiasToken: stringAt(data, "eiasToken")
  };
}

export async function processEbayAccountDeletionPayload(payload: unknown, store: EbayDeletionStore, rawBody = ""): Promise<EbayDeletionProcessResult> {
  const identifiers = extractEbayDeletionIdentifiers(payload, rawBody);
  const received = await store.recordReceived(identifiers);

  if (received.duplicate && received.status !== "failed") {
    return {
      notificationId: identifiers.notificationId,
      status: "duplicate",
      matchedUserId: null
    };
  }

  try {
    const connection = await store.findMatchingConnection(identifiers);
    if (!connection) {
      await store.markProcessed(identifiers.notificationId, "processed_no_match");
      return {
        notificationId: identifiers.notificationId,
        status: "processed_no_match",
        matchedUserId: null
      };
    }

    await store.deleteConnection(connection.userId);
    await store.deleteListingDefaults(connection.userId);
    await store.scrubListings(connection.userId);
    await store.markProcessed(identifiers.notificationId, "processed");

    return {
      notificationId: identifiers.notificationId,
      status: "processed",
      matchedUserId: connection.userId
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "eBay account deletion processing failed.";
    await store.markFailed(identifiers.notificationId, message.slice(0, 1000)).catch(() => undefined);
    throw error;
  }
}

function fallbackNotificationId(rawBody: string) {
  return `missing-${createHash("sha256").update(rawBody, "utf8").digest("hex").slice(0, 32)}`;
}

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = (value as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return entry as Record<string, unknown>;
}

function stringAt(value: Record<string, unknown> | null, key: string) {
  const entry = value?.[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}
