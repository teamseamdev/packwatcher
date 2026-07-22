import type { logAppEvent } from "@/lib/monitoring/log";

export const MONITORING_TEST_SCENARIOS = [
  "scanner",
  "openai",
  "retailer",
  "stripe",
  "ebay",
  "notification"
] as const;

export type MonitoringTestScenario = typeof MONITORING_TEST_SCENARIOS[number];

export type MonitoringTestEvent = Parameters<typeof logAppEvent>[0];

export function isMonitoringTestScenario(value: string): value is MonitoringTestScenario {
  return MONITORING_TEST_SCENARIOS.includes(value as MonitoringTestScenario);
}

export function monitoringTestEventForScenario(scenario: MonitoringTestScenario, requestId: string): MonitoringTestEvent {
  const baseMetadata = {
    requestId,
    source: "monitoring-smoke-test",
    expectedInSentry: true
  };

  switch (scenario) {
    case "scanner":
      return {
        category: "scanner",
        severity: "error",
        message: "Monitoring smoke test: scanner failure",
        metadata: { ...baseMetadata, errorCategory: "SCANNER_SMOKE_TEST" }
      };
    case "openai":
      return {
        category: "openai",
        severity: "warn",
        message: "Monitoring smoke test: OpenAI quota or provider warning",
        metadata: { ...baseMetadata, errorCategory: "OPENAI_SMOKE_TEST" }
      };
    case "retailer":
      return {
        category: "retailer",
        severity: "error",
        message: "Monitoring smoke test: retailer discovery failure",
        metadata: { ...baseMetadata, errorCategory: "RETAILER_SMOKE_TEST" }
      };
    case "stripe":
      return {
        category: "stripe",
        severity: "error",
        message: "Monitoring smoke test: Stripe webhook failure",
        metadata: { ...baseMetadata, errorCategory: "STRIPE_SMOKE_TEST" }
      };
    case "ebay":
      return {
        category: "ebay",
        severity: "error",
        message: "Monitoring smoke test: eBay OAuth/listing failure",
        metadata: { ...baseMetadata, errorCategory: "EBAY_SMOKE_TEST" }
      };
    case "notification":
      return {
        category: "notification",
        severity: "error",
        message: "Monitoring smoke test: notification send failure",
        metadata: { ...baseMetadata, errorCategory: "NOTIFICATION_SMOKE_TEST" }
      };
  }
}
