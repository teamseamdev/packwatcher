export type EbayEnvironment = "sandbox" | "production";

export type EbayConfig = {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  ruName: string;
  scopes: string[];
  authBaseUrl: string;
  apiBaseUrl: string;
  identityBaseUrl: string;
  marketplaceId: string;
};

const DEFAULT_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account"
];

export function getEbayConfig(): EbayConfig {
  const environment = (process.env.EBAY_ENVIRONMENT === "sandbox" ? "sandbox" : "production") as EbayEnvironment;
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const ruName = process.env.EBAY_RU_NAME;

  if (!clientId || !clientSecret || !ruName) {
    throw new Error("eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME.");
  }

  return {
    environment,
    clientId,
    clientSecret,
    ruName,
    scopes: (process.env.EBAY_SCOPES ?? DEFAULT_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
    authBaseUrl: environment === "sandbox" ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com",
    apiBaseUrl: environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
    identityBaseUrl: environment === "sandbox" ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com",
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
  };
}

export function ebayListingUrl(listingId: string) {
  return `https://www.ebay.com/itm/${listingId}`;
}
