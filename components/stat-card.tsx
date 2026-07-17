import type { ReactNode } from "react";

export function StatCard({ title, value, detail, icon }: { title: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return (
    <article className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-amber-300/35">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="pw-hud text-xs font-black">{title}</p>
          <div className="mt-2 text-3xl font-black text-white">{value}</div>
        </div>
        {icon ? <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-2 text-amber-300">{icon}</div> : null}
      </div>
      {detail ? <p className="mt-3 text-sm text-slate-400">{detail}</p> : null}
    </article>
  );
}

