import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "card-centering";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in before deleting a centering check." }, { status: 401 });

  const { data: analysis, error } = await supabase
    .from("card_centering_analyses")
    .select("front_original_path,front_corrected_path,back_original_path,back_corrected_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{
      front_original_path: string | null;
      front_corrected_path: string | null;
      back_original_path: string | null;
      back_corrected_path: string | null;
    }>();

  if (error || !analysis) {
    return NextResponse.json({ ok: false, error: "Centering analysis not found." }, { status: 404 });
  }

  const paths = [
    analysis.front_original_path,
    analysis.front_corrected_path,
    analysis.back_original_path,
    analysis.back_corrected_path
  ].filter((path): path is string => Boolean(path));

  if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);

  const { error: deleteError } = await supabase
    .from("card_centering_analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
