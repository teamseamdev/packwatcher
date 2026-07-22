import { NextResponse } from "next/server";
import { challengeResponseForRequest, processEbayAccountDeletionPayload } from "@/lib/ebay/account-deletion";
import { SupabaseEbayDeletionStore } from "@/lib/ebay/account-deletion-store";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = challengeResponseForRequest(request.url);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ challengeResponse: result.challengeResponse }, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: unknown;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const result = await processEbayAccountDeletionPayload(payload, new SupabaseEbayDeletionStore(admin), rawBody);
    await logAppEvent({
      category: "ebay",
      severity: "info",
      message: "eBay account deletion notification processed",
      userId: result.matchedUserId,
      metadata: {
        notificationId: result.notificationId,
        status: result.status,
        signaturePresent: Boolean(request.headers.get("x-ebay-signature"))
      }
    });

    return NextResponse.json({ ok: true, status: result.status }, { status: 200 });
  } catch (error) {
    await logAppEvent({
      category: "ebay",
      severity: "error",
      message: "eBay account deletion notification failed",
      metadata: errorMetadata(error)
    });
    return NextResponse.json({ ok: false, error: "Could not process eBay account deletion notification." }, { status: 500 });
  }
}
