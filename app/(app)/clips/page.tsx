import Link from "next/link";
import { Plus, Scissors } from "lucide-react";
import { ClipProjectCard } from "@/components/clips/ClipProjectCard";
import { requireUser } from "@/lib/auth";
import type { ClipProject } from "@/lib/clips/types";

export default async function ClipsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("clip_projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<ClipProject[]>();

  const projects = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-200">PackWatcher Clips</p>
          <h1 className="mt-1 text-3xl font-black text-white">Short-form pack openings</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Turn raw Pokemon openings into vertical clips with card values, pull totals, and profit/loss overlays.
          </p>
        </div>
        <Link href="/clips/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-amber-300 px-4 font-bold text-slate-950">
          <Plus className="h-5 w-5" />
          New Clip
        </Link>
      </div>

      {projects.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => <ClipProjectCard key={project.id} project={project} />)}
        </section>
      ) : (
        <section className="grid min-h-80 place-items-center rounded-lg border border-dashed border-white/10 bg-white/[0.04] p-8 text-center">
          <div>
            <Scissors className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-4 text-xl font-bold text-white">No clips yet</h2>
            <p className="mt-2 max-w-md text-sm text-slate-300">Upload a short test opening and PackWatcher will extract candidate card-reveal moments for review.</p>
            <Link href="/clips/new" className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-amber-300 px-4 font-bold text-slate-950">
              <Plus className="h-5 w-5" />
              Create first clip
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

