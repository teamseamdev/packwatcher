import assert from "node:assert/strict";
import test from "node:test";
import { aggregatePrices } from "../lib/retailers/shared/price-aggregation.ts";
import { isLikelyPokemonProduct, pokemonShoppingQuery } from "../lib/catalog-importers/pokemon-product-filter.ts";
import { classifyOfferAvailability, isAvailableCatalogStatus } from "../lib/catalog/offer-availability.ts";
import { isGoogleUrl, resolveRetailerUrl } from "../lib/catalog/retailer-url.ts";
import { FOUNDER_CARD_SCAN_LIMIT, FOUNDER_MEMBERSHIP_LIMIT, FOUNDER_VIDEO_SCAN_LIMIT, usageLimitForPlan } from "../lib/plans.ts";
import { compareCatalogOffers, distanceLabel, fulfillmentLabel, verificationLabel, offerDistanceMiles } from "../lib/catalog/offer-ranking.ts";
import { distanceMiles } from "../lib/location/distance.ts";
import { createConfiguredShoppingSearchProvider } from "../lib/retailers/shopping-search/connector.ts";
import { matchProduct } from "../lib/retailers/shared/product-matching.ts";
import { freshnessLabel, normalizeAvailabilityStatus, normalizeTitle, normalizeUpc } from "../lib/retailers/shared/normalize.ts";
import { notificationEventKey, shouldSendRestockAlert } from "../lib/retailers/shared/restock-events.ts";
import { statusForInStockMatch } from "../lib/stock-checkers/fulfillment.ts";
import { confidenceLevel, isAvailableStatus, reduceAvailabilityState, restockEventKey } from "../lib/tracker/availability-reducer.ts";
import type { ProductAlert } from "../lib/types.ts";

test("normalizes titles and UPCs", () => {
  assert.equal(normalizeTitle("Pokémon TCG: Scarlet & Violet 151 Elite Trainer Box"), "151 elite trainer box");
  assert.equal(normalizeUpc("0 820650 85321 0"), "820650853210");
  assert.equal(normalizeUpc("abc"), null);
});

test("matches products by UPC before fuzzy title", () => {
  const result = matchProduct([
    { id: "wrong", title: "Surging Sparks Booster Box", upc: "111111111111" },
    { id: "right", title: "Pokemon 151 Elite Trainer Box", upc: "0820650853210" }
  ], {
    title: "Some retailer title",
    upc: "820650853210"
  });

  assert.equal(result.productId, "right");
  assert.equal(result.requiresReview, false);
});

test("does not merge booster box with booster bundle", () => {
  const result = matchProduct([
    { id: "box", title: "Pokemon Surging Sparks Booster Box", productType: "Booster box" }
  ], {
    title: "Pokemon Surging Sparks Booster Bundle",
    productType: "Booster bundle"
  });

  assert.equal(result.productId, null);
  assert.equal(result.requiresReview, true);
});

test("aggregates prices with official retailer filtering and trimmed average", () => {
  const result = aggregatePrices([
    { retailerProductId: "1", retailer: "Target", status: "in_stock", price: 49.99, officialRetailerSeller: true, checkedAt: new Date().toISOString() },
    { retailerProductId: "2", retailer: "Walmart", status: "shipping_available", price: 54.99, officialRetailerSeller: true, checkedAt: new Date().toISOString() },
    { retailerProductId: "3", retailer: "Amazon", status: "in_stock", price: 199.99, officialRetailerSeller: false, checkedAt: new Date().toISOString() },
    { retailerProductId: "4", retailer: "GameStop", status: "out_of_stock", price: 44.99, officialRetailerSeller: true, checkedAt: new Date().toISOString() }
  ]);

  assert.equal(result.qualifyingListingCount, 2);
  assert.equal(result.inStockListingCount, 3);
  assert.equal(result.lowestCurrentPrice, 49.99);
  assert.equal(result.highestCurrentPrice, 54.99);
  assert.equal(result.averageAvailablePrice, 52.49);
});

