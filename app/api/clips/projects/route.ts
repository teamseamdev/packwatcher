import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { calculateClipTotals } from "@/lib/clips/types";

const SOURCE_BUCKET = "clip-source-videos";

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  productName: z.string().min(1).max(120),
  totalCost: z.number().min(0).max(100000),
  packCount: z.number().int().min(1).max(1000),
  notes: z.string().max(1000).nullable().optional(),
  sourceVideoPath: z.string().min(1),
  sourceFileName: z.string().min(1).max(255),
  sourceContentType: z.string().min(1),
  sourceFileSize: z.number().int().min(1)
});

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  const parsed = CreateProjectSchema.parse(await request.json());

  if (!parsed.sourceVideoPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Source video path must be scoped to the current user." }, { status: 403 });
  }

  const totals = calculateClipTotals(parsed.totalCost, []);
  const { data, error } = await supabase
    .from("clip_projects")
    .insert({
      user_id: user.id,
      title: parsed.title?.trim() || parsed.productName,
      product_name: parsed.productName,
      total_cost: parsed.totalCost,
      pack_count: parsed.packCount,
      notes: parsed.notes,
      source_video_bucket: SOURCE_BUCKET,
      source_video_path: parsed.sourceVideoPath,
      source_file_name: parsed.sourceFileName,
      source_content_type: parsed.sourceContentType,
      source_file_size: parsed.sourceFileSize,
      status: "uploaded",
      analysis_mode: "manual",
      total_pull_value: totals.totalPullValue,
      profit_loss: totals.profitLoss,
      roi_percent: totals.roiPercent
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
