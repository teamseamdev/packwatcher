import { NextResponse } from "next/server";
import { z } from "zod";
import { extractCollectorNumberCandidates, normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { getCanonicalSet, getCardsForSelectedSet } from "@/lib/cards/catalog";
import { matchCardWithinSelectedSet, type ScoredCardCandidate } from "@/lib/cards/set-matching";
import { requireUser } from "@/lib/auth";
import { OpenAICardRecognitionProvider } from "@/lib/clips/providers/card-recognition";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { reserveUsage } from "@/lib/usage-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VideoFrameRecognitionSchema = z.object({
  videoAnalysisId: z.string().uuid(),
  scanEventId: z.string().uuid(),
  selectedSetId: z.string().uuid(),
  imageBase64: z.string().min(100),
  mimeType: z.string().trim().default("image/jpeg"),
  timestamp: z.number().min(0),
  language: z.enum(["auto", "english", "japanese", "chinese_simplified", "chinese_traditional", "korean"]).default("auto"),
  foilPreference: z.enum(["auto", "normal", "foil", "reverse_holo"]).default("auto")
});

type PricedVideoRipCard = {
  canonicalCardId: string | null;
  canonicalSetId: string | null;
  cardName: string;
  setName: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  variant: string | null;
  language: string | null;
  price: number;
  confidence: number;
  referenceImageUrl: string | null;
  recognitionSource: string;
  pricingSource: string;
  matchExplanation?: ScoredCardCandidate["explanation"] | null;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { user } = await requireUser();
  const parsed = VideoFrameRecognitionSchema.parse(await request.json());

  const selectedSet = await getCanonicalSet(parsed.selectedSetId);
  if (!selectedSet) {
    return NextResponse.json({ ok: false, error: "Selected set was not found.", code: "SET_NOT_FOUND" }, { status: 404 });
  }

  if (process.env.CLIPS_ENABLE_OPENAI !== "true" || !process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      ok: false,
      error: "Video Rip Analysis needs CLIPS_ENABLE_OPENAI=true and OPENAI_API_KEY configured before it can recognize uploaded video frames.",
      code: "RECOGNITION_DISABLED"
    }, { status: 422 });
  }

  const usage = await reserveUsage(user.id, "video_scan", {
    selectedSetId: selectedSet.id,
    selectedSetName: selectedSet.name,
    timestamp: parsed.timestamp,
    scanEventId: parsed.scanEventId,
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

  try {
    const provider = new OpenAICardRecognitionProvider();
    const detected = await provider.recognize({
      imageBase64: parsed.imageBase64,
      mimeType: parsed.mimeType,
      notes: videoRipNotes(parsed.language, selectedSet.name, parsed.timestamp, parsed.foilPreference)
    });

    const selectedSetCandidates = await getCardsForSelectedSet(selectedSet.id);
    const cards: PricedVideoRipCard[] = [];
    const warnings: string[] = [];

    for (const candidate of detected.slice(0, 3)) {
      if (/^unknown pokemon card$/i.test(candidate.cardName.trim())) continue;
      const collectorNumber = normalizeCardNumber(candidate.cardNumber);
      const match = matchCardWithinSelectedSet({
        selectedSetId: selectedSet.id,
        ocrName: candidate.cardName,
        ocrCollectorNumber: collectorNumber,
        candidates: selectedSetCandidates
      });

      await logAppEvent({
        category: "scanner",
        severity: match.action === "auto_confirmed" ? "info" : "warn",
        message: "Video Rip selected-set frame match evaluated",
        userId: user.id,
        metadata: {
          videoAnalysisId: parsed.videoAnalysisId,
          scanEventId: parsed.scanEventId,
          selectedSetId: selectedSet.id,
          timestamp: parsed.timestamp,
          eligibleCandidateCount: selectedSetCandidates.length,
          action: match.action,
          reason: "reason" in match ? match.reason : null,
          topCandidateIds: match.alternatives.slice(0, 5).map((item) => item.id),
          durationMs: Date.now() - startedAt,
          usageCharged: !usage.replayed && !usage.skipped,
          usageReplayed: usage.replayed ?? false
        }
      });

      if (match.action === "auto_confirmed") {
        cards.push(cardFromSetCandidate(match.best, candidate.confidence, candidate.source, parsed.foilPreference));
        continue;
      }

      if (match.action === "confirm_candidate" && match.alternatives.length === 1) {
        cards.push(cardFromSetCandidate(match.alternatives[0], Math.max(0.22, candidate.confidence), candidate.source, parsed.foilPreference));
        continue;
      }

      warnings.push(match.action === "confirm_candidate" ? "Multiple selected-set candidates found for this frame." : "No safe selected-set match for this frame.");
    }

    if (!cards.length) {
      return NextResponse.json({
        ok: false,
        error: "No readable selected-set card was found in this video frame.",
        code: "NO_FRAME_MATCH",
        warnings,
        usage
      }, { status: 422 });
    }

    return NextResponse.json({ ok: true, cards, warnings, usage });
  } catch (error) {
    await logAppEvent({
      category: "scanner",
      severity: "error",
      message: "Video Rip frame recognition failed",
      userId: user.id,
      metadata: {
        ...errorMetadata(error),
        selectedSetId: selectedSet.id,
        videoAnalysisId: parsed.videoAnalysisId,
        scanEventId: parsed.scanEventId,
        timestamp: parsed.timestamp,
        durationMs: Date.now() - startedAt
      }
    });
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Video frame recognition failed.",
      code: "VIDEO_FRAME_RECOGNITION_FAILED",
      usage
    }, { status: 502 });
  }
}

