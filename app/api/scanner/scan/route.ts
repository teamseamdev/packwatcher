import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { OpenAICardRecognitionProvider } from "@/lib/clips/providers/card-recognition";
import { TCGCSVProvider } from "@/lib/clips/providers/pricing";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { reserveUsage } from "@/lib/usage-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ScanSchema = z.object({
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  cardName: z.string().trim().optional(),
  setName: z.string().trim().optional(),
  cardNumber: z.string().trim().optional(),
  variant: z.string().trim().optional(),
  packHint: z.string().trim().optional(),
  language: z.enum(["auto", "english", "japanese", "chinese_simplified", "chinese_traditional", "korean"]).default("auto")
});

type DetectedScannerCard = {
  cardName: string;
  setName: string | null;
  cardNumber: string | null;
  variant: string | null;
  language: string | null;
  originalName: string | null;
  confidence: number;
  source: string;
};

type PricedScannerCard = {
  cardName: string;
  setName: string | null;
  cardNumber: string | null;
  variant: string | null;
  language: string | null;
  originalName: string | null;
  confidence: number;
  recognitionSource: string;
  estimatedValue: number;
  priceLabel: string | null;
  pricingSource: string;
  pricingConfidence: number;
  referenceImageUrl: string | null;
};

export async function POST(request: Request) {
  const { user } = await requireUser();
  const parsed = ScanSchema.parse(await request.json());

  const recognitionProvider = new OpenAICardRecognitionProvider();
  const pricingProvider = new TCGCSVProvider();
  const messages: string[] = [];

  let detectedCards: DetectedScannerCard[] = parsed.cardName
    ? [{
        cardName: parsed.cardName,
        setName: parsed.setName || null,
        cardNumber: normalizeCardNumber(parsed.cardNumber, parsed.packHint, parsed.setName),
        variant: parsed.variant || null,
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

    const usage = await reserveUsage(user.id, "card_scan", {
      language: parsed.language,
      packHint: parsed.packHint ?? null
    });
    if (!usage.allowed) {
      return NextResponse.json({
        ok: false,
        error: `You've used ${usage.used} of ${usage.limit} scanner attempts in your rolling 30-day window. Add cards manually or upgrade your plan.`,
        usage
      }, { status: 402 });
    }
    if (usage.limit !== null && !usage.skipped) {
      messages.push(`Scanner usage: ${usage.used} of ${usage.limit} scans used in the current 30-day window.`);
    }

    try {
      const candidates = await recognitionProvider.recognize({
        imageBase64: parsed.imageBase64,
        mimeType: parsed.mimeType ?? "image/jpeg",
        notes: scannerScanNotes(parsed.language, parsed.packHint)
      });
      detectedCards = candidates.map((candidate) => ({
            cardName: candidate.cardName,
            setName: candidate.setName ?? null,
            cardNumber: normalizeCardNumber(candidate.cardNumber, parsed.packHint, candidate.setName),
            variant: candidate.variant ?? null,
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
  for (const detectedCard of detectedCards.slice(0, 12)) {
    pricedCards.push(await priceCard(detectedCard, pricingProvider, messages));
  }
  const primaryCard = pricedCards[0];

  return NextResponse.json({
    ok: true,
    card: primaryCard,
    cards: pricedCards,
    messages
  });
}

async function priceCard(card: DetectedScannerCard, pricingProvider: TCGCSVProvider, messages: string[]): Promise<PricedScannerCard> {
  const prices = await pricingProvider.price(card).catch((error) => {
    messages.push(`Pricing lookup failed for ${card.cardName}: ${error instanceof Error ? error.message : "unknown error"}`);
    void logAppEvent({
      category: "scanner",
      severity: "warn",
      message: "Scanner pricing lookup failed",
      metadata: { ...errorMetadata(error), cardName: card.cardName, setName: card.setName, cardNumber: card.cardNumber }
    });
    return [];
  });
  const price = prices[0] ?? null;

  return {
    cardName: card.cardName,
    setName: card.setName ?? null,
    cardNumber: card.cardNumber ?? null,
    variant: card.variant ?? null,
    language: card.language ?? null,
    originalName: card.originalName ?? null,
    confidence: card.confidence,
    recognitionSource: card.source,
    estimatedValue: price?.value ?? 0,
    priceLabel: price?.label ?? null,
    pricingSource: price?.source ?? "manual",
    pricingConfidence: price?.confidence ?? 0,
    referenceImageUrl: price?.imageUrl ?? null
  };
}

function scannerScanNotes(language: z.infer<typeof ScanSchema>["language"], packHint?: string) {
  return [
    scannerLanguageLabel(language),
    packHint ? `User pack/set hint: ${packHint}. Use this as context for likely set, expansion, language, and card numbering. If a collector number is clearly visible, combine that exact visible number with this pack/set hint to identify the exact card.` : null,
    "Prioritize the card name/title text near the top edge of the card.",
    "Prioritize the collector number, set code, rarity, and regulation mark near the lower-left or lower edge.",
    "Only return cardNumber when you can read the number directly on this card image. Do not infer, reuse, copy from another card, or invent a collector number. If the number is blurry or blocked, return null.",
    "Do not use example collector numbers in your response.",
    "Ignore fingers, sleeves, playmats, pack wrappers, and background objects unless they clarify the set."
  ].filter(Boolean).join(" ");
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

function normalizeCardNumber(cardNumber: string | null | undefined, packHint?: string, setName?: string | null) {
  const text = typeof cardNumber === "string" ? cardNumber.trim() : "";
  if (!text) return null;

  const match = text.match(/\b([A-Z]{0,4}\s*#?\s*)?(\d{1,4})\s*\/\s*(\d{1,4})\b/i);
  if (!match) return null;

  const prefix = (match[1] ?? "").replace(/[#\s]/g, "").toUpperCase();
  const numerator = match[2].padStart(match[2].length < 3 ? 3 : match[2].length, "0");
  const denominator = match[3].padStart(match[3].length < 3 ? 3 : match[3].length, "0");
  const expectedDenominator = expectedSetSize(packHint, setName);

  if (expectedDenominator && denominator !== expectedDenominator) return null;

  return `${prefix ? `${prefix} ` : ""}${numerator}/${denominator}`;
}

function expectedSetSize(packHint?: string, setName?: string | null) {
  const text = `${packHint ?? ""} ${setName ?? ""}`.toLowerCase();
  if (/\bchaos rising\b/.test(text)) return "086";
  return null;
}
