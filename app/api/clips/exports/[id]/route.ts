import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import type { ClipExport } from "@/lib/clips/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: clipExport } = await supabase
    .from("clip_exports")
    .select("*, clip_projects!inner(user_id)")
    .eq("id", id)
    .eq("clip_projects.user_id", user.id)
    .single<ClipExport & { clip_projects: { user_id: string } }>();

  if (!clipExport) {
    return NextResponse.json({ error: "Export not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(clipExport.export_bucket)
    .createSignedUrl(clipExport.export_path, 60 * 10);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Could not create download URL." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
