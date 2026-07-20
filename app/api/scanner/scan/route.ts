import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { getCanonicalSet, getCardsForSelectedSet } from "@/lib/cards/catalog";
import { matchCardWithinSelectedSet, type ScoredCardCandidate } from "@/lib/cards/set-matching";
import { OpenAICardRecognitionProvider } from "@/lib/clips/providers/card-recognition";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { reserveUsage } from "@/lib/usage-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ScanSchema = z.object({
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  scanEventId: z.string().uuid().optional(),
  cardName: z.string().trim().optional(),
  setName: z.string().trim().optional(),
  cardNumber: z.string().trim().optional(),
  selectedSetId: z.string().uuid().optional(),
  variant: z.string().trim().optional(),
  foilPreference: z.enum(["auto", "normal", "foil", "reverse_holo"]).default("auto"),
  packHint: z.string().trim().optional(),
  language: z.enum(["auto", "english", "japanese", "chinese_simplified", "chinese_traditional", "korean"]).default("auto")
});

type DetectedScannerCard = {
  cardName: string;
  setName: string | null;
  cardNumber: string | null;
  variant: string | null;
  foil: boolean;
  language: string | null;
  originalName: string | null;
  confidence: number;
  source: string;
};

type PricedScannerCard = {
  canonicalCardId: string | null;
  canonicalSetId: string | null;
  cardName: string;
  setName: string | null;
  cardNumber: string | null;
  variant: string | null;
  foil: boolean;
  language: string | null;
  originalName: string | null;
  confidence: number;
  recognitionSource: string;
  estimatedValue: number;
  priceLabel: string | null;
  pricingSource: string;
  pricingConfidence: number;
  referenceImageUrl: string | null;
  matchExplanation?: ScoredCardCandidate["explanation"] | null;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { user } = await requireUser();
  const parsed = ScanSchema.parse(await request.json());

  const recognitionProvider = new OpenAICardRecognitionProvider();
  const messages: string[] = [];
  let usage: Awaited<ReturnType<typeof reserveUsage>> | null = null;
  if (!parsed.selectedSetId) {
    return NextResponse.json({
      ok: false,
      error: "Choose a Pokemon set before scanning. PackWatcher will only match cards inside that selected set.",
      code: "SET_NOT_SELECTED",
      messages
    }, { status: 422 });
  }

  const selectedSet = await getCanonicalSet(parsed.selectedSetId);
  if (!selectedSet) {
    return NextResponse.json({
      ok: false,
      error: "The selected Pokemon set could not be found. Choose a set again and retry.",
      code: "SET_NOT_FOUND",
      messages
    }, { status: 404 });
  }

  let detectedCards: DetectedScannerCard[] = parsed.cardName
      ? [{
        cardName: parsed.cardName,
        setName: selectedSet.name,
        cardNumber: normalizeCardNumber(parsed.cardNumber),
        variant: parsed.variant || variantFromFoilPreference(parsed.foilPreference),
        foil: isFoilVariant(parsed.variant || variantFromFoilPreference(parsed.foilPreference)),
        language: parsed.language,
        originalName: null,
        confidence: 1,
        source: "manual"
      }]
    : [];

  if (!detectedCards.length && parsed.imageBase64) {
    if (process.env.CLIPS_ENABLE_OPENAI !== "true") {
      return NextResponse.json({
        ok: false,
        error: "AI scanning is disabled. Set CLIPS_ENABLE_OPENAI=true in Vercel and redeploy, or use manual add.",
        messages
      }, { status: 422 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        ok: false,
        error: "AI scanning is missing OPENAI_API_KEY in the deployment environment.",
        messages
      }, { status: 422 });
    }

    usage = await reserveUsage(user.id, "card_scan", {
      language: parsed.language,
      packHint: parsed.packHint ?? null,
      selectedSetId: selectedSet.id,
      scanEventId: parsed.scanEventId ?? null
    }, parsed.scanEventId ?? null);
    if (!usage.allowed) {
      return NextResponse.json({
        ok: false,
        error: `You've used ${usage.used} of ${usage.limit} scanner attempts in your rolling 30-day window. Add cards manually or upgrade your plan.`,
        usage
      }, { status: 402 });
    }
    if (usage.replayed) messages.push("IDEMPOTENT_REPLAY");

    try {
      const candidates = await recognitionProvider.recognize({
        imageBase64: parsed.imageBase64,
        mimeType: parsed.mimeType ?? "image/jpeg",
        notes: scannerScanNotes(parsed.language, selectedSet.name, parsed.foilPreference)
      });
      detectedCards = candidates.map((candidate) => ({
            cardName: candidate.cardName,
            setName: selectedSet.name,
            cardNumber: normalizeCardNumber(candidate.cardNumber),
            variant: candidate.variant ?? variantFromFoilPreference(parsed.foilPreference),
            foil: isFoilVariant(candidate.variant ?? variantFromFoilPreference(parsed.foilPreference)),
            language: normalizeDetectedLanguage(candidate.language ?? parsed.language, candidate.cardName, candidate.originalName, parsed.language),
            originalName: normalizeOriginalName(candidate.originalName, candidate.cardName),
            confidence: candidate.confidence,
            source: candidate.source
          }))
        .filter((candidate) => !isPlaceholderCard(candidate));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Card recognition failed.";
      if (/429|insufficient_quota|quota/i.test(message)) {
        messages.push("AI scanning is unavailable because the OpenAI quota is limited. Add the card manually.");
        await logAppEvent({
          category: "openai",
          severity: "warn",
          message: "OpenAI scanner quota or rate limit error",
          userId: user.id,
          metadata: { ...errorMetadata(error), packHint: parsed.packHint, language: parsed.language }
        });
      } else {
        messages.push(message);
        await logAppEvent({
          category: "scanner",
          severity: "error",
          message: "Scanner recognition failed",
          userId: user.id,
          metadata: { ...errorMetadata(error), packHint: parsed.packHint, language: parsed.language }
        });
      }
    }
  }

  if (!detectedCards.length) {
    await logAppEvent({
      category: "scanner",
      severity: "warn",
      message: "Scanner returned no readable card",
      userId: user.id,
      metadata: {
        hasImage: Boolean(parsed.imageBase64),
        manual: Boolean(parsed.cardName),
        packHint: parsed.packHint,
        language: parsed.language,
        messages
      }
    });
    return NextResponse.json({
      ok: false,
      error: process.env.CLIPS_ENABLE_OPENAI === "true"
        ? "No readable Pokemon card was detected. Try a clearer photo or add it manually."
        : "AI scanning is off. Add the card manually or enable CLIPS_ENABLE_OPENAI=true with OPENAI_API_KEY.",
      messages
    }, { status: 422 });
  }

  const pricedCards: PricedScannerCard[] = [];
  const selectedSetCandidates = await getCardsForSelectedSet(selectedSet.id);
  const lookupStartedAt = Date.now();
  for (const detectedCard of detectedCards.slice(0, 12)) {
    const match = matchCardWithinSelectedSet({
      selectedSetId: selectedSet.id,
      ocrName: detectedCard.cardName,
      ocrCollectorNumber: detectedCard.cardNumber,
      candidates: selectedSetCandidates
    });

    await logAppEvent({
      category: "scanner",
      severity: match.action === "auto_confirmed" ? "info" : "warn",
      message: "Scanner selected-set match evaluated",
      userId: user.id,
      metadata: {
        selectedSetId: selectedSet.id,
        selectedSetName: selectedSet.name,
        ocrName: detectedCard.cardName,
        ocrCollectorNumber: detectedCard.cardNumber,
        eligibleCandidateCount: selectedSetCandidates.length,
        lookupDurationMs: Date.now() - lookupStartedAt,
        totalDurationMs: Date.now() - startedAt,
        scanEventId: parsed.scanEventId ?? null,
        usageCharged: Boolean(usage && usage.allowed && !usage.skipped),
        usageReplayed: usage?.replayed ?? false,
        action: match.action,
        reason: "reason" in match ? match.reason : null,
        topCandidateIds: match.alternatives.slice(0, 5).map((candidate) => candidate.id),
        confidence: "best" in match && match.best ? match.best.confidence : null
      }
    });

    if (match.action === "auto_confirmed") {
      pricedCards.push(cardFromSetCandidate(detectedCard, match.best, parsed.foilPreference));
      continue;
    }

    const alternatives = match.alternatives.map((candidate) => cardFromSetCandidate(detectedCard, candidate, parsed.foilPreference));
    return NextResponse.json({
      ok: false,
      error: match.action === "confirm_candidate"
        ? "Confirm which card this is. PackWatcher found multiple possible cards inside the selected set."
        : "No safe match was found inside the selected set. Retake the scan, improve lighting, enter the collector number, or change the selected set.",
      code: match.reason,
      requiredAction: match.action,
      candidates: alternatives,
      messages,
      usage: usageSummary(usage)
    }, { status: match.action === "confirm_candidate" ? 409 : 422 });
  }
  const primaryCard = pricedCards[0];

  return NextResponse.json({
    ok: true,
    card: primaryCard,
    cards: pricedCards,
    messages,
    usage: usageSummary(usage)
  });
}

