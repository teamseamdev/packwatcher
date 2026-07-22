"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, Eye, ImageIcon, RotateCcw, Save, ShieldAlert, Trash2 } from "lucide-react";
import { analyzeCenteringPhoto } from "@/lib/centering/browser-vision";
import { buildCenteringAnalysis, CENTERING_DISCLAIMER } from "@/lib/centering/grading-standards";
import { analyzeCenteringSide, marginLinesFromPercent, overallConfidence, ratioText, recommendationFor } from "@/lib/centering/geometry";
import type { CenteringAnalysisResult, CenteringMethod, CenteringSide, CenteringSideResult, MarginMeasurement } from "@/lib/centering/types";
import type { Point, Quad } from "@/lib/scanner/geometry";

type InventoryContext = {
  id: string;
  name: string;
  cardName: string;
  setName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  canonicalCardId: string | null;
};

type ExistingAnalysis = {
  id: string;
  front_lr_ratio: string | null;
  front_tb_ratio: string | null;
  back_lr_ratio: string | null;
  back_tb_ratio: string | null;
  overall_confidence: string;
  recommendation: string;
  created_at: string;
};

type SideCapture = {
  side: CenteringSide;
  dataUrl: string;
  correctedDataUrl: string;
  width: number;
  height: number;
  corners: Quad;
  innerFrame: MarginMeasurement;
  detectionMethod: CenteringMethod;
  detectionConfidence: number;
  referenceImageUsed: string | null;
  referenceRegistrationScore: number | null;
  blockers: string[];
  userAdjusted: boolean;
};

const defaultFrontMargins = { left: 0.085, right: 0.085, top: 0.1, bottom: 0.105 };
const defaultBackMargins = { left: 0.13, right: 0.13, top: 0.11, bottom: 0.11 };
const CENTERING_MAX_CAPTURE_DIMENSION = 900;
const CENTERING_DETECTION_TIMEOUT_MS = 6000;

