import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { ClipExportSettings } from "@/components/clips/ClipExportSettings";
import { requireUser } from "@/lib/auth";
import { currency, percent, type ClipExport, type ClipProject } from "@/lib/clips/types";

export default async function ClipExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("clip_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<ClipProject>();

  if (!project) notFound();

  const { data: exports } = await supabase
    .from("clip_exports")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .returns<ClipExport[]>();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clips/${project.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {project.title}
        </Link>
        <h1 className="mt-2 text-3xl font-black text-white">Export vertical MP4</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Render a TikTok/YouTube Shorts-ready 1080x1920 video with value and profit overlays.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <ClipExportSettings projectId={project.id} />
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Cost" value={currency(project.total_cost)} />
            <Summary label="Pulls" value={currency(project.total_pull_value)} />
            <Summary label="Profit" value={currency(project.profit_loss)} tone={project.profit_loss >= 0 ? "positive" : "negative"} />
            <Summary label="ROI" value={percent(project.roi_percent)} tone={project.profit_loss >= 0 ? "positive" : "negative"} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-bold text-white">Previous exports</h2>
            <div className="mt-4 grid gap-3">
              {exports?.length ? exports.map((item) => (
                <a key={item.id} href={`/api/clips/exports/${item.id}`} className="inline-flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 p-4 text-sm text-white hover:border-amber-300/60">
                  <span>{item.resolution} MP4{item.duration ? ` / ${Math.round(item.duration)}s` : ""}</span>
                  <Download className="h-4 w-4" />
                </a>
              )) : <p className="text-sm text-slate-300">No exports yet.</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-black ${tone === "positive" ? "text-amber-200" : tone === "negative" ? "text-rose-200" : "text-white"}`}>{value}</p>
    </div>
  );
}

