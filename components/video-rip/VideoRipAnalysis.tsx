"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileJson, FileSpreadsheet, FileText, Loader2, PackageOpen, Play, Plus, Save, Trash2, Upload, Wand2 } from "lucide-react";
import { SetCombobox } from "@/components/set-combobox";
import {
  VIDEO_RIP_ANALYSIS_CONFIG,
  assignWindowsToPacks,
  buildCardWindows,
  buildVideoRipPdf,
  buildVideoRipReport,
  currency,
  formatTimestamp,
  fuseRecognitionCandidates,
  isStrongFallbackCardFrame,
  reportToCsv,
  reportToJson,
  scoreFrameQuality,
  updateReportCards,
  visualFingerprintDistance
} from "@/lib/video-rip/analysis";
import type { FusionInput } from "@/lib/video-rip/analysis";
import type { VideoRipCardWindow, VideoRipFrameSample, VideoRipRecognitionCard, VideoRipReport, VideoRipStage } from "@/lib/video-rip/types";

type CardSetOption = {
  id: string;
  name: string;
};

type RecognitionResponse = {
  ok: boolean;
  cards?: Array<FusionInput & { matchExplanation?: unknown }>;
  error?: string;
  code?: string;
};

const stageLabels: Record<VideoRipStage, string> = {
  idle: "Ready",
  preparing: "Preparing set",
  extracting: "Extracting frames",
  "detecting-packs": "Detecting packs",
  "finding-cards": "Finding cards",
  recognizing: "Recognizing cards",
  pricing: "Calculating prices",
  "report-ready": "Report ready",
  failed: "Needs attention"
};

