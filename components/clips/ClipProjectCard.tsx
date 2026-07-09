import Link from "next/link";
import { ArrowRight, Film } from "lucide-react";
import { clipStatusLabel, currency, percent, type ClipProject } from "@/lib/clips/types";

export function ClipProjectCard({ project }: { project: ClipProject }) {
  const isPositive = Number(project.profit_loss) >= 0;

  return (
    <Link href={`/clips/${project.id}`} className="block rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:border-amber-300/60">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-amber-200">
            <Film className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">{clipStatusLabel(project.status)}</span>
          </div>
          <h3 className="mt-3 truncate text-lg font-bold text-white">{project.title}</h3>
          <p className="mt-1 truncate text-sm text-slate-400">{project.product_name}</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Cost" value={currency(project.total_cost)} />
        <Metric label="Pulls" value={currency(project.total_pull_value)} />
        <Metric label="Profit" value={currency(project.profit_loss)} tone={isPositive ? "positive" : "negative"} />
        <Metric label="ROI" value={percent(project.roi_percent)} tone={isPositive ? "positive" : "negative"} />
      </div>
    </Link>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 font-bold ${tone === "positive" ? "text-amber-200" : tone === "negative" ? "text-rose-200" : "text-white"}`}>{value}</p>
    </div>
  );
}

