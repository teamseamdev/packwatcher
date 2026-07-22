import assert from "node:assert/strict";
import test from "node:test";
import {
  isMonitoringTestScenario,
  monitoringTestEventForScenario,
  MONITORING_TEST_SCENARIOS
} from "../lib/monitoring/test-events.ts";

test("monitoring smoke-test scenarios cover launch-critical integrations", () => {
  assert.deepEqual([...MONITORING_TEST_SCENARIOS], [
    "scanner",
    "openai",
    "retailer",
    "stripe",
    "ebay",
    "notification"
  ]);
});

test("monitoring smoke-test events are warn/error category events", () => {
  for (const scenario of MONITORING_TEST_SCENARIOS) {
    const event = monitoringTestEventForScenario(scenario, "request-1");
    assert.equal(event.category, scenario === "openai" ? "openai" : scenario);
    assert.match(event.message, /Monitoring smoke test/);
    assert.notEqual(event.severity, "info");
    assert.equal(event.metadata?.requestId, "request-1");
    assert.equal(event.metadata?.expectedInSentry, true);
  }
});

test("monitoring scenario validation rejects unknown categories", () => {
  assert.equal(isMonitoringTestScenario("scanner"), true);
  assert.equal(isMonitoringTestScenario("unknown"), false);
  assert.equal(isMonitoringTestScenario(""), false);
});
