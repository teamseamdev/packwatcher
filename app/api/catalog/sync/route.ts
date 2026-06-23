import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAvailableCatalogs } from "@/lib/catalog-importers/sync-all";

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

async function runCatalogSync() {
  const supabase = createAdminClient();
  const result = await syncAvailableCatalogs(supabase);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    assertAdmin(request);
    return await runCatalogSync();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    assertCron(request);
    return await runCatalogSync();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
