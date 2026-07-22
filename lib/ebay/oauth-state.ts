import { createHash, timingSafeEqual } from "node:crypto";

export const EBAY_OAUTH_STATE_COOKIE = "packwatcher_ebay_oauth_state";
export const EBAY_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function hashEbayOAuthState(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function safeEbayReturnPath(input: string | null | undefined) {
  if (!input) return "/account?section=ebay";

  try {
    const decoded = decodeURIComponent(input);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/account?section=ebay";
    if (/[\r\n]/.test(decoded)) return "/account?section=ebay";
    return decoded;
  } catch {
    return "/account?section=ebay";
  }
}

export function ebayOAuthExpiresAt(now = Date.now()) {
  return new Date(now + EBAY_OAUTH_STATE_MAX_AGE_SECONDS * 1000).toISOString();
}

export function statesMatch(input: string, expectedHash: string) {
  const inputHash = hashEbayOAuthState(input);
  const left = Buffer.from(inputHash, "hex");
  const right = Buffer.from(expectedHash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
