import type { SupabaseClient } from "@supabase/supabase-js";
import { getEbayConfig } from "@/lib/ebay/config";
import { getValidEbayAccessToken } from "@/lib/ebay/connection";
import {
  normalizeMerchantLocationOptions,
  normalizePolicyOptions,
  type EbayMerchantLocationOption,
  type EbaySellerPolicyOption
} from "@/lib/ebay/seller-settings-normalize";

export type EbaySellerSettingsResult = {
  marketplaceId: string;
  paymentPolicies: EbaySellerPolicyOption[];
  fulfillmentPolicies: EbaySellerPolicyOption[];
  returnPolicies: EbaySellerPolicyOption[];
  merchantLocations: EbayMerchantLocationOption[];
  errors: Array<{ source: string; message: string }>;
};

export async function fetchEbaySellerSettings(admin: SupabaseClient, userId: string, marketplaceId: string): Promise<EbaySellerSettingsResult> {
  const accessToken = await getValidEbayAccessToken(admin, userId);
  const config = getEbayConfig();
  const encodedMarketplace = encodeURIComponent(marketplaceId);

  const [payment, fulfillment, returns, locations] = await Promise.allSettled([
    ebayGet(config.apiBaseUrl, accessToken, `/sell/account/v1/payment_policy?marketplace_id=${encodedMarketplace}`),
    ebayGet(config.apiBaseUrl, accessToken, `/sell/account/v1/fulfillment_policy?marketplace_id=${encodedMarketplace}`),
    ebayGet(config.apiBaseUrl, accessToken, `/sell/account/v1/return_policy?marketplace_id=${encodedMarketplace}`),
    ebayGet(config.apiBaseUrl, accessToken, "/sell/inventory/v1/location?limit=200&offset=0")
  ]);

  const errors: EbaySellerSettingsResult["errors"] = [];
  const payload = <T>(result: PromiseSettledResult<unknown>, source: string, fallback: T) => {
    if (result.status === "fulfilled") return result.value;
    errors.push({ source, message: result.reason instanceof Error ? result.reason.message : `${source} fetch failed.` });
    return fallback;
  };

  return {
    marketplaceId,
    paymentPolicies: normalizePolicyOptions(payload(payment, "payment policies", {}), "paymentPolicies", "paymentPolicyId"),
    fulfillmentPolicies: normalizePolicyOptions(payload(fulfillment, "fulfillment policies", {}), "fulfillmentPolicies", "fulfillmentPolicyId"),
    returnPolicies: normalizePolicyOptions(payload(returns, "return policies", {}), "returnPolicies", "returnPolicyId"),
    merchantLocations: normalizeMerchantLocationOptions(payload(locations, "merchant locations", {})),
    errors
  };
}

async function ebayGet(apiBaseUrl: string, accessToken: string, path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "content-language": "en-US"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await ebayErrorMessage(response));
  }

  return response.json().catch(() => ({}));
}

async function ebayErrorMessage(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body) return `eBay API failed with status ${response.status}.`;
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string; longMessage?: string }>; error_description?: string; error?: string };
    const first = parsed.errors?.[0];
    return first?.longMessage || first?.message || parsed.error_description || parsed.error || `eBay API failed with status ${response.status}.`;
  } catch {
    return body.slice(0, 500);
  }
}
