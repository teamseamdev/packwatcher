import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  challengeResponseForRequest,
  computeEbayAccountDeletionChallengeResponse,
  processEbayAccountDeletionPayload,
  type EbayDeletionIdentifiers,
  type EbayDeletionStore
} from "../lib/ebay/account-deletion.ts";

const endpoint = "https://packwatcher.vercel.app/api/ebay/account-deletion";
const verificationToken = "test_token_123456789012345678901234567890";

test("computes valid eBay GET challenge response", () => {
  const result = challengeResponseForRequest(`https://example.test/api/ebay/account-deletion?challenge_code=abc123`, {
    EBAY_ACCOUNT_DELETION_ENDPOINT: endpoint,
    EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN: verificationToken
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.challengeResponse : "", expectedHash("abc123", verificationToken, endpoint));
});

test("rejects missing eBay challenge_code", () => {
  const result = challengeResponseForRequest("https://example.test/api/ebay/account-deletion", {
    EBAY_ACCOUNT_DELETION_ENDPOINT: endpoint,
    EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN: verificationToken
  });

  assert.deepEqual(result, { ok: false, status: 400, error: "challenge_code is required." });
});

test("rejects missing eBay account deletion environment", () => {
  const result = challengeResponseForRequest("https://example.test/api/ebay/account-deletion?challenge_code=abc123", {});
  assert.deepEqual(result, {
    ok: false,
    status: 500,
    error: "eBay account deletion endpoint environment is not configured."
  });
});

test("uses exact endpoint URL when hashing challenge response", () => {
  const withWww = computeEbayAccountDeletionChallengeResponse("abc123", verificationToken, endpoint);
  const withoutWww = computeEbayAccountDeletionChallengeResponse("abc123", verificationToken, "https://pckwatcher.com/api/ebay/account-deletion");

  assert.notEqual(withWww, withoutWww);
  assert.equal(withWww, expectedHash("abc123", verificationToken, endpoint));
});

test("acknowledges and processes a valid eBay account deletion POST payload", async () => {
  const store = new MemoryEbayDeletionStore([{ userId: "user-1", ebayUserId: "EBAYUSER123", username: "seller-one" }]);
  const result = await processEbayAccountDeletionPayload(notificationPayload("n-1", "EBAYUSER123", "seller-one"), store);

  assert.equal(result.status, "processed");
  assert.equal(result.matchedUserId, "user-1");
  assert.equal(store.deletedConnections.includes("user-1"), true);
  assert.equal(store.deletedDefaults.includes("user-1"), true);
  assert.equal(store.scrubbedListings.includes("user-1"), true);
  assert.equal(store.events.get("n-1")?.status, "processed");
});

test("uses notification idempotency for duplicate eBay account deletion notifications", async () => {
  const store = new MemoryEbayDeletionStore([{ userId: "user-1", ebayUserId: "EBAYUSER123", username: "seller-one" }]);
  await processEbayAccountDeletionPayload(notificationPayload("n-duplicate", "EBAYUSER123", "seller-one"), store);
  const duplicate = await processEbayAccountDeletionPayload(notificationPayload("n-duplicate", "EBAYUSER123", "seller-one"), store);

  assert.equal(duplicate.status, "duplicate");
  assert.equal(store.deletedConnections.length, 1);
  assert.equal(store.scrubbedListings.length, 1);
});

test("records unknown eBay users as processed without failing", async () => {
  const store = new MemoryEbayDeletionStore([]);
  const result = await processEbayAccountDeletionPayload(notificationPayload("n-unknown", "missing-user", "missing-name"), store);

  assert.equal(result.status, "processed_no_match");
  assert.equal(result.matchedUserId, null);
  assert.equal(store.events.get("n-unknown")?.status, "processed_no_match");
});

test("matches eBay account deletion by username when userId is not stored", async () => {
  const store = new MemoryEbayDeletionStore([{ userId: "user-2", ebayUserId: null, username: "known-seller" }]);
  const result = await processEbayAccountDeletionPayload(notificationPayload("n-username", "unknown-ebay-id", "known-seller"), store);

  assert.equal(result.status, "processed");
  assert.equal(result.matchedUserId, "user-2");
});

function expectedHash(challengeCode: string, token: string, url: string) {
  const hash = createHash("sha256");
  hash.update(challengeCode, "utf8");
  hash.update(token, "utf8");
  hash.update(url, "utf8");
  return hash.digest("hex").toLowerCase();
}

function notificationPayload(notificationId: string, ebayUserId: string, username: string) {
  return {
    metadata: {
      topic: "MARKETPLACE_ACCOUNT_DELETION",
      schemaVersion: "1.0",
      deprecated: false
    },
    notification: {
      notificationId,
      eventDate: "2026-07-22T12:00:00.000Z",
      publishDate: "2026-07-22T12:00:01.000Z",
      publishAttemptCount: 1,
      data: {
        username,
        userId: ebayUserId,
        eiasToken: "EIAS-TOKEN"
      }
    }
  };
}

class MemoryEbayDeletionStore implements EbayDeletionStore {
  readonly events = new Map<string, { status: string; ebayUserId: string | null }>();
  readonly deletedConnections: string[] = [];
  readonly deletedDefaults: string[] = [];
  readonly scrubbedListings: string[] = [];
  private readonly connections: Array<{ userId: string; ebayUserId: string | null; username: string | null }>;

  constructor(connections: Array<{ userId: string; ebayUserId: string | null; username: string | null }>) {
    this.connections = connections;
  }

  async recordReceived(input: EbayDeletionIdentifiers) {
    const existing = this.events.get(input.notificationId);
    if (existing) return { duplicate: true, status: existing.status };
    this.events.set(input.notificationId, { status: "received", ebayUserId: input.ebayUserId });
    return { duplicate: false };
  }

  async findMatchingConnection(input: EbayDeletionIdentifiers) {
    const match = this.connections.find((connection) =>
      Boolean(input.ebayUserId && connection.ebayUserId === input.ebayUserId)
      || Boolean(input.username && connection.username === input.username)
      || Boolean(input.eiasToken && connection.ebayUserId === input.eiasToken)
    );
    return match ? { userId: match.userId } : null;
  }

  async deleteConnection(userId: string) {
    this.deletedConnections.push(userId);
  }

  async deleteListingDefaults(userId: string) {
    this.deletedDefaults.push(userId);
  }

  async scrubListings(userId: string) {
    this.scrubbedListings.push(userId);
  }

  async markProcessed(notificationId: string, status: "processed" | "processed_no_match" | "duplicate") {
    const event = this.events.get(notificationId);
    if (event) event.status = status;
  }

  async markFailed(notificationId: string, errorMessage: string) {
    const event = this.events.get(notificationId);
    if (event) event.status = `failed:${errorMessage}`;
  }
}
