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
  const priceMatch = (metaPrice ?? html).replace(/,/g, "").match(/\$?\s?(\d{1,5}(?:\.\d{2})?)/);
  return priceMatch ? Number(priceMatch[1]) : null;
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
