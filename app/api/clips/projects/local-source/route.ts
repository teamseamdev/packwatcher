import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { calculateClipTotals } from "@/lib/clips/types";
import { LOCAL_SOURCE_BUCKET, writeLocalSourceVideo } from "@/lib/clips/local-storage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown local video upload error.";
    return NextResponse.json({ error: `Local video upload failed: ${message}` }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  const { supabase, user } = await requireUser();
  const fileName = decodeURIComponent(request.headers.get("x-clip-file-name") ?? "source.mp4");
  const contentType = request.headers.get("x-clip-content-type") ?? contentTypeFromName(fileName);
  const fileSize = Number(request.headers.get("x-clip-file-size") ?? 0);
  const productName = decodeURIComponent(request.headers.get("x-clip-product-name") ?? "").trim();
  const totalCost = Number(request.headers.get("x-clip-total-cost") ?? 0);
  const packCount = Number(request.headers.get("x-clip-pack-count") ?? 1);
  const notes = decodeURIComponent(request.headers.get("x-clip-notes") ?? "").trim() || null;

  if (!isAllowedVideo(fileName, contentType)) {
    return NextResponse.json({ error: "Upload an MP4, MOV, or WEBM file." }, { status: 400 });
  }

  if (fileSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Keep local Clips uploads under 5 GB." }, { status: 400 });
  }

  if (!productName) {
    return NextResponse.json({ error: "Enter the pack or box name." }, { status: 400 });
  }

  const body = await request.arrayBuffer();
  if (!body.byteLength) {
    return NextResponse.json({ error: "The local fallback received an empty video file." }, { status: 400 });
  }

  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Keep local Clips uploads under 5 GB." }, { status: 400 });
  }

  const localPath = await writeLocalSourceVideo(user.id, fileName, Buffer.from(body));
  const totals = calculateClipTotals(totalCost, []);

  const { data, error } = await supabase
    .from("clip_projects")
    .insert({
      user_id: user.id,
      title: productName,
      product_name: productName,
      total_cost: totalCost,
      pack_count: packCount,
      notes,
      source_video_bucket: LOCAL_SOURCE_BUCKET,
      source_video_path: localPath,
      source_file_name: fileName,
      source_content_type: contentType,
      source_file_size: body.byteLength,
      status: "uploaded",
      analysis_mode: "local_assist",
      total_pull_value: totals.totalPullValue,
      profit_loss: totals.profitLoss,
      roi_percent: totals.roiPercent,
      error_message: "Supabase Storage rejected this raw source video, so PackWatcher Clips stored it locally for this dev session."
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, storage: "local" });
}

function isAllowedVideo(fileName: string, contentType: string) {
  return ["video/mp4", "video/quicktime", "video/webm"].includes(contentType) || /\.(mp4|m4v|mov|webm)$/i.test(fileName);
}

function contentTypeFromName(fileName: string) {
  if (/\.mov$/i.test(fileName)) return "video/quicktime";
  if (/\.webm$/i.test(fileName)) return "video/webm";
  return "video/mp4";
}
