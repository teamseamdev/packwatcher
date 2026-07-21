import assert from "node:assert/strict";
import test from "node:test";
import { aggregatePrices } from "../lib/retailers/shared/price-aggregation.ts";
import { isLikelyPokemonProduct, pokemonShoppingQuery } from "../lib/catalog-importers/pokemon-product-filter.ts";
import { isGoogleUrl, resolveRetailerUrl } from "../lib/catalog/retailer-url.ts";
import { FOUNDER_CARD_SCAN_LIMIT, FOUNDER_MEMBERSHIP_LIMIT, FOUNDER_VIDEO_SCAN_LIMIT, usageLimitForPlan } from "../lib/plans.ts";
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

test("gives admins founder-level usage without using founder membership spots", () => {
  assert.equal(usageLimitForPlan("admin", "card_scan"), FOUNDER_CARD_SCAN_LIMIT);
  assert.equal(usageLimitForPlan("admin", "video_scan"), FOUNDER_VIDEO_SCAN_LIMIT);
  assert.equal(usageLimitForPlan("founder", "card_scan"), FOUNDER_CARD_SCAN_LIMIT);
  assert.equal(usageLimitForPlan("founder", "video_scan"), FOUNDER_VIDEO_SCAN_LIMIT);
  assert.equal(FOUNDER_MEMBERSHIP_LIMIT, 100);
});
