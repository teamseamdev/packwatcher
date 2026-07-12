import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getClipsAnalysisAvailability } from "@/lib/clips/analysis";
import { OpenAICardRecognitionProvider } from "@/lib/clips/providers/card-recognition";
import { TCGCSVProvider } from "@/lib/clips/providers/pricing";
import { getSourceVideoBlob } from "@/lib/clips/source-video";
import type { ClipProject } from "@/lib/clips/types";
import { extractCandidateFrames, readFrameBuffer, withSourceVideo } from "@/lib/clips/video-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THUMBNAIL_BUCKET = "clip-thumbnails";

type ScannedCardDraft = {
  cardName: string;
  setName: string | null;
  cardNumber: string | null;
  variant: string | null;
  estimatedValue: number;
  confidence: number;
  pricingSource: string;
  recognitionSource: string;
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const availability = getClipsAnalysisAvailability();

  const { data: project } = await supabase
    .from("clip_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<ClipProject>();

  if (!project) {
    return NextResponse.json({ error: "Clip project not found." }, { status: 404 });
  }

  await supabase
    .from("clip_projects")
    .update({
      status: "processing",
      analysis_mode: availability.mode,
      error_message: availability.message
    })
    .eq("id", project.id)
    .eq("user_id", user.id);

  try {
    const sourceBlob = await getSourceVideoBlob(supabase, project);
    const recognitionProvider = new OpenAICardRecognitionProvider();
    const pricingProvider = new TCGCSVProvider();
    const analysisMessages = new Set<string>();
    if (availability.message) analysisMessages.add(availability.message);

    const insertedCount = await withSourceVideo(project.source_file_name ?? "source.mp4", sourceBlob, async ({ workDir, inputPath }) => {
      const frames = await extractCandidateFrames(inputPath, workDir);

      await supabase.from("clip_moments").delete().eq("project_id", project.id);

      const momentRows = [];
      const cardDrafts: Array<ScannedCardDraft | null> = [];
      for (const frame of frames) {
        const thumbPath = `${user.id}/${project.id}/${randomUUID()}.jpg`;
        const frameBuffer = await readFrameBuffer(frame);
        const { error: uploadError } = await supabase.storage
          .from(THUMBNAIL_BUCKET)
          .upload(thumbPath, frameBuffer, {
            contentType: "image/jpeg",
            upsert: false
          });

        if (uploadError) throw new Error(uploadError.message);

        const cardDraft = await scanFrameForCardValue({
          frameBuffer,
          recognitionProvider,
          pricingProvider,
          analysisMessages
        });

        momentRows.push({
          project_id: project.id,
          timestamp_start: frame.timestampStart,
          timestamp_end: frame.timestampEnd,
          moment_type: "local_candidate",
          confidence: frame.confidence,
          thumbnail_bucket: THUMBNAIL_BUCKET,
          thumbnail_path: thumbPath,
          include_in_export: frame.sortOrder < 5,
          sort_order: frame.sortOrder
        });
        cardDrafts.push(cardDraft);
      }

      if (!momentRows.length) {
        momentRows.push({
          project_id: project.id,
          timestamp_start: 0,
          timestamp_end: 20,
          moment_type: "manual",
          confidence: 0.2,
          thumbnail_bucket: null,
          thumbnail_path: null,
          include_in_export: true,
          sort_order: 0
        });
        cardDrafts.push(null);
      }

      const { data: inserted, error: insertError } = await supabase
        .from("clip_moments")
        .insert(momentRows)
        .select("id, project_id");

      if (insertError) throw new Error(insertError.message);

      if (inserted?.length) {
        const cardRows = inserted.map((moment, index) => {
          const draft = cardDrafts[index];
          return {
            project_id: project.id,
            moment_id: moment.id,
            card_name: draft?.cardName ?? "",
            set_name: draft?.setName ?? null,
            card_number: draft?.cardNumber ?? null,
            variant: draft?.variant ?? null,
            estimated_value: draft?.estimatedValue ?? 0,
            confidence: draft?.confidence ?? 0,
            pricing_source: draft?.pricingSource ?? "manual",
            recognition_source: draft?.recognitionSource ?? "manual",
            user_confirmed: false
          };
        });
        const { error: cardError } = await supabase.from("clip_cards").insert(cardRows);
        if (cardError) throw new Error(cardError.message);
      }

      return inserted?.length ?? 0;
    });

    await supabase
      .from("clip_projects")
      .update({
        status: "needs_review",
        analysis_mode: availability.mode,
        error_message: Array.from(analysisMessages).filter(Boolean).join(" ") || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", project.id)
      .eq("user_id", user.id);

    return NextResponse.json({
      mode: availability.mode,
      message: Array.from(analysisMessages).filter(Boolean).join(" ") || null,
      momentsCreated: insertedCount
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video processing failed.";
    await markFailed(supabase, project.id, user.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function scanFrameForCardValue({
  frameBuffer,
  recognitionProvider,
  pricingProvider,
  analysisMessages
}: {
  frameBuffer: Buffer;
  recognitionProvider: OpenAICardRecognitionProvider;
  pricingProvider: TCGCSVProvider;
  analysisMessages: Set<string>;
}) {
  try {
    const candidates = await recognitionProvider.recognize({
      imageBase64: frameBuffer.toString("base64"),
      mimeType: "image/jpeg"
    });
    const card = candidates[0];
    if (!card) return null;

    const prices = await pricingProvider.price(card).catch((error) => {
      analysisMessages.add(`Card recognized, but TCGCSV pricing failed: ${error instanceof Error ? error.message : "unknown pricing error"}`);
      return [];
    });
    const price = prices[0];

    return {
      cardName: card.cardName,
      setName: card.setName ?? null,
      cardNumber: card.cardNumber ?? null,
      variant: card.variant ?? null,
      estimatedValue: price?.value ?? 0,
      confidence: price ? Math.min(card.confidence, price.confidence) : card.confidence,
      pricingSource: price?.source ?? "manual",
      recognitionSource: card.source
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown recognition error";
    if (/429|insufficient_quota|quota/i.test(message)) {
      analysisMessages.add("OpenAI card scanning is unavailable, so PackWatcher Clips kept local/manual review mode.");
    } else if (process.env.CLIPS_ENABLE_OPENAI === "true") {
      analysisMessages.add(`OpenAI card scanning failed: ${message}`);
    }
    return null;
  }
}

async function markFailed(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], projectId: string, userId: string, message: string) {
  await supabase
    .from("clip_projects")
    .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId);
}