test("counts shipping-only and pickup-only offers as available", () => {
  assert.equal(isAvailableCatalogStatus("shipping_only"), true);
  assert.equal(isAvailableCatalogStatus("pickup_only"), true);
  const result = aggregatePrices([
    { retailerProductId: "1", retailer: "Walmart", status: "shipping_only", price: 36.99, officialRetailerSeller: true, checkedAt: new Date().toISOString() },
    { retailerProductId: "2", retailer: "Target", status: "pickup_only", price: 39.99, officialRetailerSeller: true, checkedAt: new Date().toISOString() }
  ]);
  assert.equal(result.inStockListingCount, 2);
  assert.equal(result.qualifyingListingCount, 2);
  assert.equal(result.lowestCurrentPrice, 36.99);
});

test("classifies provider fulfillment evidence without marking it verified", () => {
  const shipping = classifyOfferAvailability({
    status: "unknown",
    availabilityText: "In stock online",
    shippingText: "Free delivery tomorrow",
    retailer: "Five Below",
    sourceConfidence: 0.68,
    verifiedByRetailerConnector: false
  });
  assert.equal(shipping.status, "shipping_only");
  assert.equal(shipping.inStock, true);
  assert.equal(shipping.shippingAvailable, true);
  assert.equal(shipping.pickupAvailable, false);
  assert.equal(shipping.confidence <= 0.72, true);

  const pickup = classifyOfferAvailability({
    status: "unknown",
    availabilityText: "Pickup available at nearby store",
    pickupText: "Pickup today",
    retailer: "Target",
    sourceConfidence: 0.68
  });
  assert.equal(pickup.status, "pickup_available");
  assert.equal(pickup.availabilityType, "local");
});

test("normalizes availability and freshness", () => {
  assert.equal(normalizeAvailabilityStatus("Available for pickup today"), "pickup_available");
  assert.equal(normalizeAvailabilityStatus("Sold Out"), "out_of_stock");
  assert.equal(freshnessLabel(new Date(Date.now() - 5 * 60000).toISOString()), "fresh");
  assert.equal(freshnessLabel(new Date(Date.now() - 180 * 60000).toISOString()), "stale");
});

test("classifies shipping and pickup fulfillment separately", () => {
  assert.equal(statusForInStockMatch("shipping available"), "shipping_available");
  assert.equal(statusForInStockMatch("pickup available"), "pickup_available");
});

test("deduplicates restock alerts by event key and respects max price", () => {
  const alert: ProductAlert = {
    id: "alert",
    user_id: "user",
    product_id: "product",
    notify_push: true,
    notify_email: false,
    max_price: 60,
    preferred_retailers: ["Target"],
    online_only: true,
    local_pickup: false,
    official_retailer_only: true,
    allow_third_party_sellers: false,
    created_at: new Date().toISOString()
  };
  const snapshot = {
    retailerProductId: "rp1",
    retailer: "Target",
    productId: "product",
    status: "in_stock" as const,
    previousStatus: "out_of_stock" as const,
    price: 49.99,
    officialRetailerSeller: true,
    availabilityType: "online" as const
  };

  assert.equal(shouldSendRestockAlert(alert, snapshot), true);
  assert.equal(notificationEventKey("user", snapshot), "user:rp1:online:online:4999:in_stock");
  assert.equal(shouldSendRestockAlert({ ...alert, max_price: 40 }, snapshot), false);
});

test("reduces availability observations into one confirmed restock event", () => {
  const checkedAt = new Date().toISOString();
  const transition = reduceAvailabilityState({
    status: "out_of_stock",
    price: 49.99,
    currency: "USD",
    availabilityType: "online",
    confidence: 0.9,
    lastCheckedAt: checkedAt,
    stateVersion: 4
  }, {
    catalogOfferId: "offer-1",
    productId: "product-1",
    retailer: "Target",
    previousStatus: "out_of_stock",
    status: "in_stock",
    price: 49.99,
    currency: "USD",
    availabilityType: "online",
    confidence: 0.86,
    checkedAt
  }, {
    retailer: "Target",
    sourceStrength: "structured",
    minimumRestockConfidence: 0.72,
    requireConfirmationForWeb: true,
    staleAfterMinutes: 60
  });

  assert.equal(transition.createRestockEvent, true);
  assert.equal(transition.requiresVerification, false);
  assert.equal(transition.nextState.stateVersion, 5);
  assert.equal(transition.eventKey, "live:offer-1:online:out_of_stock:in_stock:4999");
});

