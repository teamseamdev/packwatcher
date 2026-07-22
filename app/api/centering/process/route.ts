import { NextResponse } from "next/server";
import { z } from "zod";
import { processCenteringImage } from "@/lib/centering/server-processing";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const ProcessSchema = z.object({
  dataUrl: z.string().min(1),
  side: z.enum(["front", "back"]),
  referenceImageUrl: z.string().url().nullable().optional()
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in before processing a centering photo." }, { status: 401 });
  }

  const parsed = ProcessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid centering photo payload." }, { status: 400 });
  }

  const decoded = decodeDataUrl(parsed.data.dataUrl);
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "Upload a JPEG, PNG, or WebP photo." }, { status: 400 });
  }
  if (decoded.buffer.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "Centering photos must be under 12 MB." }, { status: 413 });
  }

  try {
    const result = await processCenteringImage({
      buffer: decoded.buffer,
      mimeType: decoded.mime,
      side: parsed.data.side,
      referenceImageUrl: parsed.data.referenceImageUrl ?? null
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await logAppEvent({
      category: "scanner",
      severity: "warn",
      message: "Centering photo server processing failed",
      userId: user.id,
      metadata: {
        ...errorMetadata(error),
        side: parsed.data.side,
        hasReferenceImage: Boolean(parsed.data.referenceImageUrl),
        imageBytes: decoded.buffer.byteLength
      }
    });
    return NextResponse.json({
      ok: false,
      code: "CENTERING_CARD_NOT_RECOGNIZED",
      error: error instanceof Error ? error.message : "Card was not recognized. Adjust corners manually."
    }, { status: 422 });
  }
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}
