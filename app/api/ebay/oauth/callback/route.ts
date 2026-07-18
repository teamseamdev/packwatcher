import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeEbayAuthorizationCode } from "@/lib/ebay/client";
import { getEbayConfig } from "@/lib/ebay/config";
import { encryptEbayToken } from "@/lib/ebay/token-crypto";

export async function GET(request: Request) {
  const { user } = await requireUser();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("packwatcher_ebay_oauth_state")?.value;
  cookieStore.delete("packwatcher_ebay_oauth_state");

  if (error) redirect(`/account?ebay_error=${encodeURIComponent(error)}`);
  if (!code || !state || !expectedState || state !== expectedState) {
    redirect("/account?ebay_error=invalid_state");
  }

  const token = await exchangeEbayAuthorizationCode(code);
  if (!token.refresh_token) redirect("/account?ebay_error=missing_refresh_token");

  const config = getEbayConfig();
  const admin = createAdminClient();
  const refreshTokenExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
    : null;

  const { error: upsertError } = await admin.from("ebay_connections").upsert({
    user_id: user.id,
    environment: config.environment,
    refresh_token_encrypted: encryptEbayToken(token.refresh_token),
    token_scope: token.scope ?? config.scopes.join(" "),
    refresh_token_expires_at: refreshTokenExpiresAt,
    updated_at: new Date().toISOString()
  });

  if (upsertError) redirect(`/account?ebay_error=${encodeURIComponent(upsertError.message)}`);

  await admin.from("ebay_listing_defaults").upsert({
    user_id: user.id,
    marketplace_id: config.marketplaceId,
    category_id: "183454",
    condition: "USED_EXCELLENT",
    currency: "USD",
    listing_duration: "GTC",
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id", ignoreDuplicates: true });

  redirect("/account?ebay_connected=1");
}