test("does not repeat restock events while a listing remains in stock", () => {
  const transition = reduceAvailabilityState({
    status: "in_stock",
    price: 49.99,
    currency: "USD",
    availabilityType: "online",
    confidence: 0.9,
    lastCheckedAt: new Date().toISOString(),
    stateVersion: 8
  }, {
    catalogOfferId: "offer-1",
    productId: "product-1",
    retailer: "Best Buy",
    status: "in_stock",
    price: 49.99,
    confidence: 0.95,
    checkedAt: new Date().toISOString()
  });

  assert.equal(transition.createRestockEvent, false);
  assert.equal(transition.eventKey, null);
  assert.equal(transition.nextState.stateVersion, 8);
});

test("requires verification for low-confidence web-derived restocks", () => {
  const transition = reduceAvailabilityState({
    status: "out_of_stock",
    price: null,
    currency: "USD",
    availabilityType: "online",
    confidence: 0.7,
    lastCheckedAt: new Date().toISOString(),
    stateVersion: 1
  }, {
    catalogOfferId: "offer-2",
    productId: "product-2",
    retailer: "Generic",
    status: "in_stock",
    price: 99.99,
    confidence: 0.41,
    checkedAt: new Date().toISOString()
  });

  assert.equal(transition.createRestockEvent, false);
  assert.equal(transition.requiresVerification, true);
});

test("classifies extended availability statuses and confidence labels", () => {
  assert.equal(isAvailableStatus("shipping_only"), true);
  assert.equal(isAvailableStatus("pickup_only"), true);
  assert.equal(isAvailableStatus("listing_removed"), false);
  assert.equal(confidenceLevel(0.9, new Date().toISOString()), "high");
  assert.equal(confidenceLevel(0.63, new Date().toISOString()), "medium");
  assert.equal(confidenceLevel(0.3, new Date().toISOString()), "low");
  assert.equal(confidenceLevel(0.95, new Date(Date.now() - 180 * 60000).toISOString()), "last_known");
});

test("ranks nearby local pickup offers before farther local offers and shipping", () => {
  const near = {
    id: "near",
    catalog_product_id: "p",
    product_id: "p",
    store_name: "Target",
    retailer: "Target",
    retailer_product_id: null,
    title: "Pokemon Booster Bundle",
    url: "https://target.example",
    status: "pickup_available" as const,
    last_price: 49.99,
    price: 49.99,
    currency: "USD",
    image_url: null,
    in_stock: true,
    availability_text: "Pickup available",
    last_checked_at: new Date().toISOString(),
    metadata: { distanceMiles: 2.4, pickupText: "Pickup available" },
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    catalog_products: null
  };
  const far = { ...near, id: "far", store_name: "Target Far", metadata: { distanceMiles: 18, pickupText: "Pickup available" } };
  const shipping = { ...near, id: "ship", store_name: "TCGplayer", status: "shipping_available" as const, metadata: { shippingText: "In stock for shipping" } };

  assert.equal(compareCatalogOffers(near, far) < 0, true);
  assert.equal(compareCatalogOffers(near, shipping) < 0, true);
  assert.equal(distanceLabel(near), "2.4 miles");
  assert.equal(offerDistanceMiles(far), 18);
});

