import type { ReactNode } from "react";

export function StatCard({ title, value, detail, icon }: { title: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <div className="mt-2 text-3xl font-black text-white">{value}</div>
        </div>
        {icon ? <div className="text-teal-300">{icon}</div> : null}
      </div>
      {detail ? <p className="mt-3 text-sm text-slate-400">{detail}</p> : null}
    </article>
  );
}
