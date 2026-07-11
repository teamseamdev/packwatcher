import assert from "node:assert/strict";
import test from "node:test";
import { aggregatePrices } from "../lib/retailers/shared/price-aggregation.ts";
import { isLikelyPokemonProduct, pokemonShoppingQuery } from "../lib/catalog-importers/pokemon-product-filter.ts";
import { matchProduct } from "../lib/retailers/shared/product-matching.ts";
import { freshnessLabel, normalizeAvailabilityStatus, normalizeTitle, normalizeUpc } from "../lib/retailers/shared/normalize.ts";
import { notificationEventKey, shouldSendRestockAlert } from "../lib/retailers/shared/restock-events.ts";
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

test("filters shopping discovery to Pokemon sealed/card products", () => {
  assert.equal(pokemonShoppingQuery("Chaos Rising"), "pokemon sealed product Chaos Rising");
  assert.equal(isLikelyPokemonProduct({ title: "Chaos Rising", storeName: "World of Books", productUrl: "https://example.com/book" }), false);
  assert.equal(isLikelyPokemonProduct({ title: "Chaos Rising (Sword and Sorcery S20)", storeName: "Books A Million", productUrl: "https://example.com/book" }), false);
  assert.equal(isLikelyPokemonProduct({ title: "Pokemon Chaos Rising Blister Pack", storeName: "TCGplayer", productUrl: "https://example.com/pokemon" }), true);
  assert.equal(isLikelyPokemonProduct({ title: "Surging Sparks Elite Trainer Box", storeName: "Target", productUrl: "https://example.com/item" }), true);
});
