const googleHosts = /\b(google\.|googleadservices\.com|googlesyndication\.com)\b/i;

export function resolveRetailerUrl(rawUrl: string | null | undefined, retailer?: string | null, title?: string | null) {
  const direct = extractDirectUrl(rawUrl);
  if (direct && !isGoogleUrl(direct)) return direct;

  const fallback = retailerSearchUrl(retailer, title);
  if (fallback) return fallback;

  return rawUrl ?? "";
}

export function isGoogleUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return false;
  try {
    return googleHosts.test(new URL(rawUrl).hostname);
  } catch {
    return googleHosts.test(rawUrl);
  }
}

function extractDirectUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let current = rawUrl.trim();

  for (let index = 0; index < 3; index += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return current || null;
    }

    if (!isGoogleUrl(parsed.toString())) return parsed.toString();

    const embedded = ["url", "q", "u", "adurl", "rurl"].flatMap((key) => {
      const value = parsed.searchParams.get(key);
      return value ? [value] : [];
    }).find((value) => /^https?:\/\//i.test(value) && !isGoogleUrl(value));

    if (!embedded) return parsed.toString();
    current = embedded;
  }

  return current;
}

function retailerSearchUrl(retailer?: string | null, title?: string | null) {
  const normalizedRetailer = (retailer ?? "").toLowerCase();
  const query = encodeURIComponent((title ?? "pokemon cards").replace(/\s+/g, " ").trim() || "pokemon cards");

  if (normalizedRetailer.includes("ace")) return `https://www.acehardware.com/search?query=${query}`;
  if (normalizedRetailer.includes("walmart")) return `https://www.walmart.com/search?q=${query}`;
  if (normalizedRetailer.includes("target")) return `https://www.target.com/s?searchTerm=${query}`;
  if (normalizedRetailer.includes("gamestop")) return `https://www.gamestop.com/search/?q=${query}`;
  if (normalizedRetailer.includes("best buy") || normalizedRetailer.includes("bestbuy")) return `https://www.bestbuy.com/site/searchpage.jsp?st=${query}`;
  if (normalizedRetailer.includes("amazon")) return `https://www.amazon.com/s?k=${query}`;
  if (normalizedRetailer.includes("pokemon center")) return `https://www.pokemoncenter.com/search/${query}`;
  if (normalizedRetailer.includes("barnes")) return `https://www.barnesandnoble.com/s/${query}`;
  if (normalizedRetailer.includes("costco")) return `https://www.costco.com/CatalogSearch?keyword=${query}`;
  if (normalizedRetailer.includes("sam")) return `https://www.samsclub.com/s/${query}`;
  if (normalizedRetailer.includes("meijer")) return `https://www.meijer.com/shopping/search.html?text=${query}`;
  if (normalizedRetailer.includes("cvs")) return `https://www.cvs.com/search?searchTerm=${query}`;
  if (normalizedRetailer.includes("walgreens")) return `https://www.walgreens.com/search/results.jsp?Ntt=${query}`;

  return null;
}
