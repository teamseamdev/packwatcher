import assert from "node:assert/strict";
import test from "node:test";
import { shouldRouteCodeToSupabaseAuth } from "../lib/auth/code-routing.ts";
import { hashEbayOAuthState, safeEbayReturnPath, statesMatch } from "../lib/ebay/oauth-state.ts";

test("Supabase auth proxy does not capture eBay OAuth callback codes", () => {
  assert.equal(shouldRouteCodeToSupabaseAuth("/api/ebay/oauth/callback", true), false);
  assert.equal(shouldRouteCodeToSupabaseAuth("/api/ebay/account-deletion", true), false);
  assert.equal(shouldRouteCodeToSupabaseAuth("/auth/callback", true), false);
  assert.equal(shouldRouteCodeToSupabaseAuth("/dashboard", true), true);
  assert.equal(shouldRouteCodeToSupabaseAuth("/dashboard", false), false);
});

test("eBay OAuth state hashing is one-way and comparable", () => {
  const raw = "raw-ebay-state";
  const hash = hashEbayOAuthState(raw);
  assert.notEqual(hash, raw);
  assert.equal(statesMatch(raw, hash), true);
  assert.equal(statesMatch("wrong-state", hash), false);
});

test("eBay OAuth return path accepts internal paths only", () => {
  assert.equal(safeEbayReturnPath("/account?section=ebay"), "/account?section=ebay");
  assert.equal(safeEbayReturnPath("/inventory/ebay/123?returnTo=%2Finventory"), "/inventory/ebay/123?returnTo=/inventory");
  assert.equal(safeEbayReturnPath("https://evil.example/account"), "/account?section=ebay");
  assert.equal(safeEbayReturnPath("//evil.example/account"), "/account?section=ebay");
});
