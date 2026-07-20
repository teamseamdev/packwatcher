import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getSetChecklist } from "@/lib/cards/catalog";
import { TCGCSVProvider } from "@/lib/clips/providers/pricing";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  set: z.string().trim().min(2).max(120).optional(),
  setId: z.string().uuid().optional()
});

export async function GET(request: Request) {
  const { user } = await requireUser();
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    set: url.searchParams.get("set") ?? undefined,
    setId: url.searchParams.get("setId") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Set name is required." }, { status: 400 });
  }

  try {
    if (parsed.data.setId) {
      const cards = await getSetChecklist(parsed.data.setId);
      return NextResponse.json({ ok: true, cards });
    }

    if (!parsed.data.set) {
      return NextResponse.json({ ok: false, error: "Set name is required." }, { status: 400 });
    }

    const provider = new TCGCSVProvider();
    const cards = await provider.listSetCards(parsed.data.set);
    return NextResponse.json({ ok: true, cards });
  } catch (error) {
    await logAppEvent({
      category: "scanner",
      severity: "warn",
      message: "Inventory set checklist lookup failed",
      userId: user.id,
      metadata: { ...errorMetadata(error), setName: parsed.data.set }
    });
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not load set checklist."
    }, { status: 502 });
  }
}
