import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VideoRipInventoryCardSchema = z.object({
  scanEventId: z.string().uuid(),
  canonicalCardId: z.string().uuid().nullable(),
  canonicalSetId: z.string().uuid().nullable(),
  cardName: z.string().trim().min(1),
  setName: z.string().trim().nullable(),
  collectorNumber: z.string().trim().nullable(),
  variant: z.string().trim().nullable(),
  language: z.string().trim().nullable(),
  price: z.number().min(0),
  imageUrl: z.string().trim().url().nullable(),
  packNumber: z.number().int().min(1),
  timestamp: z.number().min(0)
});

const VideoRipInventorySchema = z.object({
  videoAnalysisId: z.string().uuid(),
  fileName: z.string().trim().min(1),
  cards: z.array(VideoRipInventoryCardSchema).min(1).max(300)
});

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  const parsed = VideoRipInventorySchema.parse(await request.json());
  const rows = parsed.cards.map((card) => ({
    user_id: user.id,
    name: [card.cardName, card.collectorNumber, card.setName].filter(Boolean).join(" - "),
    scan_event_id: card.scanEventId,
    canonical_card_id: card.canonicalCardId,
    canonical_set_id: card.canonicalSetId,
    card_name: card.cardName,
    set_name: card.setName,
    card_number: card.collectorNumber,
    variant: card.variant,
    foil: /foil|holo/i.test(card.variant ?? ""),
    language: card.language,
    quantity: 1,
    purchase_price: 0,
    estimated_sale_price: card.price,
    fees: 0,
    shipping: 0,
    image_url: card.imageUrl,
    notes: [
      "Added from PackWatcher Video Rip Analysis",
      `Source video: ${parsed.fileName}`,
      `Pack ${card.packNumber}`,
      `Best frame: ${formatTimestamp(card.timestamp)}`
    ].join("\n")
  }));

  let { error } = await supabase.from("inventory_items").insert(rows);
  if (error && /image_url/i.test(error.message)) {
    const retry = await supabase.from("inventory_items").insert(rows.map(({ image_url: _imageUrl, ...row }) => row));
    error = retry.error;
  }
  if (error && /scan_event_id|canonical_card_id|canonical_set_id|card_name|set_name|card_number|variant|foil|language|column/i.test(error.message)) {
    const retry = await supabase.from("inventory_items").insert(rows.map(({
      scan_event_id: _scanEventId,
      canonical_card_id: _canonicalCardId,
      canonical_set_id: _canonicalSetId,
      card_name: _cardName,
      set_name: _setName,
      card_number: _cardNumber,
      variant: _variant,
      foil: _foil,
      language: _language,
      image_url: _imageUrl,
      ...row
    }) => row));
    error = retry.error;
  }

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${wholeSeconds}`;
}