function cardFromSetCandidate(candidate: ScoredCardCandidate, recognitionConfidence: number, recognitionSource: string, foilPreference: z.infer<typeof VideoFrameRecognitionSchema>["foilPreference"]): PricedVideoRipCard {
  return {
    canonicalCardId: candidate.id,
    canonicalSetId: candidate.setId,
    cardName: candidate.name,
    setName: candidate.setName,
    collectorNumber: candidate.collectorNumberNormalized ?? candidate.collectorNumberRaw,
    rarity: candidate.rarity ?? null,
    variant: variantFromFoilPreference(foilPreference),
    language: null,
    price: candidate.marketPrice ?? 0,
    confidence: Math.min(1, Math.max(0, (candidate.confidence * 0.75) + (recognitionConfidence * 0.25))),
    referenceImageUrl: candidate.imageUrl ?? null,
    recognitionSource,
    pricingSource: candidate.tcgplayerProductId ? `tcgcsv:${candidate.tcgplayerProductId}` : "tcgcsv",
    matchExplanation: candidate.explanation
  };
}

function videoRipNotes(language: z.infer<typeof VideoFrameRecognitionSchema>["language"], setName: string, timestamp: number, foilPreference: z.infer<typeof VideoFrameRecognitionSchema>["foilPreference"]) {
  return [
    "This is a candidate still frame selected from an offline Pokemon pack-opening video.",
    `Selected set is locked to ${setName}. Only identify cards that belong to this set.`,
    `Video timestamp: ${timestamp.toFixed(2)} seconds.`,
    language === "auto" ? "Auto-detect printed card language." : `User-selected language: ${language}.`,
    foilPreference !== "auto" ? `User selected finish preference: ${variantFromFoilPreference(foilPreference)}.` : null,
    "Prioritize the top card name and the lower collector number. Do not infer a collector number unless it is visible in this frame.",
    "Ignore hands, pack wrappers, playmats, background text, and unrelated cards."
  ].filter(Boolean).join(" ");
}

function normalizeCardNumber(cardNumber: string | null | undefined) {
  return extractCollectorNumberCandidates(cardNumber)[0]?.normalized ?? normalizeCollectorNumber(cardNumber)?.normalized ?? null;
}

function variantFromFoilPreference(preference: z.infer<typeof VideoFrameRecognitionSchema>["foilPreference"]) {
  switch (preference) {
    case "normal":
      return "Normal";
    case "foil":
      return "Holofoil";
    case "reverse_holo":
      return "Reverse Holofoil";
    case "auto":
    default:
      return null;
  }
}
