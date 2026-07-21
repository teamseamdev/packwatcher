import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage, safeAuthRedirect } from "../lib/auth/redirect.ts";
import { splashMessageForVariant } from "../lib/loading/splash-copy.ts";

test("safe auth redirect keeps local app routes", () => {
  assert.equal(safeAuthRedirect("/inventory"), "/inventory");
  assert.equal(safeAuthRedirect(encodeURIComponent("/scanner?next=/dashboard")), "/scanner?next=/dashboard");
});

test("safe auth redirect rejects external or malformed destinations", () => {
  assert.equal(safeAuthRedirect("https://evil.example"), "/dashboard");
  assert.equal(safeAuthRedirect("//evil.example"), "/dashboard");
  assert.equal(safeAuthRedirect("/dashboard%0ASet-Cookie:x"), "/dashboard");
  assert.equal(safeAuthRedirect(null), "/dashboard");
});

test("auth errors are translated to readable messages", () => {
  assert.equal(authErrorMessage("access_denied"), "Discord sign-in was canceled.");
  assert.equal(authErrorMessage("PKCE verifier expired"), "Your sign-in session expired. Please try again.");
  assert.equal(authErrorMessage("state mismatch"), "We couldn't verify the sign-in session. Please try again.");
});

test("splash variants provide context-specific copy", () => {
  assert.equal(splashMessageForVariant("app-boot"), "Loading PackWatcher");
  assert.equal(splashMessageForVariant("discord-connect"), "Connecting to Discord");
  assert.equal(splashMessageForVariant("scanner-prepare", "Preparing Chaos Rising"), "Preparing Chaos Rising");
});