function usageSummary(usage: Awaited<ReturnType<typeof reserveUsage>> | null) {
  if (!usage) return null;
  return {
    limit: usage.limit,
    used: usage.used,
    remaining: usage.remaining,
    skipped: usage.skipped,
    replayed: usage.replayed
  };
}

function cardFromSetCandidate(card: DetectedScannerCard, candidate: ScoredCardCandidate, foilPreference: z.infer<typeof ScanSchema>["foilPreference"]): PricedScannerCard {
  return {
    canonicalCardId: candidate.id,
    canonicalSetId: candidate.setId,
    cardName: candidate.name,
    setName: candidate.setName,
    cardNumber: candidate.collectorNumberNormalized ?? candidate.collectorNumberRaw,
    variant: card.variant ?? variantFromFoilPreference(foilPreference),
    foil: card.foil,
    language: card.language ?? null,
    originalName: card.originalName ?? null,
    confidence: Math.min(candidate.confidence, card.confidence || candidate.confidence),
    recognitionSource: card.source,
    estimatedValue: candidate.marketPrice ?? 0,
    priceLabel: candidate.name,
    pricingSource: candidate.tcgplayerProductId ? `tcgcsv:${candidate.tcgplayerProductId}` : "tcgcsv",
    pricingConfidence: candidate.marketPrice ? 0.95 : 0,
    referenceImageUrl: candidate.imageUrl ?? null,
    matchExplanation: candidate.explanation
  };
}

