import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeEbayAuthorizationCode, fetchEbayUserIdentity } from "@/lib/ebay/client";
import { getEbayConfig } from "@/lib/ebay/config";
import { EBAY_OAUTH_STATE_COOKIE, hashEbayOAuthState, statesMatch } from "@/lib/ebay/oauth-state";
import { encryptEbayToken } from "@/lib/ebay/token-crypto";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const admin = createAdminClient();
  const config = getEbayConfig();
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(EBAY_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(EBAY_OAUTH_STATE_COOKIE);

  if (error) redirect("/account?ebay_error=" + encodeURIComponent(error));
  if (!state) redirect("/account?ebay_error=missing_state");
  if (cookieState && !statesMatch(cookieState, hashEbayOAuthState(state))) {
    await logAppEvent({
      category: "ebay",
      severity: "warn",
      message: "eBay OAuth callback cookie state mismatch",
      metadata: { errorCategory: "EBAY_OAUTH_STATE_INVALID" }
    });
    redirect("/account?ebay_error=invalid_state");
  }

  const { data: pendingState, error: stateError } = await admin
    .from("ebay_oauth_states")
    .select("id,user_id,return_path,environment,expires_at,consumed_at")
    .eq("state_hash", hashEbayOAuthState(state))
    .maybeSingle<{
      id: string;
      user_id: string;
      return_path: string;
      environment: string;
      expires_at: string;
      consumed_at: string | null;
    }>();

  if (stateError || !pendingState) {
    await logAppEvent({
      category: "ebay",
      severity: "warn",
      message: "eBay OAuth state was not found",
      metadata: { ...errorMetadata(stateError), errorCategory: "EBAY_OAUTH_STATE_INVALID" }
    });
    redirect("/account?ebay_error=invalid_state");
  }

  const returnPath = appendEbayParam(pendingState.return_path, "ebay_connected", "1");
  const errorReturnPath = (errorCode: string) => appendEbayParam(pendingState.return_path, "ebay_error", errorCode);

  if (pendingState.environment !== config.environment) {
    await logAppEvent({
      category: "ebay",
      severity: "warn",
      message: "eBay OAuth state environment mismatch",
      userId: pendingState.user_id,
      metadata: { stateId: pendingState.id, expected: pendingState.environment, actual: config.environment, errorCategory: "EBAY_OAUTH_STATE_INVALID" }
    });
    redirect(errorReturnPath("environment_mismatch"));
  }

  if (pendingState.consumed_at) {
    await logAppEvent({
      category: "ebay",
      severity: "warn",
      message: "eBay OAuth state was reused",
      userId: pendingState.user_id,
      metadata: { stateId: pendingState.id, errorCategory: "EBAY_OAUTH_STATE_REUSED" }
    });
    redirect(errorReturnPath("state_reused"));
  }

  if (new Date(pendingState.expires_at).getTime() < Date.now()) {
    await logAppEvent({
      category: "ebay",
      severity: "warn",
      message: "eBay OAuth state expired",
      userId: pendingState.user_id,
      metadata: { stateId: pendingState.id, errorCategory: "EBAY_OAUTH_STATE_EXPIRED" }
    });
    redirect(errorReturnPath("state_expired"));
  }

  if (!code) redirect(errorReturnPath("missing_code"));

  let token: Awaited<ReturnType<typeof exchangeEbayAuthorizationCode>>;
  try {
    token = await exchangeEbayAuthorizationCode(code);
  } catch (error) {
    await logAppEvent({
      category: "ebay",
      severity: "error",
      message: "eBay OAuth token exchange failed",
      userId: pendingState.user_id,
      metadata: { ...errorMetadata(error), stateId: pendingState.id, errorCategory: "EBAY_TOKEN_EXCHANGE_FAILED" }
    });
    redirect(errorReturnPath("token_exchange_failed"));
  }

  if (!token.refresh_token) redirect(errorReturnPath("missing_refresh_token"));

  const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const refreshTokenExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
    : null;
  let identity: { userId?: string; username?: string } | null = null;

  try {
    identity = await fetchEbayUserIdentity(token.access_token);
  } catch (error) {
    await logAppEvent({
      category: "ebay",
      severity: "warn",
      message: "Could not read eBay identity after OAuth connection",
      userId: pendingState.user_id,
      metadata: { ...errorMetadata(error), stateId: pendingState.id, errorCategory: "EBAY_ACCOUNT_LOOKUP_FAILED" }
    });
  }

  const connectionPayload: Record<string, unknown> = {
    user_id: pendingState.user_id,
    environment: config.environment,
    marketplace_id: config.marketplaceId,
    access_token_encrypted: encryptEbayToken(token.access_token),
    refresh_token_encrypted: encryptEbayToken(token.refresh_token),
    access_token_expires_at: accessTokenExpiresAt,
    token_scope: token.scope ?? config.scopes.join(" "),
    refresh_token_expires_at: refreshTokenExpiresAt,
    status: "connected",
    last_refreshed_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString()
  };

  if (identity?.userId) connectionPayload.ebay_user_id = identity.userId;
  if (identity?.username) connectionPayload.ebay_username = identity.username;

  const { error: upsertError } = await admin.from("ebay_connections").upsert({
    ...connectionPayload
  });

  if (upsertError) {
    await logAppEvent({
      category: "ebay",
      severity: "error",
      message: "eBay connection save failed",
      userId: pendingState.user_id,
      metadata: { ...errorMetadata(upsertError), stateId: pendingState.id, errorCategory: "EBAY_CONNECTION_SAVE_FAILED" }
    });
    redirect(errorReturnPath("connection_save_failed"));
  }

  await admin.from("ebay_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", pendingState.id);
  await admin.from("ebay_listing_defaults").upsert({
    user_id: pendingState.user_id,
    marketplace_id: config.marketplaceId,
    category_id: "183454",
    condition: "USED_EXCELLENT",
    currency: "USD",
    listing_duration: "GTC",
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id", ignoreDuplicates: true });

  await logAppEvent({
    category: "ebay",
    severity: "info",
    message: "eBay OAuth connection saved",
    userId: pendingState.user_id,
    metadata: {
      stateId: pendingState.id,
      environment: config.environment,
      ebayUserIdPresent: Boolean(identity?.userId),
      ebayUsernamePresent: Boolean(identity?.username),
      returnPath
    }
  });

  redirect(returnPath);
}

function appendEbayParam(path: string, key: string, value: string) {
  const url = new URL(path, "https://packwatcher.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
