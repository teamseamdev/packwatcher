import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshEbayAccessToken } from "@/lib/ebay/client";
import { decryptEbayToken, encryptEbayToken } from "@/lib/ebay/token-crypto";

type EbayConnectionTokenRow = {
  user_id: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  refresh_token_encrypted: string;
  refresh_token_expires_at: string | null;
  token_scope: string | null;
  status: string | null;
};

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export async function getValidEbayAccessToken(admin: SupabaseClient, userId: string) {
  const { data: connection, error } = await admin
    .from("ebay_connections")
    .select("user_id,access_token_encrypted,access_token_expires_at,refresh_token_encrypted,refresh_token_expires_at,token_scope,status")
    .eq("user_id", userId)
    .maybeSingle<EbayConnectionTokenRow>();

  if (error) throw new Error(error.message);
  if (!connection) throw new Error("Connect your eBay account from Account before publishing.");
  if (connection.status === "reauthorization_required" || connection.status === "disconnected") {
    throw new Error("Reconnect your eBay account from Account before publishing.");
  }

  const storedAccessToken = connection.access_token_encrypted;
  const accessTokenStillValid = storedAccessToken
    && connection.access_token_expires_at
    && new Date(connection.access_token_expires_at).getTime() - ACCESS_TOKEN_REFRESH_MARGIN_MS > Date.now();

  if (accessTokenStillValid) return decryptEbayToken(storedAccessToken);

  try {
    const token = await refreshEbayAccessToken(decryptEbayToken(connection.refresh_token_encrypted));
    const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
    const update: Record<string, unknown> = {
      access_token_encrypted: encryptEbayToken(token.access_token),
      access_token_expires_at: accessTokenExpiresAt,
      token_scope: token.scope ?? connection.token_scope,
      status: "connected",
      last_refreshed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString()
    };

    if (token.refresh_token) {
      update.refresh_token_encrypted = encryptEbayToken(token.refresh_token);
      update.refresh_token_expires_at = token.refresh_token_expires_in
        ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
        : connection.refresh_token_expires_at;
    }

    const { error: updateError } = await admin.from("ebay_connections").update(update).eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
    return token.access_token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "eBay token refresh failed.";
    await admin.from("ebay_connections").update({
      status: "reauthorization_required",
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString()
    }).eq("user_id", userId);
    throw new Error("Reconnect your eBay account from Account before publishing.");
  }
}
