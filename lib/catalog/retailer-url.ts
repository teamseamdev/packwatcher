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

  if (!normalizedRetailer || ["retailer", "store", "seller", "unknown"].includes(normalizedRetailer)) return null;

  if (normalizedRetailer.includes("ace")) return `https://www.acehardware.com/search?query=${query}`;
  if (normalizedRetailer.includes("galactic toys")) return `https://www.galactictoys.com/search?q=${query}`;
  if (normalizedRetailer === "fye" || normalizedRetailer.includes(" fye")) return `https://www.fye.com/search?q=${query}`;
  if (normalizedRetailer.includes("tcgplayer")) return `https://www.tcgplayer.com/search/all/product?q=${query}`;
  if (normalizedRetailer.includes("books a million") || normalizedRetailer.includes("books-a-million")) return `https://www.booksamillion.com/search?query=${query}`;
  if (normalizedRetailer.includes("world of books")) return `https://www.wob.com/en-us/search?search=${query}`;
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

  const domain = retailerDomainGuess(normalizedRetailer);
  return domain ? `https://www.${domain}/search?q=${query}` : null;
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
