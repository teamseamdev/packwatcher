export type CardRecognitionCandidate = {
  cardName: string;
  setName?: string | null;
  cardNumber?: string | null;
  variant?: string | null;
  language?: string | null;
  originalName?: string | null;
  confidence: number;
  source: string;
};

export type CardRecognitionProvider = {
  name: string;
  recognize(input: { imageUrl?: string | null; imageBase64?: string | null; mimeType?: string | null; notes?: string | null }): Promise<CardRecognitionCandidate[]>;
};

export class ManualCardRecognitionProvider implements CardRecognitionProvider {
  name = "manual";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}

export class PokemonTCGProvider implements CardRecognitionProvider {
  name = "pokemon_tcg_placeholder";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}

export class OpenAICardRecognitionProvider implements CardRecognitionProvider {
  name = "openai_vision";

  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.CLIPS_OPENAI_MODEL ?? "gpt-4o-mini"
  ) {}

  async recognize(input: { imageBase64?: string | null; mimeType?: string | null; notes?: string | null }): Promise<CardRecognitionCandidate[]> {
    if (process.env.CLIPS_ENABLE_OPENAI !== "true" || !this.apiKey || !input.imageBase64) return [];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              [
                "You identify Pokemon TCG cards from camera photos and pack-opening video frames.",
                "Cards may be English, Japanese, Simplified Chinese, Traditional Chinese, Korean, or another localized Pokemon TCG language.",
                "Use the artwork, Pokemon/card name, HP, attacks, rarity marks, collector/card number, regulation mark, set code, and visible text.",
                "For live camera scans, prioritize the card title/name near the top border and the collector number/set code near the lower-left or lower edge.",
                "When the user provides a pack/set hint, use the visible collector number plus that hint as the strongest signal for exact card identity.",
                "Hands, thumbs, sleeves, glare, and pack wrappers may block parts of the card; infer from the readable top name, bottom number, artwork, HP, and set context.",
                "If the image is a contact sheet or grid of video frames, inspect every panel and return candidates for every readable Pokemon card you can identify.",
                "For non-English cards, return cardName as the best English/Tcgplayer-compatible card name when you can infer it. Put the printed/localized name in originalName.",
                "If a Pokemon card or Pokemon TCG card front is visible but exact identity is uncertain, return your best guess with low confidence, or return cardName \"Unknown Pokemon card\" with low confidence.",
                "Do not return an empty candidates array just because text is partially blurred, localized, angled, or small.",
                "Return an empty candidates array only when no Pokemon card or Pokemon TCG card front is visible.",
                "Return JSON only."
              ].join(" ")
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  [
                    input.notes ? `Language/user hint: ${input.notes}.` : "Language/user hint: auto detect.",
                    "Identify Pokemon card(s) in this image. If this is a contact sheet, inspect all panels from left to right and top to bottom.",
                    "Some panels may be crops of the same card: one full frame, one top-title crop, one lower-left number crop, and one card-body crop. Combine those clues into one candidate when they match.",
                    "Return {\"candidates\":[{\"cardName\":\"English pricing name\",\"originalName\":null,\"language\":null,\"setName\":null,\"cardNumber\":null,\"variant\":null,\"confidence\":0.0}]}",
                    "Use confidence 0-1.",
                    "For Japanese, Chinese, or Korean cards, translate or normalize the cardName to the closest English card name for pricing when possible.",
                    "If only the card border/art/card shape is visible, return Unknown Pokemon card with confidence 0.08-0.3.",
                    "Include setName, cardNumber, and variant when visible. If a card number like 063/068 is visible and a set hint is provided, use that pair to identify the card."
                  ].join(" ")
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${input.mimeType ?? "image/jpeg"};base64,${input.imageBase64}`,
                  detail: "high"
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI card recognition failed with HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }

    const json = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as {
      candidates?: Array<Partial<CardRecognitionCandidate>>;
    };

    return (parsed.candidates ?? []).flatMap((candidate) => {
      const cardName = String(candidate.cardName ?? "").trim();
      const confidence = Number(candidate.confidence ?? 0);
      if (!cardName || !Number.isFinite(confidence) || confidence < 0.08) return [];
      return [{
        cardName,
        setName: stringOrNull(candidate.setName),
        cardNumber: stringOrNull(candidate.cardNumber),
        variant: stringOrNull(candidate.variant),
        language: stringOrNull(candidate.language),
        originalName: stringOrNull(candidate.originalName),
        confidence: Math.min(1, Math.max(0, confidence)),
        source: this.name
      }];
    });
  }
}

export class XimilarProvider implements CardRecognitionProvider {
  name = "ximilar_placeholder";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}

export class PokeTraceProvider implements CardRecognitionProvider {
  name = "poketrace_placeholder";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}

function stringOrNull(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
