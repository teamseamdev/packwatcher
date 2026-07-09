import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getClipsAnalysisAvailability } from "@/lib/clips/analysis";
import { getSourceVideoBlob } from "@/lib/clips/source-video";
import type { ClipProject } from "@/lib/clips/types";
import { extractCandidateFrames, readFrameBuffer, withSourceVideo } from "@/lib/clips/video-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THUMBNAIL_BUCKET = "clip-thumbnails";

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
    const insertedCount = await withSourceVideo(project.source_file_name ?? "source.mp4", sourceBlob, async ({ workDir, inputPath }) => {
      const frames = await extractCandidateFrames(inputPath, workDir);

      await supabase.from("clip_moments").delete().eq("project_id", project.id);

      const momentRows = [];
      for (const frame of frames) {
        const thumbPath = `${user.id}/${project.id}/${randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(THUMBNAIL_BUCKET)
          .upload(thumbPath, await readFrameBuffer(frame), {
            contentType: "image/jpeg",
            upsert: false
          });

        if (uploadError) throw new Error(uploadError.message);

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
      }

      const { data: inserted, error: insertError } = await supabase
        .from("clip_moments")
        .insert(momentRows)
        .select("id, project_id");

      if (insertError) throw new Error(insertError.message);

      if (inserted?.length) {
        const cardRows = inserted.map((moment) => ({
          project_id: project.id,
          moment_id: moment.id,
          card_name: "",
          estimated_value: 0,
          confidence: 0,
          pricing_source: "manual",
          recognition_source: "manual",
          user_confirmed: false
        }));
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
        error_message: availability.message,
        updated_at: new Date().toISOString()
      })
      .eq("id", project.id)
      .eq("user_id", user.id);

    return NextResponse.json({
      mode: availability.mode,
      message: availability.message,
      momentsCreated: insertedCount
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video processing failed.";
    await markFailed(supabase, project.id, user.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function markFailed(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], projectId: string, userId: string, message: string) {
  await supabase
    .from("clip_projects")
    .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId);
}