test("labels discovery and verified retailer offers differently", () => {
  const base = {
    id: "offer",
    catalog_product_id: "p",
    product_id: "p",
    store_name: "Walmart",
    retailer: "Walmart",
    retailer_product_id: null,
    title: "Pokemon Booster Bundle",
    url: "https://walmart.example",
    status: "shipping_only" as const,
    last_price: 49.99,
    price: 49.99,
    currency: "USD",
    image_url: null,
    in_stock: true,
    availability_text: "In stock for shipping",
    last_checked_at: new Date().toISOString(),
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    catalog_products: null
  };
  assert.equal(fulfillmentLabel({ ...base, metadata: { verificationStatus: "discovery" } }), "Shipping only");
  assert.equal(verificationLabel({ ...base, metadata: { verificationStatus: "discovery" } }), "Discovery result");
  assert.equal(verificationLabel({ ...base, metadata: { verificationStatus: "verified", verifiedByRetailerConnector: true } }), "Verified by retailer");
});

test("calculates haversine distance for local ranking", () => {
  const pittsburgh = { latitude: 40.4406, longitude: -79.9959 };
  const northHills = { latitude: 40.5434, longitude: -80.0078 };
  const distance = distanceMiles(pittsburgh, northHills);
  assert.equal(distance > 6 && distance < 8, true);
});

test("restock event keys isolate test events from production events", () => {
  const live = restockEventKey({ catalogOfferId: "offer-1", previousStatus: "out_of_stock", status: "in_stock", price: 49.99 });
  const testKey = restockEventKey({ catalogOfferId: "offer-1", previousStatus: "out_of_stock", status: "in_stock", price: 49.99, isTest: true });
  assert.notEqual(live, testKey);
  assert.equal(testKey, "test:offer-1:online:out_of_stock:in_stock:4999");
});

test("filters shopping discovery to Pokemon sealed/card products", () => {
  assert.equal(pokemonShoppingQuery("Chaos Rising"), "pokemon sealed product Chaos Rising");
  assert.equal(isLikelyPokemonProduct({ title: "Chaos Rising", storeName: "World of Books", productUrl: "https://example.com/book" }), false);
  assert.equal(isLikelyPokemonProduct({ title: "Chaos Rising (Sword and Sorcery S20)", storeName: "Books A Million", productUrl: "https://example.com/book" }), false);
  assert.equal(isLikelyPokemonProduct({ title: "Pokemon Chaos Rising Blister Pack", storeName: "TCGplayer", productUrl: "https://example.com/pokemon" }), true);
  assert.equal(isLikelyPokemonProduct({ title: "Surging Sparks Elite Trainer Box", storeName: "Target", productUrl: "https://example.com/item" }), true);
});

test("resolves shopping provider Google URLs to retailer URLs", () => {
  const title = "Pokemon Mega Evolution Chaos Rising Booster Pack";
  const galactic = resolveRetailerUrl("https://www.google.com/shopping/product/123", "Galactic Toys", title);
  const embedded = resolveRetailerUrl(`https://www.google.com/url?q=${encodeURIComponent("https://www.acehardware.com/departments/toys-and-games/pokemon")}`, "Ace Hardware", title);

  assert.equal(isGoogleUrl(galactic), false);
  assert.equal(galactic, "https://www.galactictoys.com/search?q=Pokemon%20Mega%20Evolution%20Chaos%20Rising%20Booster%20Pack");
  assert.equal(embedded, "https://www.acehardware.com/departments/toys-and-games/pokemon");
});

test("adds ZIP hints to retailer search and direct product URLs when supported", () => {
  const title = "Pokemon Mega Evolution Chaos Rising Booster Pack";
  assert.equal(
    resolveRetailerUrl("https://www.google.com/shopping/product/123", "GameStop", title, "15237"),
    "https://www.gamestop.com/search/?q=Pokemon%20Mega%20Evolution%20Chaos%20Rising%20Booster%20Pack&postalCode=15237"
  );
  assert.equal(
    resolveRetailerUrl("https://www.walmart.com/ip/123", "Walmart", title, "15237"),
    "https://www.walmart.com/ip/123?location=15237"
  );
  assert.equal(
    resolveRetailerUrl("https://www.ebay.com/itm/123", "eBay", title, "15237"),
    "https://www.ebay.com/itm/123?_stpos=15237"
  );
});

