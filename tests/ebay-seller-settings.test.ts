import assert from "node:assert/strict";
import test from "node:test";
import { manualOverrideValue } from "../lib/ebay/defaults.ts";
import { normalizeMerchantLocationOptions, normalizePolicyOptions } from "../lib/ebay/seller-settings-normalize.ts";

test("normalizes eBay seller payment policies", () => {
  const policies = normalizePolicyOptions({
    paymentPolicies: [{
      paymentPolicyId: "pay-123",
      name: "Default payment",
      description: "Immediate payment",
      marketplaceId: "EBAY_US"
    }]
  }, "paymentPolicies", "paymentPolicyId");

  assert.deepEqual(policies, [{
    id: "pay-123",
    name: "Default payment",
    description: "Immediate payment",
    marketplaceId: "EBAY_US"
  }]);
});

test("normalizes eBay fulfillment and return policy ids", () => {
  const fulfillment = normalizePolicyOptions({
    fulfillmentPolicies: [{ fulfillmentPolicyId: "ship-1", name: "Tracked shipping" }]
  }, "fulfillmentPolicies", "fulfillmentPolicyId");
  const returns = normalizePolicyOptions({
    returnPolicies: [{ returnPolicyId: "ret-1", name: "30 day returns" }]
  }, "returnPolicies", "returnPolicyId");

  assert.equal(fulfillment[0].id, "ship-1");
  assert.equal(fulfillment[0].name, "Tracked shipping");
  assert.equal(returns[0].id, "ret-1");
  assert.equal(returns[0].name, "30 day returns");
});

test("normalizes eBay merchant locations", () => {
  const locations = normalizeMerchantLocationOptions({
    locations: [{
      merchantLocationKey: "home-base",
      name: "Home inventory",
      merchantLocationStatus: "ENABLED",
      location: {
        address: {
          city: "Pittsburgh",
          stateOrProvince: "PA",
          postalCode: "15237",
          country: "US"
        }
      }
    }]
  });

  assert.deepEqual(locations, [{
    key: "home-base",
    name: "Home inventory",
    status: "ENABLED",
    addressSummary: "Pittsburgh, PA, 15237, US"
  }]);
});

test("supports alternate inventory location collection names", () => {
  const locations = normalizeMerchantLocationOptions({
    inventoryLocations: [{ merchantLocationKey: "warehouse-1" }]
  });

  assert.equal(locations[0].key, "warehouse-1");
  assert.equal(locations[0].name, "warehouse-1");
});

test("manual eBay defaults override selected dropdown values", () => {
  assert.equal(manualOverrideValue("selected-policy", ""), "selected-policy");
  assert.equal(manualOverrideValue("selected-policy", " manual-policy "), "manual-policy");
  assert.equal(manualOverrideValue("", ""), null);
  assert.equal(manualOverrideValue(undefined, "manual-location"), "manual-location");
});
