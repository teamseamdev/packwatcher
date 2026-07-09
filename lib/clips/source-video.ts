import { readLocalSourceVideo, LOCAL_SOURCE_BUCKET } from "@/lib/clips/local-storage";
import type { ClipProject } from "@/lib/clips/types";

export async function getSourceVideoBlob(
  supabase: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }> } } },
  project: ClipProject
) {
  if (project.source_video_bucket === LOCAL_SOURCE_BUCKET) {
    const buffer = await readLocalSourceVideo(project.source_video_path);
    return new Blob([buffer], { type: project.source_content_type ?? "video/mp4" });
  }

  const { data, error } = await supabase.storage
    .from(project.source_video_bucket)
    .download(project.source_video_path);

  if (error || !data) {
    throw new Error(error?.message ?? "Could not download source video.");
  }

  return data;
}
