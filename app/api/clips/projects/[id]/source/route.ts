import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readLocalSourceVideo, LOCAL_SOURCE_BUCKET } from "@/lib/clips/local-storage";
import type { ClipProject } from "@/lib/clips/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("clip_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<ClipProject>();

  if (!project || project.source_video_bucket !== LOCAL_SOURCE_BUCKET) {
    return NextResponse.json({ error: "Local source video not found." }, { status: 404 });
  }

  const buffer = await readLocalSourceVideo(project.source_video_path);
  return new NextResponse(buffer, {
    headers: {
      "content-type": project.source_content_type ?? "video/mp4",
      "content-length": String(buffer.length),
      "cache-control": "private, max-age=300"
    }
  });
}
