import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMonitorJobBatch } from "@/lib/tracker/monitor-jobs";

export const maxDuration = 300;

function assertAdmin(request: Request) {
  const configured = process.env.ADMIN_CHECK_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!configured || provided !== configured) {
    throw new Error("Unauthorized");
  }
}

function assertCron(request: Request) {
  const configured = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configured || authorization !== `Bearer ${configured}`) {
    throw new Error("Unauthorized");
  }
}

async function run(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? process.env.MONITOR_JOB_BATCH_LIMIT ?? 25);
  const enqueueFirst = url.searchParams.get("enqueue") !== "false";
  const supabase = createAdminClient();
  const result = await runMonitorJobBatch(supabase, { limit, enqueueFirst });
  return NextResponse.json({ ok: !result.errors.length, ...result });
}

export async function POST(request: Request) {
  try {
    assertAdmin(request);
    return await run(request);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    assertCron(request);
    return await run(request);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
