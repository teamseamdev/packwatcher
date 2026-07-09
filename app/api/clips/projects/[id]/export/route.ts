import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { renderVerticalClip } from "@/lib/clips/export";
import { getSourceVideoBlob } from "@/lib/clips/source-video";
import type { ClipCard, ClipMoment, ClipProject } from "@/lib/clips/types";
import { withSourceVideo } from "@/lib/clips/video-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_BUCKET = "clip-exports";

const ExportSchema = z.object({
  durationMode: z.enum(["30", "60", "custom"]),
  customDuration: z.number().min(3).max(180).optional(),
  cropMode: z.enum(["blurred", "center_crop"]),
  overlayStyle: z.enum(["standard", "minimal"]).default("standard")
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const parsed = ExportSchema.parse(await request.json());

  const { data: project } = await supabase
    .from("clip_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<ClipProject>();

  if (!project) {
    return NextResponse.json({ error: "Clip project not found." }, { status: 404 });
  }

  const [{ data: moments }, { data: cards }] = await Promise.all([
    supabase
      .from("clip_moments")
      .select("*")
      .eq("project_id", project.id)
      .eq("include_in_export", true)
      .order("sort_order", { ascending: true })
      .returns<ClipMoment[]>(),
    supabase
      .from("clip_cards")
      .select("*")
      .eq("project_id", project.id)
      .returns<ClipCard[]>()
  ]);

  const includedMoments = moments ?? [];
  if (!includedMoments.length) {
    return NextResponse.json({ error: "Select at least one moment before exporting." }, { status: 400 });
  }

  await supabase.from("clip_projects").update({ status: "exporting", updated_at: new Date().toISOString() }).eq("id", project.id);

  try {
    const sourceBlob = await getSourceVideoBlob(supabase, project);
    const result = await withSourceVideo(project.source_file_name ?? "source.mp4", sourceBlob, async ({ workDir, inputPath }) => {
      const outputPath = join(workDir, `export-${randomUUID()}.mp4`);
      const clipStart = Math.max(0, Math.min(...includedMoments.map((moment) => Number(moment.timestamp_start))));
      const latestEnd = Math.max(...includedMoments.map((moment) => Number(moment.timestamp_end)));
      const requestedDuration = parsed.durationMode === "custom"
        ? parsed.customDuration ?? 30
        : Number(parsed.durationMode);
      const naturalDuration = Math.max(3, latestEnd - clipStart);
      const duration = Math.min(Math.max(naturalDuration, requestedDuration), 180);
      const cardByMoment = new Map((cards ?? []).map((card) => [card.moment_id, card]));

      await renderVerticalClip({
        inputPath,
        outputPath,
        clipStart,
        duration,
        productName: project.product_name,
        totalCost: Number(project.total_cost),
        totalPullValue: Number(project.total_pull_value),
        profitLoss: Number(project.profit_loss),
        roiPercent: Number(project.roi_percent),
        cropMode: parsed.cropMode,
        cards: includedMoments.map((moment) => {
          const card = cardByMoment.get(moment.id);
          return {
            cardName: card?.card_name || "Card reveal",
            estimatedValue: Number(card?.estimated_value ?? 0),
            timestampStart: Number(moment.timestamp_start),
            timestampEnd: Number(moment.timestamp_end)
          };
        })
      });

      return { outputBuffer: await readFile(outputPath), duration };
    });

    const exportPath = `${user.id}/${project.id}/${randomUUID()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(EXPORT_BUCKET)
      .upload(exportPath, result.outputBuffer, {
        contentType: "video/mp4",
        upsert: false
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: clipExport, error: insertError } = await supabase
      .from("clip_exports")
      .insert({
        project_id: project.id,
        export_bucket: EXPORT_BUCKET,
        export_path: exportPath,
        format: "mp4",
        duration: result.duration,
        resolution: "1080x1920",
        status: "complete"
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError) throw new Error(insertError.message);

    await supabase.from("clip_projects").update({ status: "complete", updated_at: new Date().toISOString() }).eq("id", project.id);

    return NextResponse.json({
      exportId: clipExport.id,
      downloadUrl: `/api/clips/exports/${clipExport.id}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    await supabase.from("clip_projects").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", project.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
