"use client";

import { useState } from "react";
import { Download, Loader2, Wand2 } from "lucide-react";

export function ClipExportSettings({ projectId }: { projectId: string }) {
  const [durationMode, setDurationMode] = useState<"30" | "60" | "custom">("30");
  const [customDuration, setCustomDuration] = useState("45");
  const [cropMode, setCropMode] = useState<"blurred" | "center_crop">("blurred");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  async function exportClip() {
    setError(null);
    setDownloadUrl(null);
    setIsExporting(true);

    const response = await fetch(`/api/clips/projects/${projectId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        durationMode,
        customDuration: Number(customDuration || 30),
        cropMode,
        overlayStyle: "standard"
      })
    });

    setIsExporting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setError(body?.error ?? "Export failed.");
      return;
    }

    const body = await response.json() as { downloadUrl: string };
    setDownloadUrl(body.downloadUrl);
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-amber-200" />
        <h2 className="text-xl font-bold text-white">Export settings</h2>
      </div>
      <div className="mt-5 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Duration</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["30", "60", "custom"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDurationMode(mode)}
                className={`h-10 rounded-lg border text-sm font-semibold ${durationMode === mode ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 bg-slate-950/50 text-slate-200"}`}
              >
                {mode === "custom" ? "Custom" : `${mode}s`}
              </button>
            ))}
          </div>
          {durationMode === "custom" ? (
            <input value={customDuration} onChange={(event) => setCustomDuration(event.target.value)} type="number" min="3" max="180" className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none focus:border-amber-300" />
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vertical format</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ["blurred", "Blurred background"],
              ["center_crop", "Center crop"]
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCropMode(mode as "blurred" | "center_crop")}
                className={`h-11 rounded-lg border text-sm font-semibold ${cropMode === mode ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 bg-slate-950/50 text-slate-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void exportClip()}
          disabled={isExporting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 font-bold text-slate-950 disabled:cursor-wait disabled:opacity-70"
        >
          {isExporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          {isExporting ? "Rendering MP4..." : "Export vertical MP4"}
        </button>
        {error ? <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
        {downloadUrl ? (
          <a href={downloadUrl} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/50 font-semibold text-amber-100">
            <Download className="h-4 w-4" />
            Download MP4
          </a>
        ) : null}
      </div>
    </div>
  );
}

