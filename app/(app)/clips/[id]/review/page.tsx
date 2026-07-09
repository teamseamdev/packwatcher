import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClipMomentReview } from "@/components/clips/ClipMomentReview";
import { requireUser } from "@/lib/auth";
import type { ClipCard, ClipMoment, ClipMomentWithCard, ClipProject } from "@/lib/clips/types";

export default async function ClipReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("clip_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<ClipProject>();

  if (!project) notFound();

  const [{ data: moments }, { data: cards }] = await Promise.all([
    supabase.from("clip_moments").select("*").eq("project_id", project.id).order("sort_order", { ascending: true }).returns<ClipMoment[]>(),
    supabase.from("clip_cards").select("*").eq("project_id", project.id).returns<ClipCard[]>()
  ]);

  const cardsByMoment = new Map((cards ?? []).map((card) => [card.moment_id, card]));
  const withCards: ClipMomentWithCard[] = await Promise.all((moments ?? []).map(async (moment) => {
    const signedThumbnailUrl = moment.thumbnail_bucket && moment.thumbnail_path
      ? (await supabase.storage.from(moment.thumbnail_bucket).createSignedUrl(moment.thumbnail_path, 60 * 30)).data?.signedUrl ?? null
      : null;

    return {
      ...moment,
      card: cardsByMoment.get(moment.id) ?? null,
      signedThumbnailUrl
    };
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clips/${project.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {project.title}
        </Link>
        <h1 className="mt-2 text-3xl font-black text-white">Review moments and values</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Keep the best reveal moments, type the card values, and PackWatcher will calculate pull value and profit.
        </p>
      </div>
      <ClipMomentReview
        projectId={project.id}
        totalCost={Number(project.total_cost)}
        moments={withCards}
        fallbackMessage={project.error_message}
      />
    </div>
  );
}
