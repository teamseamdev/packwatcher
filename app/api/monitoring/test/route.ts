import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { logAppEvent } from "@/lib/monitoring/log";
import {
  isMonitoringTestScenario,
  monitoringTestEventForScenario,
  MONITORING_TEST_SCENARIOS
} from "@/lib/monitoring/test-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertAdmin(request: Request) {
  const configured = process.env.ADMIN_CHECK_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!configured || provided !== configured) {
    throw new Error("Unauthorized");
  }
}

export async function POST(request: Request) {
  try {
    assertAdmin(request);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { scenario?: string; all?: boolean };
  const requestId = randomUUID();
  const scenarios = body.all
    ? [...MONITORING_TEST_SCENARIOS]
    : body.scenario && isMonitoringTestScenario(body.scenario)
      ? [body.scenario]
      : [];

  if (!scenarios.length) {
    return NextResponse.json({
      ok: false,
      error: "Provide a valid scenario or all=true.",
      scenarios: MONITORING_TEST_SCENARIOS
    }, { status: 400 });
  }

  for (const scenario of scenarios) {
    await logAppEvent(monitoringTestEventForScenario(scenario, requestId));
  }

  return NextResponse.json({
    ok: true,
    requestId,
    scenarios,
    note: "Smoke-test warn/error events were written to app_events and sent to Sentry when Sentry is configured."
  });
}
