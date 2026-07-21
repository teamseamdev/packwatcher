import { NextResponse } from "next/server";
import { z } from "zod";
import { GRADING_CENTERING_STANDARDS } from "@/lib/centering/grading-standards";
import type { CenteringAnalysisResult } from "@/lib/centering/types";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "card-centering";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ImageSchema = z.object({
  dataUrl: z.string().min(1),
  side: z.enum(["front", "back"]),
  kind: z.enum(["original", "corrected"]).default("original")
});

const SaveSchema = z.object({
  inventoryItemId: z.string().uuid().nullable().optional(),
  canonicalCardId: z.string().uuid().nullable().optional(),
  savePhotos: z.boolean().default(false),
  sleeveToploaderWarning: z.boolean().default(false),
  result: z.unknown(),
  images: z.array(ImageSchema).max(4).default([])
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in before saving a centering check." }, { status: 401 });

  const parsed = SaveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid centering analysis payload." }, { status: 400 });
  }

  const analysisId = crypto.randomUUID();
  let inventoryCanonicalCardId: string | null = null;

  if (parsed.data.inventoryItemId) {
    const { data: item, error } = await supabase
      .from("inventory_items")
      .select("id,canonical_card_id")
      .eq("id", parsed.data.inventoryItemId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; canonical_card_id: string | null }>();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: "Inventory card not found." }, { status: 404 });
    }
    inventoryCanonicalCardId = item.canonical_card_id;
  }

  const result = parsed.data.result as CenteringAnalysisResult;
  const imagePaths: Record<string, string | null> = {
    front_original_path: null,
    front_corrected_path: null,
    back_original_path: null,
    back_corrected_path: null
  };

  if (parsed.data.savePhotos) {
    for (const image of parsed.data.images) {
      const decoded = decodeDataUrl(image.dataUrl);
      if (!decoded) {
        return NextResponse.json({ ok: false, error: "Only JPEG, PNG, or WebP images can be saved." }, { status: 400 });
      }
      if (decoded.buffer.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ ok: false, error: "Keep centering photos under 10 MB each." }, { status: 400 });
      }

      const extension = decoded.mime === "image/png" ? "png" : decoded.mime === "image/webp" ? "webp" : "jpg";
      const path = `${user.id}/${analysisId}/${image.side}-${image.kind}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, decoded.buffer, {
          contentType: decoded.mime,
          upsert: true
        });
      if (uploadError) {
        return NextResponse.json({ ok: false, error: uploadError.message }, { status: 400 });
      }
      imagePaths[`${image.side}_${image.kind}_path`] = path;
    }
  }

  const { error } = await supabase.from("card_centering_analyses").insert({
    id: analysisId,
    user_id: user.id,
    inventory_item_id: parsed.data.inventoryItemId ?? null,
    canonical_card_id: parsed.data.canonicalCardId ?? inventoryCanonicalCardId ?? null,
    ...imagePaths,
    front_left_margin: result.front?.margins.left ?? null,
    front_right_margin: result.front?.margins.right ?? null,
    front_top_margin: result.front?.margins.top ?? null,
    front_bottom_margin: result.front?.margins.bottom ?? null,
    back_left_margin: result.back?.margins.left ?? null,
    back_right_margin: result.back?.margins.right ?? null,
    back_top_margin: result.back?.margins.top ?? null,
    back_bottom_margin: result.back?.margins.bottom ?? null,
    front_lr_ratio: result.front ? `${result.front.horizontalRatio.first}/${result.front.horizontalRatio.second}` : null,
    front_tb_ratio: result.front ? `${result.front.verticalRatio.first}/${result.front.verticalRatio.second}` : null,
    back_lr_ratio: result.back ? `${result.back.horizontalRatio.first}/${result.back.horizontalRatio.second}` : null,
    back_tb_ratio: result.back ? `${result.back.verticalRatio.first}/${result.back.verticalRatio.second}` : null,
    front_confidence: result.front?.confidence ?? null,
    back_confidence: result.back?.confidence ?? null,
    overall_confidence: result.overallConfidence,
    recommendation: result.recommendation,
    detection_method: result.front?.method ?? result.back?.method ?? "manual",
    reference_image_used: result.front?.referenceImageUsed ?? result.back?.referenceImageUsed ?? null,
    reference_registration_score: result.front?.referenceRegistrationScore ?? result.back?.referenceRegistrationScore ?? null,
    grading_standard_version: `${GRADING_CENTERING_STANDARDS.psa.version};${GRADING_CENTERING_STANDARDS.beckett.version}`,
    analysis_engine_version: result.engineVersion,
    user_adjusted_corners: Boolean(result.front?.userAdjusted || result.back?.userAdjusted),
    sleeve_toploader_warning: parsed.data.sleeveToploaderWarning,
    measurements: result
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: analysisId });
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}
