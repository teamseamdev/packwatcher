import { getEbayConfig, type EbayConfig } from "@/lib/ebay/config";

type EbayTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type: string;
  scope?: string;
};

type PublishInput = {
  accessToken: string;
  sku: string;
  title: string;
  description: string;
  imageUrls: string[];
  quantity: number;
  price: number;
  currency: string;
  categoryId: string;
  condition: string;
  marketplaceId: string;
  merchantLocationKey: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  fulfillmentPolicyId: string;
  listingDuration: string;
};

export function ebayAuthorizationUrl(state: string) {
  const config = getEbayConfig();
  const url = new URL("/oauth2/authorize", config.authBaseUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeEbayAuthorizationCode(code: string) {
  const config = getEbayConfig();
  return ebayTokenRequest(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.ruName
  });
}

export async function refreshEbayAccessToken(refreshToken: string) {
  const config = getEbayConfig();
  return ebayTokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: config.scopes.join(" ")
  });
}

export async function publishEbayInventoryOffer(input: PublishInput) {
  const config = getEbayConfig();
  const inventoryItemPayload = {
    availability: {
      shipToLocationAvailability: {
        quantity: input.quantity
      }
    },
    condition: input.condition,
    product: {
      title: input.title,
      description: input.description,
      aspects: {
        Game: ["Pokemon TCG"],
        Card: ["Pokemon"],
        Type: ["Collectible Card Game Single"]
      },
      imageUrls: input.imageUrls
    }
  };

  await ebayApi(config, input.accessToken, `/sell/inventory/v1/inventory_item/${encodeURIComponent(input.sku)}`, {
    method: "PUT",
    body: inventoryItemPayload
  });

  const offer = await ebayApi<{ offerId: string }>(config, input.accessToken, "/sell/inventory/v1/offer", {
    method: "POST",
    body: {
      sku: input.sku,
      marketplaceId: input.marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: input.quantity,
      categoryId: input.categoryId,
      merchantLocationKey: input.merchantLocationKey,
      listingPolicies: {
        paymentPolicyId: input.paymentPolicyId,
        returnPolicyId: input.returnPolicyId,
        fulfillmentPolicyId: input.fulfillmentPolicyId
      },
      pricingSummary: {
        price: {
          value: input.price.toFixed(2),
          currency: input.currency
        }
      },
      listingDuration: input.listingDuration
    }
  });

  const published = await ebayApi<{ listingId: string }>(config, input.accessToken, `/sell/inventory/v1/offer/${encodeURIComponent(offer.offerId)}/publish`, {
    method: "POST"
  });

  return {
    offerId: offer.offerId,
    listingId: published.listingId
  };
}

async function ebayTokenRequest(config: EbayConfig, params: Record<string, string>) {
  const response = await fetch(`${config.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`
    },
    body: new URLSearchParams(params)
  });

  if (!response.ok) {
    throw new Error(await ebayErrorMessage(response));
  }

  return response.json() as Promise<EbayTokenResponse>;
}

async function ebayApi<T = unknown>(
  config: EbayConfig,
  accessToken: string,
  path: string,
  options: { method: string; body?: unknown }
) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: options.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "content-language": "en-US"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    throw new Error(await ebayErrorMessage(response));
  }

  if (response.status === 204) return {} as T;
  return response.json().catch(() => ({})) as Promise<T>;
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
