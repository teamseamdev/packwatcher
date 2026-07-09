import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Eye, Film, Wand2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LOCAL_SOURCE_BUCKET } from "@/lib/clips/local-storage";
import { clipStatusLabel, currency, percent, type ClipExport, type ClipMoment, type ClipProject } from "@/lib/clips/types";

export default async function ClipProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("clip_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<ClipProject>();

  if (!project) notFound();

  const [{ data: signedVideo }, { data: moments }, { data: exports }] = await Promise.all([
    project.source_video_bucket === LOCAL_SOURCE_BUCKET
      ? Promise.resolve({ data: { signedUrl: `/api/clips/projects/${project.id}/source` } })
      : supabase.storage.from(project.source_video_bucket).createSignedUrl(project.source_video_path, 60 * 30),
    supabase.from("clip_moments").select("*").eq("project_id", project.id).order("sort_order", { ascending: true }).returns<ClipMoment[]>(),
    supabase.from("clip_exports").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).returns<ClipExport[]>()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/clips" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Clips
          </Link>
          <h1 className="mt-2 text-3xl font-black text-white">{project.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{project.product_name}</p>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold capitalize text-amber-200">{clipStatusLabel(project.status)}</span>
      </div>

      {project.error_message ? (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">{project.error_message}</div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
          {signedVideo?.signedUrl ? (
            <video src={signedVideo.signedUrl} controls playsInline className="aspect-video w-full bg-black object-contain" />
          ) : (
            <div className="grid aspect-video place-items-center text-sm text-slate-300">Preview unavailable</div>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Summary label="Cost" value={currency(project.total_cost)} />
            <Summary label="Packs" value={String(project.pack_count)} />
            <Summary label="Pull value" value={currency(project.total_pull_value)} />
            <Summary label="ROI" value={percent(project.roi_percent)} tone={project.profit_loss >= 0 ? "positive" : "negative"} />
          </div>
          <Summary label="Profit/loss" value={currency(project.profit_loss)} tone={project.profit_loss >= 0 ? "positive" : "negative"} large />
          <div className="grid gap-2">
            <Link href={`/clips/${project.id}/review`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 font-semibold text-white hover:border-amber-300/60">
              <Eye className="h-4 w-4" />
              Review moments ({moments?.length ?? 0})
            </Link>
            <Link href={`/clips/${project.id}/export`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-300 font-bold text-slate-950">
              <Wand2 className="h-4 w-4" />
              Export video
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-amber-200" />
          <h2 className="text-xl font-bold text-white">Exports</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {exports?.length ? exports.map((item) => (
            <a key={item.id} href={`/api/clips/exports/${item.id}`} className="inline-flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 p-4 text-sm text-white hover:border-amber-300/60">
              <span>{item.resolution} {item.format.toUpperCase()}</span>
              <Download className="h-4 w-4" />
            </a>
          )) : <p className="text-sm text-slate-300">No exports yet.</p>}
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value, tone, large }: { label: string; value: string; tone?: "positive" | "negative"; large?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 font-black ${large ? "text-3xl" : "text-xl"} ${tone === "positive" ? "text-amber-200" : tone === "negative" ? "text-rose-200" : "text-white"}`}>{value}</p>
    </div>
  );
}

