import { fetchPageHtml } from "@/lib/fetch-page-html";

export type ProductMetadata = {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  storeName: string | null;
};

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function metaContent(html: string, property: string) {
  const escaped = property.replaceAll(":", "\\:");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return null;
}

function titleFromHtml(html: string) {
  const ogTitle = metaContent(html, "og:title") ?? metaContent(html, "twitter:title");
  if (ogTitle) return ogTitle;

  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]).replace(/\s+\|.+$/, "") : null;
}

function priceFromHtml(html: string) {
  const metaPrice =
    metaContent(html, "product:price:amount") ??
    metaContent(html, "og:price:amount") ??
    metaContent(html, "twitter:data1");
  const metaMatch = metaPrice?.replace(/,/g, "").match(/\$?\s?(\d{1,5}(?:\.\d{2})?)/);
  const metaValue = metaMatch ? Number(metaMatch[1]) : null;
  if (typeof metaValue === "number" && Number.isFinite(metaValue) && metaValue > 0) return metaValue;

  const structuredPatterns = [
    /"currentPrice"\s*:\s*\{[^}]*"price"\s*:\s*(\d{1,5}(?:\.\d{1,2})?)/i,
    /"price"\s*:\s*"?(\d{1,5}(?:\.\d{1,2})?)"?\s*,\s*"priceCurrency"\s*:\s*"USD"/i,
    /"priceCurrency"\s*:\s*"USD"\s*,\s*"price"\s*:\s*"?(\d{1,5}(?:\.\d{1,2})?)"?/i,
    /"salePrice"\s*:\s*(\d{1,5}(?:\.\d{1,2})?)/i,
    /"priceInfo"\s*:\s*\{[^}]*"linePrice"\s*:\s*"?\$?(\d{1,5}(?:\.\d{1,2})?)"?/i
  ];

  const compact = html.replace(/,/g, "").replace(/\s+/g, " ");
  for (const pattern of structuredPatterns) {
    const match = compact.match(pattern);
    const value = match?.[1] ? Number(match[1]) : null;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }

  return null;
}

function storeFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.split(".").slice(0, -1).join(".") || host;
  } catch {
    return null;
  }
}

function absoluteUrl(url: string | null, base: string) {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

export function extractProductMetadata(html: string, url: string): ProductMetadata {
  return {
    title: titleFromHtml(html),
    imageUrl: absoluteUrl(metaContent(html, "og:image") ?? metaContent(html, "twitter:image"), url),
    price: priceFromHtml(html),
    storeName: storeFromUrl(url)
  };
}

export async function fetchProductMetadata(url: string) {
  const html = await fetchPageHtml(url, 1);
  return extractProductMetadata(html, url);
}
