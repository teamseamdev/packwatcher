import { NextResponse } from "next/server";
import { z } from "zod";
import { getCanonicalSet } from "@/lib/cards/catalog";
import { requireUser } from "@/lib/auth";
import { reserveUsage } from "@/lib/usage-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VideoRipStartSchema = z.object({
  videoAnalysisId: z.string().uuid(),
  selectedSetId: z.string().uuid(),
  fileName: z.string().trim().max(240).optional()
});

export async function POST(request: Request) {
  const { user } = await requireUser();
  const parsed = VideoRipStartSchema.parse(await request.json());
  const selectedSet = await getCanonicalSet(parsed.selectedSetId);
  if (!selectedSet) {
    return NextResponse.json({ ok: false, error: "Selected set was not found.", code: "SET_NOT_FOUND" }, { status: 404 });
  }

  const usage = await reserveUsage(user.id, "video_scan", {
    selectedSetId: selectedSet.id,
    selectedSetName: selectedSet.name,
    fileName: parsed.fileName ?? null,
    source: "video_rip_analysis"
  }, parsed.videoAnalysisId);

  if (!usage.allowed) {
    return NextResponse.json({
      ok: false,
      error: `You've used ${usage.used} of ${usage.limit} video analyses in your rolling 30-day window.`,
      code: "VIDEO_SCAN_LIMIT_REACHED",
      usage
    }, { status: 402 });
  }

  return NextResponse.json({ ok: true, usage });
}