test("SerpAPI provider normalizes Google Shopping, Walmart, Amazon, and eBay search engines", async () => {
  const originalFetch = globalThis.fetch;
  const originalProvider = process.env.SHOPPING_SEARCH_PROVIDER;
  const originalUrl = process.env.SHOPPING_SEARCH_API_URL;
  const originalKey = process.env.SHOPPING_SEARCH_API_KEY;
  const originalEngines = process.env.SERPAPI_SEARCH_ENGINES;

  process.env.SHOPPING_SEARCH_PROVIDER = "serpapi";
  process.env.SHOPPING_SEARCH_API_URL = "https://serpapi.test/search";
  process.env.SHOPPING_SEARCH_API_KEY = "test-key";
  process.env.SERPAPI_SEARCH_ENGINES = "google_shopping,walmart,amazon,ebay";

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const engine = url.searchParams.get("engine");
    const payload = engine === "google_shopping" ? {
      shopping_results: [{ title: "Pokemon Booster Bundle", source: "Target", link: "https://target.com/p/test", extracted_price: 49.99, thumbnail: "https://img.test/a.jpg", delivery: "Free shipping" }]
    } : engine === "walmart" ? {
      organic_results: [{ title: "Pokemon Elite Trainer Box", product_page_url: "https://www.walmart.com/ip/123", extracted_price: 54.99, thumbnail: "https://img.test/b.jpg", primary_offer: { availability: "In stock for pickup" }, pickup: "Pickup today" }]
    } : engine === "amazon" ? {
      organic_results: [{ title: "Pokemon Booster Pack", link_clean: "https://www.amazon.com/dp/B000TEST", extracted_price: 6.99, stock: "Only 3 left in stock", delivery: ["FREE delivery Tomorrow"], prime: true }]
    } : {
      organic_results: [{ title: "Pokemon Collection Box", link: "https://www.ebay.com/itm/123", price: "$29.99", shipping: "Free shipping", condition: "New", seller: "card-shop" }]
    };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const provider = createConfiguredShoppingSearchProvider();
    assert.ok(provider);
    const results = await provider.searchProducts("pokemon cards", { postalCode: "15237" });
    assert.equal(results.length, 4);
    assert.deepEqual(results.map((result) => result.provider).sort(), ["serpapi:amazon", "serpapi:ebay", "serpapi:google_shopping", "serpapi:walmart"]);
    assert.equal(results.find((result) => result.retailer === "Walmart")?.price, 54.99);
    assert.equal(results.find((result) => result.retailer === "Walmart")?.pickupText, "Pickup today");
    assert.equal(results.find((result) => result.retailer === "Amazon")?.shippingText, "FREE delivery Tomorrow");
    assert.equal(results.find((result) => result.retailer === "eBay")?.sellerName, "card-shop");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("SHOPPING_SEARCH_PROVIDER", originalProvider);
    restoreEnv("SHOPPING_SEARCH_API_URL", originalUrl);
    restoreEnv("SHOPPING_SEARCH_API_KEY", originalKey);
    restoreEnv("SERPAPI_SEARCH_ENGINES", originalEngines);
  }
});

test("gives admins founder-level usage without using founder membership spots", () => {
  assert.equal(usageLimitForPlan("admin", "card_scan"), FOUNDER_CARD_SCAN_LIMIT);
  assert.equal(usageLimitForPlan("admin", "video_scan"), FOUNDER_VIDEO_SCAN_LIMIT);
  assert.equal(usageLimitForPlan("founder", "card_scan"), FOUNDER_CARD_SCAN_LIMIT);
  assert.equal(usageLimitForPlan("founder", "video_scan"), FOUNDER_VIDEO_SCAN_LIMIT);
  assert.equal(FOUNDER_MEMBERSHIP_LIMIT, 100);
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
