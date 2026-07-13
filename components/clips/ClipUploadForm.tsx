"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";

const MAX_UPLOAD_MB = 5120;
const LOCAL_CHUNK_BYTES = 2 * 1024 * 1024;

type State = "idle" | "creating" | "processing" | "error";

export function ClipUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [totalCost, setTotalCost] = useState("0");
  const [packCount, setPackCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function createProject() {
    setError(null);
    setNotice(null);

    if (!file) {
      setError("Choose a video first.");
      return;
    }

    const contentType = inferVideoContentType(file);
    if (!contentType) {
      setError("Upload an MP4, MOV, or WEBM file.");
      return;
    }

    if (file.size > maxUploadBytes()) {
      setError(`This file is ${formatFileSize(file.size)}. Keep Clips uploads under ${formatFileSize(maxUploadBytes())}.`);
      return;
    }

    if (!productName.trim()) {
      setError("Enter the pack or box name.");
      return;
    }

    setNotice("Raw videos are stored locally for this dev build. Supabase is only used for clip metadata, thumbnails, cards, and exports.");
    await createLocalSourceProject(file);
  }

  async function createLocalSourceProject(selectedFile: File) {
    setState("creating");
    setError(null);
    setProgress(0);

    const contentType = inferVideoContentType(selectedFile) ?? "video/mp4";
    const uploadId = crypto.randomUUID();
    const chunkCount = Math.ceil(selectedFile.size / LOCAL_CHUNK_BYTES);
    let projectId: string | null = null;

    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * LOCAL_CHUNK_BYTES;
      const end = Math.min(selectedFile.size, start + LOCAL_CHUNK_BYTES);
      const chunk = selectedFile.slice(start, end);

      const response = await fetch("/api/clips/projects/local-source/chunk", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-clip-upload-id": uploadId,
          "x-clip-file-name": encodeURIComponent(selectedFile.name),
          "x-clip-content-type": contentType,
          "x-clip-file-size": String(selectedFile.size),
          "x-clip-chunk-index": String(index),
          "x-clip-chunk-count": String(chunkCount),
          "x-clip-product-name": encodeURIComponent(productName),
          "x-clip-total-cost": totalCost || "0",
          "x-clip-pack-count": packCount || "1",
          "x-clip-notes": encodeURIComponent(notes)
        },
        body: chunk
      });

      if (!response.ok) {
        setState("error");
        setError(await uploadErrorMessage(response));
        return;
      }

      const body = await response.json() as { id?: string; complete?: boolean };
      setProgress(Math.round(((index + 1) / chunkCount) * 100));
      if (body.complete && body.id) {
        projectId = body.id;
      }
    }

    if (!projectId) {
      setState("error");
      setError("Local video upload finished without creating a clip project.");
      return;
    }

    setState("processing");
    await fetch(`/api/clips/projects/${projectId}/process`, { method: "POST" });
    router.push(`/clips/${projectId}/review`);
    router.refresh();
  }

  const isBusy = state === "creating" || state === "processing";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-2">
        <UploadCloud className="h-5 w-5 text-amber-200" />
        <h2 className="text-xl font-bold text-white">New PackWatcher Clip</h2>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-slate-950/40 p-6 text-center transition hover:border-amber-300/70">
          <UploadCloud className="h-10 w-10 text-slate-300" />
          <span className="mt-4 text-base font-semibold text-white">{file ? file.name : "Choose raw MP4, MOV, or WEBM"}</span>
          <span className="mt-2 text-sm text-slate-400">
            {file ? `${formatFileSize(file.size)} selected. Limit: ${formatFileSize(maxUploadBytes())}.` : "Raw source videos are stored locally in this dev build."}
          </span>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            className="sr-only"
            disabled={isBusy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="space-y-3">
          <Field label="Product / pack / box name" value={productName} onChange={setProductName} placeholder="Pokemon 151 Booster Bundle" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total cost paid" value={totalCost} onChange={setTotalCost} type="number" step="0.01" />
            <Field label="Packs opened" value={packCount} onChange={setPackCount} type="number" step="1" />
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm text-white outline-none focus:border-amber-300" />
          </label>
          <button
            type="button"
            onClick={() => void createProject()}
            disabled={isBusy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 font-bold text-slate-950 disabled:cursor-wait disabled:opacity-70"
          >
            {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
            {state === "processing" ? "Extracting moments..." : state === "creating" ? `Saving locally ${progress}%` : "Create clip project"}
          </button>
        </div>
      </div>
      {state !== "idle" ? (
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${state === "creating" ? progress : state === "error" ? 35 : 100}%` }} />
        </div>
      ) : null}
      {notice ? <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        step={step}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none focus:border-amber-300"
      />
    </label>
  );
}

function inferVideoContentType(file: File) {
  const name = file.name.toLowerCase();
  if (file.type === "video/mp4" || name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (file.type === "video/quicktime" || name.endsWith(".mov")) return "video/quicktime";
  if (file.type === "video/webm" || name.endsWith(".webm")) return "video/webm";
  return null;
}

function maxUploadBytes() {
  return MAX_UPLOAD_MB * 1024 * 1024;
}

function formatFileSize(bytes: number) {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

async function uploadErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (body?.error) return body.error;
  }

  const text = await response.text().catch(() => "");
  const detail = text.replace(/\s+/g, " ").trim().slice(0, 180);
  return detail
    ? `Local video upload failed with status ${response.status}: ${detail}`
    : `Local video upload failed with status ${response.status}.`;
}

