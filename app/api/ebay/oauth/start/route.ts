import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ebayAuthorizationUrl } from "@/lib/ebay/client";
import { getEbayConfig } from "@/lib/ebay/config";
import { EBAY_OAUTH_STATE_COOKIE, EBAY_OAUTH_STATE_MAX_AGE_SECONDS, ebayOAuthExpiresAt, hashEbayOAuthState, safeEbayReturnPath } from "@/lib/ebay/oauth-state";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { user } = await requireUser();
  const requestUrl = new URL(request.url);
  const returnPath = safeEbayReturnPath(requestUrl.searchParams.get("returnTo"));
  const config = getEbayConfig();
  const state = randomBytes(24).toString("base64url");
  const admin = createAdminClient();
  const { data: stateRecord, error } = await admin
    .from("ebay_oauth_states")
    .insert({
      user_id: user.id,
      state_hash: hashEbayOAuthState(state),
      return_path: returnPath,
      environment: config.environment,
      expires_at: ebayOAuthExpiresAt()
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !stateRecord) {
    await logAppEvent({
      category: "ebay",
      severity: "error",
      message: "Could not create eBay OAuth state",
      userId: user.id,
      metadata: errorMetadata(error)
    });
    redirect("/account?ebay_error=state_create_failed");
  }

  const cookieStore = await cookies();
  cookieStore.set(EBAY_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: EBAY_OAUTH_STATE_MAX_AGE_SECONDS
  });

  redirect(ebayAuthorizationUrl(state));
}
