const googleHosts = /\b(google\.|googleadservices\.com|googlesyndication\.com)\b/i;

export function resolveRetailerUrl(rawUrl: string | null | undefined, retailer?: string | null, title?: string | null, postalCode?: string | null) {
  const direct = extractDirectUrl(rawUrl);
  if (direct && !isGoogleUrl(direct)) return withRetailerLocationHint(direct, retailer, postalCode);

  const fallback = retailerSearchUrl(retailer, title, postalCode);
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

function retailerSearchUrl(retailer?: string | null, title?: string | null, postalCode?: string | null) {
  const normalizedRetailer = (retailer ?? "").toLowerCase();
  const query = encodeURIComponent((title ?? "pokemon cards").replace(/\s+/g, " ").trim() || "pokemon cards");
  const zip = normalizePostalCode(postalCode);

  if (!normalizedRetailer || ["retailer", "store", "seller", "unknown"].includes(normalizedRetailer)) return null;

  if (normalizedRetailer.includes("ace")) return appendRawParams(`https://www.acehardware.com/search?query=${query}`, zip ? { postalCode: zip } : {});
  if (normalizedRetailer.includes("galactic toys")) return `https://www.galactictoys.com/search?q=${query}`;
  if (normalizedRetailer === "fye" || normalizedRetailer.includes(" fye")) return `https://www.fye.com/search?q=${query}`;
  if (normalizedRetailer.includes("tcgplayer")) return `https://www.tcgplayer.com/search/all/product?q=${query}`;
  if (normalizedRetailer.includes("books a million") || normalizedRetailer.includes("books-a-million")) return `https://www.booksamillion.com/search?query=${query}`;
  if (normalizedRetailer.includes("world of books")) return `https://www.wob.com/en-us/search?search=${query}`;
  if (normalizedRetailer.includes("walmart")) return appendRawParams(`https://www.walmart.com/search?q=${query}`, zip ? { location: zip, facet: "fulfillment_method:Pickup" } : {});
  if (normalizedRetailer.includes("target")) return appendRawParams(`https://www.target.com/s?searchTerm=${query}`, zip ? { zip } : {});
  if (normalizedRetailer.includes("gamestop")) return appendRawParams(`https://www.gamestop.com/search/?q=${query}`, zip ? { postalCode: zip } : {});
  if (normalizedRetailer.includes("best buy") || normalizedRetailer.includes("bestbuy")) return appendRawParams(`https://www.bestbuy.com/site/searchpage.jsp?st=${query}`, zip ? { loc: zip } : {});
  if (normalizedRetailer.includes("amazon")) return `https://www.amazon.com/s?k=${query}`;
  if (normalizedRetailer.includes("pokemon center")) return `https://www.pokemoncenter.com/search/${query}`;
  if (normalizedRetailer.includes("barnes")) return `https://www.barnesandnoble.com/s/${query}`;
  if (normalizedRetailer.includes("costco")) return `https://www.costco.com/CatalogSearch?keyword=${query}`;
  if (normalizedRetailer.includes("sam")) return `https://www.samsclub.com/s/${query}`;
  if (normalizedRetailer.includes("meijer")) return `https://www.meijer.com/shopping/search.html?text=${query}`;
  if (normalizedRetailer.includes("cvs")) return `https://www.cvs.com/search?searchTerm=${query}`;
  if (normalizedRetailer.includes("walgreens")) return `https://www.walgreens.com/search/results.jsp?Ntt=${query}`;

  const domain = retailerDomainGuess(normalizedRetailer);
  return domain ? `https://www.${domain}/search?q=${query}` : null;
}

function withRetailerLocationHint(rawUrl: string, retailer?: string | null, postalCode?: string | null) {
  const zip = normalizePostalCode(postalCode);
  if (!zip) return rawUrl;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const host = url.hostname.toLowerCase();
  const normalizedRetailer = (retailer ?? "").toLowerCase();
  const text = `${host} ${normalizedRetailer}`;

  if (text.includes("walmart")) return appendRawParams(rawUrl, { location: zip });
  if (text.includes("target")) return appendRawParams(rawUrl, { zip });
  if (text.includes("gamestop")) return appendRawParams(rawUrl, { postalCode: zip });
  if (text.includes("bestbuy") || text.includes("best buy")) return appendRawParams(rawUrl, { loc: zip });
  if (text.includes("acehardware") || text.includes("ace hardware")) return appendRawParams(rawUrl, { postalCode: zip });
  if (text.includes("ebay")) return appendRawParams(rawUrl, { _stpos: zip });
  return rawUrl;
}

function appendRawParams(rawUrl: string, params: Record<string, string>) {
  const entries = Object.entries(params).filter(([, value]) => value);
  if (!entries.length) return rawUrl;

  const existingKeys = new Set<string>();
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.forEach((_, key) => existingKeys.add(key));
  } catch {
    return rawUrl;
  }

  const suffix = entries
    .filter(([key]) => !existingKeys.has(key))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  if (!suffix) return rawUrl;
  return `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}${suffix}`;
}

function normalizePostalCode(postalCode?: string | null) {
  const trimmed = postalCode?.trim();
  return trimmed && /^\d{5}(?:-\d{4})?$/.test(trimmed) ? trimmed : null;
}

function retailerDomainGuess(retailer: string) {
  const cleaned = retailer
    .replace(/\.com\b/g, "")
    .replace(/&/g, "and")
    .replace(/\b(the|official|store|shop|online)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

  if (cleaned.length < 4 || cleaned.length > 36) return null;
  return `${cleaned}.com`;
}
