import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runProductCheck } from "@/lib/stock-checkers/run-check";

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
    const supabase = createAdminClient();
    const { data: products, error } = await supabase.from("tracked_products").select("id").eq("alerts_enabled", true).limit(50);
    if (error) throw error;

    const results = [];
    for (const product of products ?? []) {
      try {
        results.push(await runProductCheck(product.id, { enforceRateLimit: true }));
      } catch (error) {
        results.push({ productId: product.id, error: error instanceof Error ? error.message : "Unknown error" });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
