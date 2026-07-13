import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { calculateClipTotals } from "@/lib/clips/types";
import { LOCAL_SOURCE_BUCKET, discardLocalSourceVideo, readLocalSourceVideo, writeLocalSourceChunk } from "@/lib/clips/local-storage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

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
  const uploadId = request.headers.get("x-clip-upload-id") ?? "";
  const fileName = decodeURIComponent(request.headers.get("x-clip-file-name") ?? "source.mp4");
  const contentType = request.headers.get("x-clip-content-type") ?? contentTypeFromName(fileName);
  const fileSize = Number(request.headers.get("x-clip-file-size") ?? 0);
  const chunkIndex = Number(request.headers.get("x-clip-chunk-index") ?? 0);
  const chunkCount = Number(request.headers.get("x-clip-chunk-count") ?? 1);
  const productName = decodeURIComponent(request.headers.get("x-clip-product-name") ?? "").trim();
  const totalCost = Number(request.headers.get("x-clip-total-cost") ?? 0);
  const packCount = Number(request.headers.get("x-clip-pack-count") ?? 1);
  const notes = decodeURIComponent(request.headers.get("x-clip-notes") ?? "").trim() || null;

  if (!/^[a-zA-Z0-9-]{20,80}$/.test(uploadId)) {
    return NextResponse.json({ error: "Invalid local upload id." }, { status: 400 });
  }

  if (!isAllowedVideo(fileName, contentType)) {
    return NextResponse.json({ error: "Upload an MP4, MOV, or WEBM file." }, { status: 400 });
  }

  if (fileSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Keep local Clips uploads under 5 GB." }, { status: 400 });
  }

  if (!productName) {
    return NextResponse.json({ error: "Enter the pack or box name." }, { status: 400 });
  }

  const chunk = Buffer.from(await request.arrayBuffer());
  if (!chunk.byteLength) {
    return NextResponse.json({ error: "Received an empty video chunk." }, { status: 400 });
  }

  if (chunk.byteLength > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: "Local video chunks must stay under 8 MB." }, { status: 400 });
  }

  const localPath = await writeLocalSourceChunk(user.id, uploadId, fileName, chunk, chunkIndex);
  const isFinalChunk = chunkIndex === chunkCount - 1;

  if (!isFinalChunk) {
    return NextResponse.json({ ok: true, complete: false, localPath });
  }

  const finalBuffer = await readLocalSourceVideo(localPath);
  if (finalBuffer.byteLength !== fileSize) {
    await discardLocalSourceVideo(localPath);
    return NextResponse.json({
      error: `Local upload was incomplete: received ${finalBuffer.byteLength} bytes, expected ${fileSize}. Try uploading again.`
    }, { status: 400 });
  }

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
      source_file_size: finalBuffer.byteLength,
      status: "uploaded",
      analysis_mode: "local_assist",
      total_pull_value: totals.totalPullValue,
      profit_loss: totals.profitLoss,
      roi_percent: totals.roiPercent,
      error_message: "Raw source video is stored locally for this dev session."
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, storage: "local", complete: true });
}

function isAllowedVideo(fileName: string, contentType: string) {
  return ["video/mp4", "video/quicktime", "video/webm"].includes(contentType) || /\.(mp4|m4v|mov|webm)$/i.test(fileName);
}

function contentTypeFromName(fileName: string) {
  if (/\.mov$/i.test(fileName)) return "video/quicktime";
  if (/\.webm$/i.test(fileName)) return "video/webm";
  return "video/mp4";
}
