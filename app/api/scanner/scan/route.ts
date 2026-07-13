import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { OpenAICardRecognitionProvider } from "@/lib/clips/providers/card-recognition";
import { TCGCSVProvider } from "@/lib/clips/providers/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ScanSchema = z.object({
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  cardName: z.string().trim().optional(),
  setName: z.string().trim().optional(),
  cardNumber: z.string().trim().optional(),
  variant: z.string().trim().optional(),
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

export async function POST(request: Request) {
  await requireUser();
  const parsed = ScanSchema.parse(await request.json());

  const recognitionProvider = new OpenAICardRecognitionProvider();
  const pricingProvider = new TCGCSVProvider();
  const messages: string[] = [];

  let card: DetectedScannerCard | null = parsed.cardName
    ? {
        cardName: parsed.cardName,
        setName: parsed.setName || null,
        cardNumber: parsed.cardNumber || null,
        variant: parsed.variant || null,
        language: parsed.language,
        originalName: null,
        confidence: 1,
        source: "manual"
      }
    : null;

  if (!card && parsed.imageBase64) {
    try {
      const candidates = await recognitionProvider.recognize({
        imageBase64: parsed.imageBase64,
        mimeType: parsed.mimeType ?? "image/jpeg",
        notes: scannerLanguageLabel(parsed.language)
      });
      const candidate = candidates[0];
      card = candidate
        ? {
            cardName: candidate.cardName,
            setName: candidate.setName ?? null,
            cardNumber: candidate.cardNumber ?? null,
            variant: candidate.variant ?? null,
            language: candidate.language ?? parsed.language,
            originalName: candidate.originalName ?? null,
            confidence: candidate.confidence,
            source: candidate.source
          }
        : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Card recognition failed.";
      if (/429|insufficient_quota|quota/i.test(message)) {
        messages.push("AI scanning is unavailable because the OpenAI quota is limited. Add the card manually.");
      } else {
        messages.push(message);
      }
    }
  }

  if (!card) {
    return NextResponse.json({
      ok: false,
      error: process.env.CLIPS_ENABLE_OPENAI === "true"
        ? "No readable Pokemon card was detected. Try a clearer photo or add it manually."
        : "AI scanning is off. Add the card manually or enable CLIPS_ENABLE_OPENAI=true with OPENAI_API_KEY.",
      messages
    }, { status: 422 });
  }

  const prices = await pricingProvider.price(card).catch((error) => {
    messages.push(`Pricing lookup failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return [];
  });
  const price = prices[0] ?? null;

  return NextResponse.json({
    ok: true,
    card: {
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
      pricingConfidence: price?.confidence ?? 0
    },
    messages
  });
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
