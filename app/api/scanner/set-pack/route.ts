import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getCanonicalSet, getCardsForSelectedSet } from "@/lib/cards/catalog";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { buildPreparedSetScannerIndex } from "@/lib/scanner/set-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  setId: z.string().uuid()
});

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { user } = await requireUser();
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ setId: url.searchParams.get("setId") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Selected set ID is required." }, { status: 400 });
  }

  try {
    const selectedSet = await getCanonicalSet(parsed.data.setId);
    if (!selectedSet) {
      return NextResponse.json({ ok: false, error: "Selected set was not found." }, { status: 404 });
    }

    const cards = await getCardsForSelectedSet(selectedSet.id);
    const pack = buildPreparedSetScannerIndex({
      setId: selectedSet.id,
      setName: selectedSet.name,
      version: `${selectedSet.id}:${cards.length}:${selectedSet.tcgplayerGroupId ?? "local"}`,
      cards
    });

    await logAppEvent({
      category: "scanner",
      severity: "info",
      message: "Scanner set pack prepared",
      userId: user.id,
      metadata: {
        selectedSetId: selectedSet.id,
        selectedSetName: selectedSet.name,
        candidateCount: pack.cards.length,
        durationMs: Date.now() - startedAt
      }
    });

    return NextResponse.json({ ok: true, pack });
  } catch (error) {
    await logAppEvent({
      category: "scanner",
      severity: "error",
      message: "Scanner set pack preparation failed",
      userId: user.id,
      metadata: { ...errorMetadata(error), selectedSetId: parsed.data.setId, durationMs: Date.now() - startedAt }
    });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not prepare scanner set." }, { status: 500 });
  }
}
