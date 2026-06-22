"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-6">
      <h1 className="text-xl font-bold text-white">Something went sideways.</h1>
      <p className="mt-2 text-sm text-slate-300">Refresh this view or try again.</p>
      <button className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950" onClick={reset}>Retry</button>
    </div>
  );
}