function scannerScanNotes(language: z.infer<typeof ScanSchema>["language"], packHint?: string, foilPreference: z.infer<typeof ScanSchema>["foilPreference"] = "auto") {
  return [
    scannerLanguageLabel(language),
    packHint ? `User pack/set hint: ${packHint}. Use this as context for likely set, expansion, language, and card numbering. If a collector number is clearly visible, combine that exact visible number with this pack/set hint to identify the exact card.` : null,
    foilPreference !== "auto" ? `User selected finish/variant preference: ${variantFromFoilPreference(foilPreference)}. Use that for pricing unless the visible card clearly contradicts it.` : null,
    "Prioritize the card name/title text near the top edge of the card.",
    "Prioritize the collector number, set code, rarity, and regulation mark near the lower-left or lower edge.",
    "Only return cardNumber when you can read the number directly on this card image. Do not infer, reuse, copy from another card, or invent a collector number. If the number is blurry or blocked, return null.",
    "Do not use example collector numbers in your response.",
    "Ignore fingers, sleeves, playmats, pack wrappers, and background objects unless they clarify the set."
  ].filter(Boolean).join(" ");
}

function variantFromFoilPreference(preference: z.infer<typeof ScanSchema>["foilPreference"]) {
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

function isFoilVariant(variant?: string | null) {
  return /foil|holo/i.test(variant ?? "");
}

function scannerLanguageLabel(language: z.infer<typeof ScanSchema>["language"]) {
  switch (language) {
    case "english":
      return "English Pokemon TCG card";
    case "japanese":
      return "Japanese Pokemon TCG card. Use visible Japanese text, card number, and artwork; return English pricing name when possible.";
    case "chinese_simplified":
      return "Simplified Chinese Pokemon TCG card. Use visible Chinese text, card number, and artwork; return English pricing name when possible.";
    case "chinese_traditional":
      return "Traditional Chinese Pokemon TCG card. Use visible Chinese text, card number, and artwork; return English pricing name when possible.";
    case "korean":
      return "Korean Pokemon TCG card. Use visible Korean text, card number, and artwork; return English pricing name when possible.";
    default:
      return "Auto-detect card language, including English, Japanese, Chinese, and Korean.";
  }
}

function normalizeDetectedLanguage(language: string | null | undefined, cardName: string, originalName: string | null | undefined, requestedLanguage: z.infer<typeof ScanSchema>["language"]) {
  if (requestedLanguage !== "auto") return requestedLanguage;
  const detected = (language ?? "").toLowerCase();
  const combined = `${cardName} ${originalName ?? ""}`;
  const latinLetters = (combined.match(/[a-z]/gi) ?? []).length;
  const localizedLetters = (combined.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) ?? []).length;
  if (["japanese", "chinese", "korean", "chinese_simplified", "chinese_traditional"].includes(detected) && latinLetters > localizedLetters * 2) {
    return "english";
  }
  return language ?? requestedLanguage;
}

function normalizeOriginalName(originalName: string | null | undefined, cardName: string) {
  const text = typeof originalName === "string" ? originalName.trim() : "";
  if (!text || text.toLowerCase() === cardName.toLowerCase()) return null;
  const readable = (text.match(/[a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/gi) ?? []).length;
  if (readable < Math.max(2, text.length * 0.35)) return null;
  return text;
}

function isPlaceholderCard(card: DetectedScannerCard) {
  return /^unknown pokemon card$/i.test(card.cardName.trim());
}

function normalizeCardNumber(cardNumber: string | null | undefined) {
  return normalizeCollectorNumber(cardNumber)?.normalized ?? null;
}
