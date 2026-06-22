import { NextResponse } from "next/server";
import { z } from "zod";
import { runProductCheck } from "@/lib/stock-checkers/run-check";

const Body = z.object({ productId: z.string().uuid() });

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
    const body = Body.parse(await request.json());
    const result = await runProductCheck(body.productId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