export function CenteringCheckFlow({
  inventoryItem,
  latestAnalysis,
  returnTo = "/scanner"
}: {
  inventoryItem?: InventoryContext | null;
  latestAnalysis?: ExistingAnalysis | null;
  returnTo?: string;
}) {
  const [front, setFront] = useState<SideCapture | null>(null);
  const [back, setBack] = useState<SideCapture | null>(null);
  const [activeSide, setActiveSide] = useState<CenteringSide>("front");
  const [savePhotos, setSavePhotos] = useState(false);
  const [sleeveWarning, setSleeveWarning] = useState(false);
  const [result, setResult] = useState<CenteringAnalysisResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeCapture = activeSide === "front" ? front : back;
  const setActiveCapture = activeSide === "front" ? setFront : setBack;

  const canAnalyze = Boolean(front || back);
  const latestSummary = latestAnalysis ? `${latestAnalysis.front_lr_ratio ?? "Front not checked"} front L/R · ${latestAnalysis.back_lr_ratio ?? "Back not checked"} back L/R` : null;

  function analyze() {
    const frontResult = front ? analyzeCapture(front) : null;
    const backResult = back ? analyzeCapture(back) : null;
    const confidence = overallConfidence(frontResult, backResult);
    const recommendation = recommendationFor(frontResult, backResult);
    setResult(buildCenteringAnalysis(frontResult, backResult, confidence, recommendation));
    setStatus("Centering estimate ready. Review before saving.");
    setError(null);
  }

  async function saveAnalysis() {
    if (!result) return;
    setSaving(true);
    setError(null);
    const response = await fetch("/api/centering/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inventoryItemId: inventoryItem?.id ?? null,
        canonicalCardId: inventoryItem?.canonicalCardId ?? null,
        savePhotos,
        sleeveToploaderWarning: sleeveWarning,
        result,
        images: [
          front ? { side: "front", kind: "original", dataUrl: front.dataUrl } : null,
          front ? { side: "front", kind: "corrected", dataUrl: front.correctedDataUrl } : null,
          back ? { side: "back", kind: "original", dataUrl: back.dataUrl } : null,
          back ? { side: "back", kind: "corrected", dataUrl: back.correctedDataUrl } : null
        ].filter(Boolean)
      })
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok || !body?.ok) {
      setError(body?.error ?? "Could not save centering analysis.");
      return;
    }
    setStatus(savePhotos ? "Centering analysis and private photos saved." : "Centering measurements saved without photos.");
  }

  async function deleteLatest() {
    if (!latestAnalysis) return;
    setSaving(true);
    const response = await fetch(`/api/centering/analyses/${latestAnalysis.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok || !body?.ok) {
      setError(body?.error ?? "Could not delete centering analysis.");
      return;
    }
    setStatus("Latest centering analysis deleted. Refresh to update the summary.");
  }

  return (
    <div className="space-y-5">
      <section className="pw-hero p-5">
        <p className="pw-hud text-xs font-black">Grading precheck</p>
        <h1 className="mt-1 text-3xl font-black text-white">Centering Check</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Estimate front and back centering from photos. This is not an official grade or a guarantee.
        </p>
        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-50">{CENTERING_DISCLAIMER}</p>
      </section>

      {inventoryItem ? (
        <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex gap-3">
            {inventoryItem.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={inventoryItem.imageUrl} alt="" className="h-20 w-14 rounded-md object-cover" />
            ) : (
              <div className="grid h-20 w-14 place-items-center rounded-md bg-white/5 text-slate-500"><ImageIcon className="h-5 w-5" /></div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-200">Attached inventory card</p>
              <h2 className="mt-1 text-lg font-black text-white">{inventoryItem.cardName}</h2>
              <p className="text-sm text-slate-400">{[inventoryItem.cardNumber, inventoryItem.setName].filter(Boolean).join(" · ") || "No set metadata"}</p>
              {latestSummary ? <p className="mt-2 text-xs text-slate-500">Latest: {latestSummary}</p> : <p className="mt-2 text-xs text-slate-500">No saved centering check yet.</p>}
            </div>
          </div>
        </section>
      ) : null}

      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <h2 className="text-lg font-black text-white">Photo guidance</h2>
        <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300 sm:grid-cols-2">
          <p>Use a plain contrasting background, even lighting, and the rear camera.</p>
          <p>Keep the entire card visible and hold the camera directly above it.</p>
          <p>Avoid glare, shadows, digital zoom, wide-angle distortion, and cropped edges.</p>
          <p>Sleeves and toploaders can reduce accuracy because plastic edges and glare may be measured instead of the card.</p>
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
          <input type="checkbox" checked={sleeveWarning} onChange={(event) => setSleeveWarning(event.target.checked)} className="h-5 w-5 accent-amber-300" />
          Card is in a sleeve/toploader or photo conditions may reduce accuracy.
        </label>
      </section>

      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveSide("front")} className={tabClass(activeSide === "front")}>Front</button>
          <button type="button" onClick={() => setActiveSide("back")} className={tabClass(activeSide === "back")}>Back</button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {activeCapture ? (
              <CenteringSideEditor capture={activeCapture} onChange={setActiveCapture} />
            ) : (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-white/15 bg-slate-950/50 p-6 text-center">
                <div>
                  <Camera className="mx-auto h-10 w-10 text-amber-200" />
                  <p className="mt-3 font-bold text-white">Capture {activeSide}</p>
                  <p className="mt-2 max-w-sm text-sm text-slate-400">Use your camera or choose a photo. You will adjust the card corners before analysis.</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <ImageCaptureButton
              side={activeSide}
              referenceImageUrl={inventoryItem?.imageUrl ?? null}
              onCapture={setActiveCapture}
              onStatus={setStatus}
              onError={setError}
            />
            <button type="button" onClick={() => setActiveCapture(null)} disabled={!activeCapture} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" />
              Retake {activeSide}
            </button>
            <button type="button" onClick={analyze} disabled={!canAnalyze} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50">
              <Eye className="h-4 w-4" />
              Analyze centering
            </button>
            <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
              <input type="checkbox" checked={savePhotos} onChange={(event) => setSavePhotos(event.target.checked)} className="mt-1 h-5 w-5 accent-amber-300" />
              <span>
                <span className="block font-semibold">Save private photos</span>
                <span className="text-xs text-slate-500">Off means PackWatcher saves measurements only after analysis.</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      {result ? (
        <CenteringResultPanel result={result} saving={saving} onSave={saveAnalysis} />
      ) : null}

      {latestAnalysis ? (
        <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <h2 className="font-black text-white">Saved analysis</h2>
          <p className="mt-2 text-sm text-slate-300">{latestSummary}</p>
          <p className="mt-1 text-xs text-slate-500">Saved {new Date(latestAnalysis.created_at).toLocaleString()} · Confidence {latestAnalysis.overall_confidence}</p>
          <button type="button" onClick={deleteLatest} disabled={saving} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-300/30 px-3 text-sm font-semibold text-rose-100">
            <Trash2 className="h-4 w-4" />
            Delete latest
          </button>
        </section>
      ) : null}

      {status ? <p className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{status}</p> : null}
      {error ? <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}

      <Link href={returnTo} className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
        Back
      </Link>
    </div>
  );
}

function ImageCaptureButton({
  side,
  referenceImageUrl,
  onCapture,
  onStatus,
  onError
}: {
  side: CenteringSide;
  referenceImageUrl?: string | null;
  onCapture: (capture: SideCapture) => void;
  onStatus: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [detecting, setDetecting] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return;
    setDetecting(true);
    onStatus(`Detecting ${side} card boundary...`);
    onError(null);
    let prepared: { dataUrl: string; width: number; height: number } | null = null;
    try {
      const rawDataUrl = await readFileDataUrl(file);
      prepared = await prepareCenteringDataUrl(rawDataUrl);
      await nextFrame();
      if (!shouldAutoDetectOnCapture()) {
        onCapture({
          side,
          dataUrl: prepared.dataUrl,
          correctedDataUrl: prepared.dataUrl,
          width: prepared.width,
          height: prepared.height,
          corners: initialCorners(prepared.width, prepared.height),
          innerFrame: side === "front" ? defaultFrontMargins : defaultBackMargins,
          detectionMethod: "manual",
          detectionConfidence: 0.5,
          referenceImageUsed: null,
          referenceRegistrationScore: null,
          blockers: ["manual-corner-review-required"],
          userAdjusted: true
        });
        onStatus("Photo loaded. Adjust the card corners and printed-frame lines, then analyze centering.");
        return;
      }
      const detected = await withTimeout(analyzeCenteringPhoto({
        dataUrl: prepared.dataUrl,
        side,
        width: prepared.width,
        height: prepared.height,
        referenceImageUrl,
        useOpenCv: shouldUseOpenCvForCentering()
      }), CENTERING_DETECTION_TIMEOUT_MS);
      onCapture({
        side,
        dataUrl: prepared.dataUrl,
        correctedDataUrl: detected.correctedDataUrl,
        width: detected.width,
        height: detected.height,
        corners: detected.corners,
        innerFrame: detected.innerFrame,
        detectionMethod: detected.method,
        detectionConfidence: detected.detectionConfidence,
        referenceImageUsed: detected.referenceImageUsed,
        referenceRegistrationScore: detected.referenceRegistrationScore,
        blockers: detected.blockers,
        userAdjusted: false
      });
      onStatus(detected.referenceImageUsed
        ? "Boundary detected. Reference image was used to initialize the front frame."
        : "Boundary detected. Review corners and printed-frame lines before analysis.");
    } catch (error) {
      if (!prepared) {
        const rawDataUrl = await readFileDataUrl(file);
        prepared = await prepareCenteringDataUrl(rawDataUrl);
      }
      onCapture({
        side,
        dataUrl: prepared.dataUrl,
        correctedDataUrl: prepared.dataUrl,
        width: prepared.width,
        height: prepared.height,
        corners: initialCorners(prepared.width, prepared.height),
        innerFrame: side === "front" ? defaultFrontMargins : defaultBackMargins,
        detectionMethod: "manual",
        detectionConfidence: 0.35,
        referenceImageUsed: null,
        referenceRegistrationScore: null,
        blockers: ["automatic-boundary-detection-failed"],
        userAdjusted: true
      });
      onError(error instanceof Error ? `Automatic detection failed: ${error.message}. Adjust corners manually.` : "Automatic detection failed. Adjust corners manually.");
    } finally {
      setDetecting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={detecting} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-bold text-amber-100 disabled:opacity-60">
        <Camera className="h-4 w-4" />
        {detecting ? "Detecting..." : `Capture ${side}`}
      </button>
    </>
  );
}

function CenteringSideEditor({ capture, onChange }: { capture: SideCapture; onChange: (capture: SideCapture) => void }) {
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const lines = marginLinesFromPercent(capture.innerFrame, capture.width, capture.height);

  function updateCorner(index: number, point: Point) {
    const next = capture.corners.map((corner, cornerIndex) => cornerIndex === index ? point : corner) as Quad;
    onChange({ ...capture, corners: next, userAdjusted: true });
  }

  function updateMargin(key: keyof MarginMeasurement, value: number) {
    onChange({ ...capture, innerFrame: { ...capture.innerFrame, [key]: value }, userAdjusted: true });
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={capture.dataUrl} alt={`${capture.side} card capture`} className="block w-full select-none" draggable={false} />
        <svg className="absolute inset-0 h-full w-full touch-none" viewBox={`0 0 ${capture.width} ${capture.height}`} preserveAspectRatio="none">
          <polygon points={capture.corners.map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(250,204,21,0.08)" stroke="rgb(250,204,21)" strokeWidth={Math.max(4, capture.width * 0.006)} />
          <rect x={lines.leftX} y={lines.topY} width={lines.rightX - lines.leftX} height={lines.bottomY - lines.topY} fill="rgba(34,211,238,0.08)" stroke="rgb(34,211,238)" strokeDasharray="12 10" strokeWidth={Math.max(3, capture.width * 0.004)} />
          {capture.corners.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={Math.max(16, capture.width * 0.018)}
              fill={activeCorner === index ? "rgb(34,211,238)" : "rgb(250,204,21)"}
              onPointerDown={(event) => {
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setActiveCorner(index);
              }}
              onPointerMove={(event) => {
                if (activeCorner !== index) return;
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                updateCorner(index, {
                  x: clamp((event.clientX - rect.left) / rect.width * capture.width, 0, capture.width),
                  y: clamp((event.clientY - rect.top) / rect.height * capture.height, 0, capture.height)
                });
              }}
              onPointerUp={() => setActiveCorner(null)}
            />
          ))}
        </svg>
        {activeCorner !== null ? (
          <div className="absolute left-3 top-3 rounded-lg border border-cyan-300/30 bg-slate-950/90 px-3 py-2 text-xs text-cyan-100">
            Align handle to the physical card corner.
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
        <p className="text-sm font-bold text-white">Inner printed-frame lines</p>
        <p className="mt-1 text-xs text-slate-500">Adjust these to the printed design boundary, not the outer card edge.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["left", "right", "top", "bottom"] as const).map((key) => (
            <label key={key} className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key} margin {(capture.innerFrame[key] * 100).toFixed(1)}%</span>
              <input type="range" min="0.01" max="0.3" step="0.002" value={capture.innerFrame[key]} onChange={(event) => updateMargin(key, Number(event.target.value))} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function CenteringResultPanel({ result, saving, onSave }: { result: CenteringAnalysisResult; saving: boolean; onSave: () => void }) {
  return (
    <section className="pw-panel rounded-lg border border-amber-300/25 bg-amber-300/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-300" />
        <div>
          <h2 className="text-xl font-black text-white">Centering Estimate</h2>
          <p className="mt-1 text-sm text-slate-300">{recommendationLabel(result.recommendation)} · Confidence {result.overallConfidence}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SideResult result={result.front} label="Front" />
        <SideResult result={result.back} label="Back" />
      </div>
      <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm leading-6 text-slate-300">
        <p className="font-bold text-white">PSA comparison</p>
        <p>{result.psaComparison?.message}</p>
        <p className="mt-3 font-bold text-white">Beckett comparison</p>
        <p>{result.beckettComparison?.message}</p>
      </div>
      <p className="mt-3 flex gap-2 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-200" />
        {CENTERING_DISCLAIMER}
      </p>
      <button type="button" onClick={onSave} disabled={saving} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50 sm:w-fit">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save analysis"}
      </button>
    </section>
  );
}

function SideResult({ result, label }: { result: CenteringSideResult | null; label: string }) {
  if (!result) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
        <p className="font-bold text-white">{label}</p>
        <p className="mt-2 text-sm text-slate-500">Not analyzed.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <p className="font-bold text-white">{label}</p>
      <p className="mt-2 text-sm text-slate-300">Left / Right: <span className="font-black text-amber-100">{ratioText(result.horizontalRatio)}</span></p>
      <p className="text-sm text-slate-300">Top / Bottom: <span className="font-black text-amber-100">{ratioText(result.verticalRatio)}</span></p>
      <p className="mt-2 text-xs text-slate-500">Directional: L {result.directionalRatio.left.toFixed(1)}% / R {result.directionalRatio.right.toFixed(1)}% · T {result.directionalRatio.top.toFixed(1)}% / B {result.directionalRatio.bottom.toFixed(1)}%</p>
      <p className="mt-2 text-xs text-slate-500">Confidence: {result.confidence} · Method: {result.method}</p>
      {result.blockers.length ? <p className="mt-2 text-xs text-amber-100">Review: {result.blockers.join(", ")}</p> : null}
    </div>
  );
}

function analyzeCapture(capture: SideCapture) {
  return analyzeCenteringSide({
    side: capture.side,
    outerCorners: capture.corners,
    innerFramePercent: capture.innerFrame,
    imageSize: { width: capture.width, height: capture.height },
    userAdjusted: capture.userAdjusted,
    blockers: capture.blockers,
    method: capture.detectionMethod,
    detectionConfidence: capture.detectionConfidence,
    referenceImageUsed: capture.referenceImageUsed,
    referenceRegistrationScore: capture.referenceRegistrationScore
  });
}

function initialCorners(width: number, height: number): Quad {
  const insetX = width * 0.06;
  const insetY = height * 0.04;
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY }
  ];
}

function readFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageSize(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = dataUrl;
  });
}

async function prepareCenteringDataUrl(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const longest = Math.max(width, height);
  if (longest <= CENTERING_MAX_CAPTURE_DIMENSION) return { dataUrl, width, height };
  const scale = CENTERING_MAX_CAPTURE_DIMENSION / longest;
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) return { dataUrl, width, height };
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width: outputWidth,
    height: outputHeight
  };
}

function shouldUseOpenCvForCentering() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent.toLowerCase();
  const mobile = /iphone|ipad|ipod|android|mobile/.test(userAgent);
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowMemory = typeof deviceMemory === "number" && deviceMemory <= 4;
  return !mobile && !lowMemory;
}

function shouldAutoDetectOnCapture() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent.toLowerCase();
  return !/iphone|ipad|ipod|android|mobile/.test(userAgent);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = src;
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Detection took too long. Adjust corners manually.")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function tabClass(active: boolean) {
  return `inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-black ${active ? "bg-amber-300 text-slate-950" : "border border-white/10 text-slate-200"}`;
}

function recommendationLabel(value: CenteringAnalysisResult["recommendation"]) {
  switch (value) {
    case "excellent": return "Excellent centering";
    case "strong": return "Strong centering";
    case "acceptable": return "Acceptable centering";
    case "off_center": return "Noticeably off-center";
    default: return "Retake recommended";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