export function VideoRipAnalysis() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef(false);
  const videoObjectUrlRef = useRef<string | null>(null);
  const [setOptions, setSetOptions] = useState<CardSetOption[]>([]);
  const [setNameOptions, setSetNameOptions] = useState<string[]>([]);
  const [selectedSetName, setSelectedSetName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [previewPoster, setPreviewPoster] = useState<string | null>(null);
  const [decodeWarning, setDecodeWarning] = useState<string | null>(null);
  const [stage, setStage] = useState<VideoRipStage>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Choose a set and upload a pack-opening video.");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<VideoRipReport | null>(null);
  const [isAddingInventory, setIsAddingInventory] = useState(false);

  const selectedSet = useMemo(() => {
    const normalized = normalizeSet(selectedSetName);
    return setOptions.find((option) => normalizeSet(option.name) === normalized) ?? null;
  }, [selectedSetName, setOptions]);

  useEffect(() => {
    let ignore = false;
    async function loadSets() {
      const response = await fetch("/api/card-sets");
      const body = await response.json().catch(() => null) as { cardSets?: CardSetOption[]; sets?: string[] } | null;
      if (ignore || !response.ok) return;
      const canonical = body?.cardSets ?? [];
      setSetOptions(canonical);
      setSetNameOptions(Array.from(new Set([...(body?.sets ?? []), ...canonical.map((set) => set.name)])).sort((left, right) => left.localeCompare(right)));
    }
    void loadSets();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current);
    };
  }, []);

  async function runAnalysis() {
    if (!selectedSet) {
      setError("Choose a canonical Pokemon set before analyzing. Video Rip will only match cards from that set.");
      return;
    }
    if (!selectedFile || !videoUrl || !videoRef.current) {
      setError("Upload a video before starting analysis.");
      return;
    }

    abortRef.current = false;
    setReport(null);
    setError(null);
    setStage("preparing");
    setProgress(2);
    setStatusText(`Preparing ${selectedSet.name}...`);
    const videoAnalysisId = crypto.randomUUID();

    try {
      const usageResponse = await fetch("/api/video-rip/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoAnalysisId,
          selectedSetId: selectedSet.id,
          fileName: selectedFile.name
        })
      });
      const usageBody = await usageResponse.json().catch(() => null) as { error?: string } | null;
      if (!usageResponse.ok) throw new Error(usageBody?.error ?? "Could not start Video Rip Analysis.");

      const setPackResponse = await fetch(`/api/scanner/set-pack?setId=${encodeURIComponent(selectedSet.id)}`);
      const setPackBody = await setPackResponse.json().catch(() => null) as { pack?: { cards?: unknown[] }; error?: string } | null;
      if (!setPackResponse.ok) throw new Error(setPackBody?.error ?? "Could not prepare the selected set.");
      setStatusText(`${setPackBody?.pack?.cards?.length ?? 0} cards ready. Extracting video frames...`);

      setStage("extracting");
      const extraction = await extractCandidateFramesFromVideo({
        video: videoRef.current,
        onProgress: (sampled, duration) => {
          setProgress(Math.min(38, 5 + sampled * 33));
          setStatusText(`Extracted ${Math.round(sampled * 100)}% of ${formatTimestamp(duration)}.`);
        },
        shouldAbort: () => abortRef.current
      });
      if (abortRef.current) return;
      const visibleSamples = extraction.samples.filter(isUsableVisibleSample);
      if (extraction.samples.length && visibleSamples.length < Math.max(2, Math.floor(extraction.samples.length * 0.08))) {
        throw new Error("The video loaded, but PackWatcher mostly received black frames from the browser decoder. This usually means the file is HEVC/H.265 MOV. Re-export or convert it as H.264 MP4, then run Video Rip Analysis again.");
      }

      setStage("finding-cards");
      setProgress(42);
      setStatusText("Finding card display windows...");
      const rawWindows = buildCardWindows(extraction.samples);
      const analysisWindows = buildAnalysisWindows(rawWindows, extraction.samples, extraction.duration);
      const windows = assignWindows(analysisWindows);
      if (!windows.length) {
        throw new Error("PackWatcher could read the video, but it could not decode any usable visible frames. If this is an iPhone MOV/HEVC file, export it as H.264 MP4 and try again.");
      }
      if (analysisWindows.length > rawWindows.length) {
        setStatusText("PackWatcher found sparse card windows, so it is also reviewing additional clear frames across the video.");
      }

      setStage("recognizing");
      setStatusText(`Detected ${windows.length} candidate card window${windows.length === 1 ? "" : "s"}. Recognizing cards...`);
      const cards: VideoRipRecognitionCard[] = [];
      let skippedWindows = 0;
      for (let index = 0; index < windows.length; index += 1) {
        if (abortRef.current) return;
        const window = windows[index];
        setProgress(45 + Math.round((index / Math.max(1, windows.length)) * 42));
        setStatusText(`Recognizing card ${index + 1} of ${windows.length} at ${formatTimestamp(window.bestFrameTimestamp)}...`);
        const card = await recognizeWindow({
          window,
          selectedSetId: selectedSet.id,
          videoAnalysisId,
          setName: selectedSet.name
        });
        if (card) cards.push(card);
        else skippedWindows += 1;
        await idlePause();
      }

      setStage("pricing");
      setProgress(92);
      setStatusText("Calculating pack totals and timeline...");
      const nextReport = buildVideoRipReport({
        id: videoAnalysisId,
        fileName: selectedFile.name,
        setId: selectedSet.id,
        setName: selectedSet.name,
        duration: extraction.duration,
        frameCount: extraction.estimatedFrameCount,
        analyzedFrameCount: extraction.samples.length,
        cards
      });
      setReport(nextReport);
      if (videoRef.current) videoRef.current.currentTime = 0;
      setStage("report-ready");
      setProgress(100);
      setStatusText(`Report ready: ${nextReport.cards.length} identified card${nextReport.cards.length === 1 ? "" : "s"}${skippedWindows ? `, ${skippedWindows} unclear frame${skippedWindows === 1 ? "" : "s"} skipped` : ""}.`);
    } catch (analysisError) {
      if (videoRef.current) videoRef.current.currentTime = 0;
      setStage("failed");
      setError(analysisError instanceof Error ? analysisError.message : "Video analysis failed.");
      setStatusText("Video Rip Analysis stopped.");
    }
  }

  function stopAnalysis() {
    abortRef.current = true;
    setStage("idle");
    setProgress(0);
    setStatusText("Analysis stopped.");
  }

  function updateCard(cardId: string, updates: Partial<VideoRipRecognitionCard>) {
    if (!report) return;
    setReport(updateReportCards(report, report.cards.map((card) => card.id === cardId ? { ...card, ...updates } : card)));
  }

  function deleteCard(cardId: string) {
    if (!report) return;
    setReport(updateReportCards(report, report.cards.filter((card) => card.id !== cardId)));
  }

  function addMissingCard(packId: string) {
    if (!report) return;
    const pack = report.packs.find((item) => item.id === packId) ?? report.packs[0];
    const card: VideoRipRecognitionCard = {
      id: crypto.randomUUID(),
      packId: pack?.id ?? "pack-1",
      canonicalCardId: null,
      canonicalSetId: report.setId,
      cardName: "Manual card",
      setName: report.setName,
      collectorNumber: null,
      rarity: null,
      variant: null,
      language: null,
      price: 0,
      confidence: 0,
      firstAppearance: pack?.start ?? 0,
      bestFrameTimestamp: pack?.start ?? 0,
      lastAppearance: pack?.start ?? 0,
      thumbnailDataUrl: null,
      referenceImageUrl: null,
      recognitionSource: "manual_review",
      pricingSource: "manual",
      notes: "Added manually during Video Rip review.",
      selected: true
    };
    setReport(updateReportCards(report, [...report.cards, card]));
  }

  async function addSelectedToInventory() {
    if (!report) return;
    const selectedCards = report.cards.filter((card) => card.selected && card.cardName.trim() && card.cardName !== "Unidentified card");
    if (!selectedCards.length) {
      setError("Select at least one identified card before adding to inventory.");
      return;
    }

    setIsAddingInventory(true);
    setError(null);
    try {
      const response = await fetch("/api/video-rip/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoAnalysisId: report.id,
          fileName: report.fileName,
          cards: selectedCards.map((card) => ({
            scanEventId: card.id,
            canonicalCardId: card.canonicalCardId,
            canonicalSetId: card.canonicalSetId,
            cardName: card.cardName,
            setName: card.setName,
            collectorNumber: card.collectorNumber,
            variant: card.variant,
            language: card.language,
            price: card.price,
            imageUrl: card.referenceImageUrl,
            packNumber: report.packs.find((pack) => pack.id === card.packId)?.packNumber ?? 1,
            timestamp: card.bestFrameTimestamp
          }))
        })
      });
      const body = await response.json().catch(() => null) as { error?: string; inserted?: number } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not add cards to inventory.");
      setStatusText(`Added ${body?.inserted ?? selectedCards.length} video card${selectedCards.length === 1 ? "" : "s"} to inventory.`);
    } catch (inventoryError) {
      setError(inventoryError instanceof Error ? inventoryError.message : "Could not add cards to inventory.");
    } finally {
      setIsAddingInventory(false);
    }
  }

  function exportReport(format: "csv" | "json" | "pdf") {
    if (!report) return;
    if (format === "csv") {
      downloadText(`packwatcher-video-rip-${Date.now()}.csv`, reportToCsv(report), "text/csv");
      return;
    }
    if (format === "json") {
      downloadText(`packwatcher-video-rip-${Date.now()}.json`, reportToJson(report), "application/json");
      return;
    }
    downloadText(`packwatcher-video-rip-${Date.now()}.pdf`, buildVideoRipPdf(report), "application/pdf");
  }

  const analyzing = !["idle", "report-ready", "failed"].includes(stage);

  return (
    <div className="space-y-5">
      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="space-y-3">
            <div>
              <p className="pw-hud text-xs font-black">Video Rip Analysis</p>
              <h2 className="mt-1 text-2xl font-black text-white">Analyze a pack-opening video</h2>
              <p className="mt-2 text-sm text-slate-300">
                Upload a video, choose the set, and PackWatcher will sample the whole rip, group cards into packs, pick the clearest frames, and reuse the selected-set scanner matcher.
              </p>
            </div>
            <SetCombobox
              value={selectedSetName}
              onChange={setSelectedSetName}
              options={setNameOptions}
              placeholder="Choose Pokemon set"
            />
            <label className="grid min-h-36 cursor-pointer place-items-center rounded-lg border border-dashed border-amber-300/35 bg-slate-950/60 p-4 text-center">
              <Upload className="h-8 w-8 text-amber-200" />
              <span className="mt-2 text-sm font-black text-white">{selectedFile ? selectedFile.name : "Upload MP4, MOV, HEVC, H264, or AV1 video"}</span>
              <span className="mt-1 text-xs text-slate-400">Video stays local while frames are extracted. Temporary frame images are discarded when you leave this page.</span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/mov,video/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current);
                  const nextUrl = file ? URL.createObjectURL(file) : null;
                  videoObjectUrlRef.current = nextUrl;
                  setSelectedFile(file);
                  setVideoUrl(nextUrl);
                  setPreviewPoster(null);
                  setDecodeWarning(null);
                  setReport(null);
                  setError(null);
                  setStage("idle");
                  setProgress(0);
                  setStatusText("Video loaded. Start analysis when ready.");
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={analyzing || !selectedFile || !selectedSet}
                className="pw-button inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Analyze video
              </button>
              {analyzing ? (
                <button type="button" onClick={stopAnalysis} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-black text-slate-100">
                  Stop
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                preload="auto"
                playsInline
                muted
                poster={previewPoster ?? undefined}
                onLoadedData={() => void inspectVideoPreview(videoRef.current, setPreviewPoster, setDecodeWarning)}
                className="aspect-video w-full rounded-lg bg-black object-contain"
              />
            ) : (
              <div className="grid aspect-video place-items-center rounded-lg bg-slate-950 text-sm text-slate-500">Video preview</div>
            )}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-400">
                <span>{stageLabels[stage]}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900">
                <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
              <p className="mt-2 text-sm text-slate-300">{statusText}</p>
              {error ? <p className="mt-2 rounded-lg border border-rose-300/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
              {decodeWarning ? <p className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">{decodeWarning}</p> : null}
            </div>
          </div>
        </div>
      </section>

      {report ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryTile label="Video length" value={formatTimestamp(report.duration)} />
            <SummaryTile label="Packs" value={String(report.packs.length)} />
            <SummaryTile label="Cards" value={String(report.cards.length)} />
            <SummaryTile label="Value" value={currency(report.totalValue)} />
            <SummaryTile label="Highest pull" value={report.highestPull ? `${report.highestPull.cardName} ${currency(report.highestPull.price)}` : "None"} />
          </div>

          <div className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="pw-hud text-xs font-black">Review</p>
                <h3 className="text-xl font-black text-white">Packs and cards</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={addSelectedToInventory} disabled={isAddingInventory} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 text-sm font-black text-cyan-100 disabled:opacity-50">
                  {isAddingInventory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Add selected
                </button>
                <ExportButton icon={<FileSpreadsheet className="h-4 w-4" />} label="CSV" onClick={() => exportReport("csv")} />
                <ExportButton icon={<FileJson className="h-4 w-4" />} label="JSON" onClick={() => exportReport("json")} />
                <ExportButton icon={<FileText className="h-4 w-4" />} label="PDF" onClick={() => exportReport("pdf")} />
              </div>
            </div>

            <div className="mt-4 max-h-[72dvh] space-y-4 overflow-y-auto pr-1">
              {report.packs.map((pack) => (
                <article key={pack.id} className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-lg font-black text-white">Pack {pack.packNumber}</h4>
                      <p className="text-sm text-slate-400">{formatTimestamp(pack.start)} - {formatTimestamp(pack.end)} · {pack.cards.length} cards · {currency(pack.totalValue)}</p>
                    </div>
                    <button type="button" onClick={() => addMissingCard(pack.id)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-black text-slate-100">
                      <Plus className="h-4 w-4" />
                      Add missing
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {pack.cards.map((card) => (
                      <VideoCardReviewRow
                        key={card.id}
                        card={card}
                        packNumber={pack.packNumber}
                        onDelete={() => deleteCard(card.id)}
                        onUpdate={(updates) => updateCard(card.id, updates)}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <p className="pw-hud text-xs font-black">Timeline</p>
            <div className="mt-3 grid gap-2">
              {report.timeline.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = event.timestamp;
                    videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="flex min-h-10 items-center justify-between rounded-lg border border-white/10 bg-slate-950/50 px-3 text-left text-sm"
                >
                  <span className="font-black text-white">{event.label}</span>
                  <span className="text-slate-400">{formatTimestamp(event.timestamp)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="pw-stat-tile rounded-lg p-4">
      <p className="pw-hud text-[11px] font-black">{label}</p>
      <p className="mt-2 line-clamp-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function ExportButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-black text-slate-100">
      {icon}
      {label}
    </button>
  );
}

function VideoCardReviewRow({ card, packNumber, onUpdate, onDelete }: {
  card: VideoRipRecognitionCard;
  packNumber: number;
  onUpdate: (updates: Partial<VideoRipRecognitionCard>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-black/25 p-3 sm:grid-cols-[80px_1fr_auto]">
      <div className="h-24 w-20 overflow-hidden rounded-lg border border-white/10 bg-slate-900">
        {card.referenceImageUrl || card.thumbnailDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.referenceImageUrl ?? card.thumbnailDataUrl ?? ""} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-xs text-slate-500">No image</div>
        )}
      </div>
      <div className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Card
            <input value={card.cardName} onChange={(event) => onUpdate({ cardName: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-amber-300" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Number
            <input value={card.collectorNumber ?? ""} onChange={(event) => onUpdate({ collectorNumber: event.target.value || null })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-amber-300" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Rarity
            <input value={card.rarity ?? ""} onChange={(event) => onUpdate({ rarity: event.target.value || null })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-amber-300" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Price
            <input type="number" min="0" step="0.01" value={card.price} onChange={(event) => onUpdate({ price: Number(event.target.value || 0) })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-amber-300" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>Pack {packNumber}</span>
          <span>{formatTimestamp(card.bestFrameTimestamp)}</span>
          <span>{Math.round(card.confidence * 100)}% confidence</span>
          <label className="inline-flex items-center gap-2 font-bold text-slate-200">
            <input type="checkbox" checked={card.selected} onChange={(event) => onUpdate({ selected: event.target.checked })} className="h-4 w-4 accent-amber-300" />
            Add
          </label>
        </div>
        {card.notes ? <p className="text-xs text-amber-100/80">{card.notes}</p> : null}
      </div>
      <button type="button" onClick={onDelete} aria-label="Delete card" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-300/25 text-rose-100">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

async function extractCandidateFramesFromVideo(input: {
  video: HTMLVideoElement;
  onProgress: (progress: number, duration: number) => void;
  shouldAbort: () => boolean;
}) {
  const { video } = input;
  await waitForVideoMetadata(video);
  video.pause();
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const estimatedFrameCount = Math.round(duration * 30);
  const samples: VideoRipFrameSample[] = [];
  let previousLuma: Uint8Array | null = null;
  let timestamp = 0;
  let sampleCount = 0;

  while (timestamp <= duration && sampleCount < VIDEO_RIP_ANALYSIS_CONFIG.maxAnalyzedFrames) {
    if (input.shouldAbort()) break;
    await seekVideo(video, timestamp);
    const sample = captureVideoSample(video, timestamp, previousLuma);
    previousLuma = sample.luma;
    samples.push(sample.frame);
    sampleCount += 1;
    input.onProgress(duration ? timestamp / duration : 1, duration);
    const interval = sample.frame.cardLikeScore >= 0.46
      ? VIDEO_RIP_ANALYSIS_CONFIG.denseSampleIntervalSeconds
      : VIDEO_RIP_ANALYSIS_CONFIG.baseSampleIntervalSeconds;
    timestamp += interval;
    await idlePause();
  }

  await seekVideo(video, 0);
  return { duration, estimatedFrameCount, samples };
}

function captureVideoSample(video: HTMLVideoElement, timestamp: number, previousLuma: Uint8Array | null) {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const width = 360;
  const height = Math.max(1, Math.round(sourceHeight / sourceWidth * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not analyze video frame.");
  context.drawImage(video, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const metrics = computeFrameMetrics(imageData, previousLuma);

  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = Math.min(960, sourceWidth);
  fullCanvas.height = Math.max(1, Math.round(sourceHeight / sourceWidth * fullCanvas.width));
  const fullContext = fullCanvas.getContext("2d");
  if (!fullContext) throw new Error("Could not capture video frame.");
  fullContext.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
  const scored = scoreFrameQuality(metrics);

  return {
    luma: metrics.luma,
    frame: {
      id: crypto.randomUUID(),
      timestamp,
      imageDataUrl: fullCanvas.toDataURL("image/jpeg", 0.84),
      brightness: metrics.brightness,
      sharpness: metrics.sharpness,
      edgeDensity: metrics.edgeDensity,
      motionScore: metrics.motionScore,
      coverageScore: metrics.coverageScore,
      glareScore: metrics.glareScore,
      cardLikeScore: scored.cardLikeScore,
      qualityScore: scored.qualityScore,
      visualFingerprint: metrics.visualFingerprint
    } satisfies VideoRipFrameSample
  };
}

function computeFrameMetrics(imageData: ImageData, previousLuma: Uint8Array | null) {
  const { data, width, height } = imageData;
  const luma = new Uint8Array(width * height);
  let sum = 0;
  let glare = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]);
    const pixel = index / 4;
    luma[pixel] = value;
    sum += value;
    const max = Math.max(data[index], data[index + 1], data[index + 2]);
    const min = Math.min(data[index], data[index + 1], data[index + 2]);
    if (value > 232 && max - min < 24) glare += 1;
  }

  let edgeCount = 0;
  let edgeStrength = 0;
  let laplacianSum = 0;
  let laplacianSquares = 0;
  let laplacianCount = 0;
  let centerEdges = 0;
  let outerEdges = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gradient = Math.abs(luma[i] - luma[i - 1]) + Math.abs(luma[i] - luma[i - width]);
      edgeStrength += gradient;
      if (gradient > 34) {
        edgeCount += 1;
        if (x > width * 0.18 && x < width * 0.82 && y > height * 0.08 && y < height * 0.92) centerEdges += 1;
        else outerEdges += 1;
      }
      const laplacian = luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width] - 4 * luma[i];
      laplacianSum += laplacian;
      laplacianSquares += laplacian * laplacian;
      laplacianCount += 1;
    }
  }

  let motion = 0;
  if (previousLuma && previousLuma.length === luma.length) {
    for (let index = 0; index < luma.length; index += 4) motion += Math.abs(luma[index] - previousLuma[index]);
    motion = motion / Math.max(1, luma.length / 4) / 255;
  }

  const pixels = width * height;
  const edgeDensity = edgeCount / pixels;
  const sharpness = laplacianCount ? laplacianSquares / laplacianCount - (laplacianSum / laplacianCount) ** 2 : 0;
  const coverageScore = Math.min(1, (centerEdges / Math.max(1, centerEdges + outerEdges)) * 1.35);
  return {
    luma,
    brightness: sum / pixels,
    sharpness,
    edgeDensity,
    motionScore: motion,
    coverageScore,
    glareScore: glare / pixels,
    edgeStrength: edgeStrength / Math.max(1, laplacianCount),
    visualFingerprint: buildVisualFingerprint(luma, width, height)
  };
}

function assignWindows(windows: VideoRipCardWindow[]) {
  return assignWindowsToPacks(windows);
}

function buildAnalysisWindows(rawWindows: VideoRipCardWindow[], samples: VideoRipFrameSample[], duration: number) {
  const fallbackWindows = buildFallbackWindows(samples);
  const targetWindowCount = Math.min(VIDEO_RIP_ANALYSIS_CONFIG.maxRecognitionWindows, Math.max(rawWindows.length, Math.ceil(duration / 7.5)));
  const combined = [...rawWindows];

  for (const fallback of fallbackWindows) {
    if (combined.length >= targetWindowCount) break;
    if (combined.some((window) => windowsOverlap(window, fallback))) continue;
    combined.push(fallback);
  }

  return combined
    .sort((left, right) => right.qualityScore - left.qualityScore)
    .slice(0, VIDEO_RIP_ANALYSIS_CONFIG.maxRecognitionWindows)
    .sort((left, right) => left.bestFrameTimestamp - right.bestFrameTimestamp)
    .map((window, index) => ({ ...window, id: `window-${index + 1}` }));
}

function windowsOverlap(left: VideoRipCardWindow, right: VideoRipCardWindow) {
  const timeDistance = Math.abs(left.bestFrameTimestamp - right.bestFrameTimestamp);
  if (timeDistance < 1.1) return true;
  const fingerprintDistance = visualFingerprintDistance(left.bestFrame.visualFingerprint, right.bestFrame.visualFingerprint);
  return timeDistance < 4 && fingerprintDistance > 0 && fingerprintDistance < 6;
}

function buildFallbackWindows(samples: VideoRipFrameSample[]) {
  const visibleSamples = samples
    .filter(isStrongFallbackCardFrame)
    .sort((left, right) => right.qualityScore - left.qualityScore);
  const picked: VideoRipFrameSample[] = [];
  for (const sample of visibleSamples) {
    if (picked.length >= VIDEO_RIP_ANALYSIS_CONFIG.maxRecognitionWindows) break;
    if (picked.some((existing) => Math.abs(existing.timestamp - sample.timestamp) < 2.2)) continue;
    picked.push(sample);
  }
  return picked
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((sample, index): VideoRipCardWindow => ({
      id: `fallback-window-${index + 1}`,
      packId: `pack-${Math.floor(index / 11) + 1}`,
      firstAppearance: Math.max(0, sample.timestamp - 1.2),
      bestFrameTimestamp: sample.timestamp,
      lastAppearance: sample.timestamp + 1.2,
      bestFrame: sample,
      alternateFrames: samples
        .filter((candidate) => candidate.id !== sample.id && Math.abs(candidate.timestamp - sample.timestamp) <= 1.8)
        .sort((left, right) => right.qualityScore - left.qualityScore)
        .slice(0, 2),
      qualityScore: sample.qualityScore
    }));
}

function isUsableVisibleSample(sample: VideoRipFrameSample) {
  return sample.brightness > 12 && sample.sharpness > 2 && sample.edgeDensity > 0.002;
}

function buildVisualFingerprint(luma: Uint8Array, width: number, height: number) {
  const grid = 8;
  const values: number[] = [];
  const startX = Math.floor(width * 0.22);
  const endX = Math.floor(width * 0.78);
  const startY = Math.floor(height * 0.08);
  const endY = Math.floor(height * 0.92);
  const cellWidth = Math.max(1, Math.floor((endX - startX) / grid));
  const cellHeight = Math.max(1, Math.floor((endY - startY) / grid));

  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      let sum = 0;
      let count = 0;
      const x0 = startX + column * cellWidth;
      const y0 = startY + row * cellHeight;
      for (let y = y0; y < Math.min(endY, y0 + cellHeight); y += 1) {
        for (let x = x0; x < Math.min(endX, x0 + cellWidth); x += 1) {
          sum += luma[y * width + x] ?? 0;
          count += 1;
        }
      }
      values.push(count ? sum / count : 0);
    }
  }

  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return values.map((value) => value >= median ? "1" : "0").join("");
}

async function inspectVideoPreview(
  video: HTMLVideoElement | null,
  setPreviewPoster: (value: string | null) => void,
  setDecodeWarning: (value: string | null) => void
) {
  if (!video || !video.videoWidth || !video.videoHeight) return;
  try {
    video.pause();
    await seekVideo(video, Math.min(1, Math.max(0.05, video.duration * 0.03)));
    const sample = captureVideoSample(video, video.currentTime, null).frame;
    if (isUsableVisibleSample(sample)) {
      setPreviewPoster(sample.imageDataUrl);
      setDecodeWarning(null);
    } else {
      setDecodeWarning("PackWatcher can read the video duration, but the preview frame is black. This is usually an HEVC/H.265 MOV decode issue in this browser. Convert/export the video as H.264 MP4 for reliable analysis.");
    }
    video.currentTime = 0;
  } catch {
    setDecodeWarning("PackWatcher could not decode a preview frame from this video. Convert/export it as H.264 MP4 and try again.");
  }
}

async function recognizeWindow(input: {
  window: VideoRipCardWindow;
  selectedSetId: string;
  setName: string;
  videoAnalysisId: string;
}): Promise<VideoRipRecognitionCard | null> {
  const frames = [input.window.bestFrame, ...input.window.alternateFrames].slice(0, 3);
  const candidates: FusionInput[] = [];
  const recognitionImages = [
    await buildRecognitionContactSheet(frames)
  ];

  for (const imageDataUrl of recognitionImages) {
    const payload = dataUrlToPayload(imageDataUrl);
    const response = await fetch("/api/video-rip/recognize-frame", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        videoAnalysisId: input.videoAnalysisId,
        scanEventId: crypto.randomUUID(),
        selectedSetId: input.selectedSetId,
        imageBase64: payload.imageBase64,
        mimeType: payload.mimeType,
        timestamp: input.window.bestFrameTimestamp,
        language: "auto",
        foilPreference: "auto",
        usageReserved: true
      })
    });
    const body = await response.json().catch(() => null) as RecognitionResponse | null;
    if (response.ok && body?.cards?.length) candidates.push(...body.cards);
    else if (body?.code === "VIDEO_SCAN_LIMIT_REACHED" || body?.code === "RECOGNITION_DISABLED") throw new Error(body.error ?? "Video Rip Analysis could not continue.");
    if (candidates.length && candidates.some((candidate) => candidate.confidence >= 0.72)) break;
  }

  const fused = fuseRecognitionCandidates(candidates);
  if (!fused) return null;

  return {
    id: crypto.randomUUID(),
    packId: input.window.packId,
    canonicalCardId: fused.canonicalCardId,
    canonicalSetId: fused.canonicalSetId,
    cardName: fused.cardName,
    setName: fused.setName,
    collectorNumber: fused.collectorNumber,
    rarity: fused.rarity,
    variant: fused.variant,
    language: fused.language,
    price: fused.price,
    confidence: fused.confidence,
    firstAppearance: input.window.firstAppearance,
    bestFrameTimestamp: input.window.bestFrameTimestamp,
    lastAppearance: input.window.lastAppearance,
    thumbnailDataUrl: input.window.bestFrame.imageDataUrl,
    referenceImageUrl: fused.referenceImageUrl,
    recognitionSource: fused.recognitionSource,
    pricingSource: fused.pricingSource,
    notes: candidates.length > 1 ? `Fused evidence from ${candidates.length} candidate frames.` : null,
    selected: true
  } satisfies VideoRipRecognitionCard;
}

async function buildRecognitionContactSheet(frames: VideoRipFrameSample[]) {
  const sourceImages = await Promise.all(frames.map((frame) => loadImage(frame.imageDataUrl)));
  const first = sourceImages[0];
  if (!first) return frames[0]?.imageDataUrl ?? "";

  const canvas = document.createElement("canvas");
  canvas.width = 896;
  canvas.height = 896;
  const context = canvas.getContext("2d");
  if (!context) return frames[0]?.imageDataUrl ?? "";

  context.fillStyle = "#020617";
  context.fillRect(0, 0, canvas.width, canvas.height);

  drawImageContain(context, first, 12, 12, 430, 430);
  drawImageContain(context, first, 454, 12, 430, 430, centerCardCrop(first));
  drawImageContain(context, first, 12, 454, 430, 204, relativeCrop(first, 0.12, 0.06, 0.76, 0.35));
  drawImageContain(context, first, 12, 674, 430, 210, relativeCrop(first, 0.12, 0.58, 0.76, 0.34));

  const alternate = sourceImages[1] ?? sourceImages[2] ?? first;
  drawImageContain(context, alternate, 454, 454, 430, 430, centerCardCrop(alternate));

  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  crop: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }
) {
  context.fillStyle = "#000";
  context.fillRect(x, y, width, height);
  const scale = Math.min(width / crop.width, height / crop.height);
  const drawWidth = crop.width * scale;
  const drawHeight = crop.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, drawX, drawY, drawWidth, drawHeight);
}

function centerCardCrop(image: HTMLImageElement) {
  const content = detectNonBlackBounds(image);
  const cropWidth = content.width * 0.72;
  const cropHeight = content.height * 0.82;
  return {
    x: content.x + (content.width - cropWidth) / 2,
    y: content.y + (content.height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight
  };
}

function relativeCrop(image: HTMLImageElement, rx: number, ry: number, rw: number, rh: number) {
  const content = detectNonBlackBounds(image);
  return {
    x: content.x + content.width * rx,
    y: content.y + content.height * ry,
    width: content.width * rw,
    height: content.height * rh
  };
}

function detectNonBlackBounds(image: HTMLImageElement) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(320, width);
  canvas.height = Math.max(1, Math.round(height / width * canvas.width));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, width, height };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      if (luma <= 14) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, width, height };
  const scaleX = width / canvas.width;
  const scaleY = height / canvas.height;
  return {
    x: Math.max(0, minX * scaleX),
    y: Math.max(0, minY * scaleY),
    width: Math.min(width, (maxX - minX + 1) * scaleX),
    height: Math.min(height, (maxY - minY + 1) * scaleY)
  };
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Could not read video metadata.")), 12000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Could not load this video file."));
    };
  });
}

function seekVideo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.05));
    const timeout = window.setTimeout(() => reject(new Error("Video seek timed out.")), 10000);
    const done = async () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", done);
      await waitForDecodedFrame(video);
      resolve();
    };
    if (Math.abs(video.currentTime - target) < 0.015 && video.readyState >= 2) {
      window.clearTimeout(timeout);
      void waitForDecodedFrame(video).then(resolve);
      return;
    }
    video.addEventListener("seeked", done);
    video.currentTime = target;
  });
}

function waitForDecodedFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const requestVideoFrameCallback = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      }
    ).requestVideoFrameCallback;
    const timeout = window.setTimeout(() => resolve(), 180);
    if (typeof requestVideoFrameCallback === "function") {
      requestVideoFrameCallback.call(video, () => {
        window.clearTimeout(timeout);
        resolve();
      });
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.clearTimeout(timeout);
      resolve();
    }));
  });
}

function dataUrlToPayload(dataUrl: string) {
  const [header, imageBase64] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*);base64/)?.[1] ?? "image/jpeg";
  return { imageBase64, mimeType };
}

function downloadText(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function idlePause() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function normalizeSet(value: string) {
  return value.toLowerCase().replace(/pokémon/g, "pokemon").replace(/[^a-z0-9]+/g, " ").trim();
}
