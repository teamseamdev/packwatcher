"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, FileDown, Loader2, Plus, ScanLine, UploadCloud, Video, X } from "lucide-react";

type ScannerMode = "single" | "multi-camera" | "video";
type ScannerLanguage = "auto" | "english" | "japanese" | "chinese_simplified" | "chinese_traditional" | "korean";
type ScanPhase = "idle" | "capturing" | "recognizing" | "pricing";
type ScannerCard = {
  id: string;
  order: number;
  cardName: string;
  originalName: string | null;
  language: string | null;
  setName: string | null;
  cardNumber: string | null;
  variant: string | null;
  estimatedValue: number;
  confidence: number;
  recognitionSource: string;
  pricingSource: string;
  imageDataUrl?: string | null;
};

type ScanResponse = {
  ok: boolean;
  card?: Omit<ScannerCard, "id" | "order" | "imageDataUrl">;
  error?: string;
  messages?: string[];
};

const MAX_VIDEO_SCAN_FRAMES = 96;
const MIN_VIDEO_SCAN_FRAMES = 18;
const CONTACT_SHEET_FRAME_COUNT = 24;
const PREVIEW_FRAME_COUNT = 12;

export function CardScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<ScannerMode>("single");
  const [cards, setCards] = useState<ScannerCard[]>([]);
  const [lastCard, setLastCard] = useState<ScannerCard | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualSet, setManualSet] = useState("");
  const [packHint, setPackHint] = useState("");
  const [language, setLanguage] = useState<ScannerLanguage>("auto");
  const [sampledFrames, setSampledFrames] = useState<string[]>([]);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");

  const totalValue = useMemo(() => cards.reduce((sum, card) => sum + card.estimatedValue, 0), [cards]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraReady, mode]);

  useEffect(() => {
    if (!isCameraReady || mode === "video") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCameraReady, mode]);

  async function startCamera(nextMode = mode) {
    setError(null);
    setNotice(null);
    setMode(nextMode);
    setIsComplete(false);

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraReady(true);
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : "Could not start camera.");
      setIsCameraReady(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraReady(false);
  }

  async function scanCameraFrame() {
    if (!videoRef.current) return;
    setIsScanning(true);
    setScanPhase("capturing");
    setError(null);
    setNotice("Capturing a short scan burst...");
    setSampledFrames([]);

    try {
      const frames = await captureCameraBurst(videoRef.current);
      setSampledFrames(frames);
      const scanFailures: string[] = [];
      let scanned: Omit<ScannerCard, "id" | "order" | "imageDataUrl"> | null = null;
      let scannedImage = frames[0];

      const focusedFrames = await buildRecognitionFrames(frames);
      const contactSheet = await buildContactSheet(focusedFrames);
      if (contactSheet) {
        setScanPhase("recognizing");
        setNotice("Scanning camera burst...");
        scanned = await scanImageDataUrl(contactSheet, {
          silentMiss: true,
          onMiss: (message) => {
            if (message && !scanFailures.includes(message)) scanFailures.push(message);
          }
        });
        if (scanned) scannedImage = contactSheet;
      }

      for (let index = 0; !scanned && index < focusedFrames.length; index += 1) {
        setScanPhase(index < frames.length ? "recognizing" : "pricing");
        setNotice(`Scanning camera frame ${index + 1} of ${focusedFrames.length}...`);
        scanned = await scanImageDataUrl(focusedFrames[index], {
          silentMiss: true,
          tryCrops: true,
          onMiss: (message) => {
            if (message && !scanFailures.includes(message)) scanFailures.push(message);
          }
        });
        if (scanned) scannedImage = focusedFrames[index];
      }

      if (!scanned) {
        setError(scanFailures[0] ?? "No readable Pokemon card was detected. Hold the card flat in the frame, tap to focus if needed, then scan again.");
        setNotice(null);
        return;
      }

      const card = addCard(scanned, scannedImage);
      setLastCard(card);
      setNotice(null);
      if (mode === "single") {
        setIsComplete(true);
      }
    } finally {
      setScanPhase("idle");
      setIsScanning(false);
    }
  }

  async function scanUploadedVideo(file: File) {
    setMode("video");
    setIsComplete(false);
    setCards([]);
    setLastCard(null);
    setSampledFrames([]);
    setError(null);
    setNotice("Scanning video frames in your browser. The raw video is not uploaded.");
    setIsScanning(true);
    setScanPhase("capturing");

    try {
      const frames = await extractVideoFrames(file);
      setSampledFrames(selectPreviewFrames(frames));
      const seen = new Set<string>();
      const scanFailures: string[] = [];
      const contactSheets = await buildContactSheets(frames, CONTACT_SHEET_FRAME_COUNT);

      for (let sheetIndex = 0; sheetIndex < contactSheets.length; sheetIndex += 1) {
        const contactSheet = contactSheets[sheetIndex];
        setScanPhase("recognizing");
        setNotice(`Scanning contact sheet ${sheetIndex + 1} of ${contactSheets.length}...`);
        const contactSheetScan = await scanImageDataUrl(contactSheet, {
          silentMiss: true,
          onMiss: (message) => {
            if (message && !scanFailures.includes(message)) scanFailures.push(message);
          }
        });
        if (!contactSheetScan) continue;

        const key = normalizeCardKey(contactSheetScan.cardName, contactSheetScan.setName);
        if (seen.has(key)) continue;
        seen.add(key);
        addCard(contactSheetScan, contactSheet);
      }

      for (let index = 0; index < frames.length; index += 1) {
        setScanPhase("recognizing");
        setNotice(`Scanning frame ${index + 1} of ${frames.length}...`);
        const scanned = await scanImageDataUrl(frames[index], {
          silentMiss: true,
          tryCrops: true,
          onMiss: (message) => {
            if (message && !scanFailures.includes(message)) scanFailures.push(message);
          }
        });
        if (!scanned) continue;

        const key = normalizeCardKey(scanned.cardName, scanned.setName);
        if (seen.has(key)) continue;
        seen.add(key);
        addCard(scanned, frames[index]);
      }

      setIsComplete(true);
      setNotice(null);
      if (!seen.size) {
        const backendReason = scanFailures[0];
        setError(
          backendReason
            ? `No cards were detected. Scanner backend response: ${backendReason}`
            : `No cards were detected after sampling ${frames.length} frames across the full video. Check the frame preview below to confirm the cards are visible.`
        );
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Video scan failed.");
    } finally {
      setScanPhase("idle");
      setIsScanning(false);
    }
  }

  async function addManualCard() {
    if (!manualName.trim()) {
      setError("Enter a card name.");
      return;
    }

    setIsScanning(true);
    setScanPhase("pricing");
    setError(null);
    const scanned = await scanManualCard(manualName, manualSet);
    setIsScanning(false);
    setScanPhase("idle");
    if (!scanned) return;

    const card = addCard(scanned, null);
    setLastCard(card);
    setManualName("");
    setManualSet("");
  }

  async function scanImageDataUrl(
    imageDataUrl: string,
    options: { silentMiss?: boolean; tryCrops?: boolean; onMiss?: (message: string) => void } = {}
  ) {
    const variants = options.tryCrops ? await imageScanVariants(imageDataUrl) : [imageDataUrl];

    for (const variant of variants) {
      const response = await fetch("/api/scanner/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...dataUrlToPayload(variant), language, packHint: packHint.trim() || undefined })
      });
      const scanned = await handleScanResponse(response, options);
      if (scanned) return scanned;
    }

    return null;
  }

  async function scanManualCard(cardName: string, setName: string) {
    const response = await fetch("/api/scanner/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardName, setName: setName || undefined, language, packHint: packHint.trim() || undefined })
    });
    return handleScanResponse(response);
  }

  async function handleScanResponse(
    response: Response,
    options: { silentMiss?: boolean; onMiss?: (message: string) => void } = {}
  ) {
    const body = await response.json().catch(() => null) as ScanResponse | null;
    if (!response.ok || !body?.card) {
      const message = body?.error ?? `Scan failed with status ${response.status}.`;
      options.onMiss?.(message);
      if (!options.silentMiss) {
        setError(message);
      }
      return null;
    }

    if (body.messages?.length) setNotice(body.messages.join(" "));
    return body.card;
  }

  function addCard(card: Omit<ScannerCard, "id" | "order" | "imageDataUrl">, imageDataUrl?: string | null) {
    const next: ScannerCard = {
      ...card,
      id: crypto.randomUUID(),
      order: cards.length + 1,
      imageDataUrl
    };
    setCards((current) => [...current, next]);
    return next;
  }

  function resetSession(nextMode: ScannerMode) {
    stopCamera();
    setMode(nextMode);
    setCards([]);
    setLastCard(null);
    setSampledFrames([]);
    setIsComplete(false);
    setError(null);
    setNotice(null);
    setScanPhase("idle");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_220px]">
          <ModeButton active={mode === "single"} icon={ScanLine} label="Single scan" onClick={() => { resetSession("single"); void startCamera("single"); }} />
          <ModeButton active={mode === "multi-camera"} icon={Camera} label="Multi scan" onClick={() => { resetSession("multi-camera"); void startCamera("multi-camera"); }} />
          <label className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold ${mode === "video" ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 bg-slate-950/50 text-slate-200"}`}>
            <Video className="h-4 w-4" />
            Upload video
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              className="sr-only"
              disabled={isScanning}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void scanUploadedVideo(selected);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as ScannerLanguage)}
            className="h-12 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-200 outline-none focus:border-amber-300"
          >
            <option value="auto">Auto language</option>
            <option value="english">English</option>
            <option value="japanese">Japanese</option>
            <option value="chinese_simplified">Chinese simplified</option>
            <option value="chinese_traditional">Chinese traditional</option>
            <option value="korean">Korean</option>
          </select>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            value={packHint}
            onChange={(event) => setPackHint(event.target.value)}
            placeholder="Optional pack/set hint, e.g. Prismatic Evolutions, 151, Terastal Festival"
            className="h-12 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300"
          />
          <p className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            Helps match top name and bottom card number.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="relative overflow-hidden rounded-lg bg-slate-950">
            {isCameraReady && mode !== "video" ? (
              <div className="grid aspect-[3/4] w-full place-items-center p-6 text-center text-sm text-slate-400 sm:aspect-video">
                Camera is open full screen.
              </div>
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
            )}
            {!isCameraReady && mode !== "video" ? (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-400">
                Start single or multi scan to use your camera.
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {mode !== "video" ? (
              <>
                <button onClick={() => void startCamera(mode)} disabled={isScanning} className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
                  <Camera className="h-4 w-4" />
                  Start camera
                </button>
                <button onClick={() => void scanCameraFrame()} disabled={!isCameraReady || isScanning} className="inline-flex h-11 items-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">
                  {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                  Scan card
                </button>
              </>
            ) : (
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-bold text-slate-950">
                <UploadCloud className="h-4 w-4" />
                Choose video
                <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void scanUploadedVideo(selected);
                  event.currentTarget.value = "";
                }} />
              </label>
            )}

            {mode === "multi-camera" && cards.length ? (
              <>
                <button onClick={() => setLastCard(null)} className="h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">Next scan</button>
                <button onClick={() => { setIsComplete(true); stopCamera(); setScanPhase("idle"); }} className="h-11 rounded-lg border border-amber-300/40 px-4 text-sm font-semibold text-amber-100">End scan</button>
              </>
            ) : null}
          </div>

          {lastCard ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />
              <div>
                <p className="font-bold text-white">{lastCard.cardName}</p>
                <p className="text-sm text-emerald-100">{currency(lastCard.estimatedValue)} estimated value</p>
              </div>
            </div>
          ) : null}

          {notice ? <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{notice}</p> : null}
          {error ? <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
          {sampledFrames.length ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sampled frames sent to scanner</p>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {sampledFrames.map((frame, index) => (
                  <div
                    key={`${frame.slice(0, 48)}-${index}`}
                    className="h-24 w-16 shrink-0 rounded-md border border-white/10 bg-cover bg-center"
                    style={{ backgroundImage: `url(${frame})` }}
                    title={`Frame ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <h2 className="font-bold text-white">Manual add</h2>
          <p className="mt-1 text-sm text-slate-400">Use this if the camera cannot read the card yet.</p>
          <div className="mt-4 grid gap-2">
            <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Card name" className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <input value={manualSet} onChange={(event) => setManualSet(event.target.value)} placeholder="Optional set name" className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <button onClick={() => void addManualCard()} disabled={isScanning} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
              <Plus className="h-4 w-4" />
              Add card
            </button>
          </div>
        </aside>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Scan results</h2>
            <p className="mt-1 text-sm text-slate-400">{cards.length} card{cards.length === 1 ? "" : "s"} scanned - Total value {currency(totalValue)}</p>
          </div>
          <button onClick={() => exportResultsPdf(cards, totalValue)} disabled={!cards.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">
            <FileDown className="h-4 w-4" />
            Export PDF
          </button>
        </div>

        <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {cards.length ? cards.map((card) => (
            <div key={card.id} className="grid gap-3 rounded-lg bg-slate-950/50 p-3 sm:grid-cols-[64px_1fr_auto] sm:items-center">
              {card.imageDataUrl ? (
                <div
                  aria-hidden="true"
                  className="h-20 w-16 rounded-md bg-cover bg-center"
                  style={{ backgroundImage: `url(${card.imageDataUrl})` }}
                />
              ) : <div className="grid h-20 w-16 place-items-center rounded-md bg-white/5 text-xs text-slate-500">Manual</div>}
              <div>
                <p className="font-bold text-white">{card.order}. {card.cardName}</p>
                {card.originalName ? <p className="mt-1 text-sm text-slate-300">Printed name: {card.originalName}</p> : null}
                <p className="mt-1 text-sm text-slate-400">{[card.setName, card.cardNumber, card.variant, languageLabel(card.language)].filter(Boolean).join(" - ") || "No set details"}</p>
                <p className="mt-1 text-xs text-slate-500">Recognition: {card.recognitionSource} - Pricing: {card.pricingSource}</p>
              </div>
              <p className="text-lg font-black text-amber-200">{currency(card.estimatedValue)}</p>
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
              Scan a card or upload a video to build a value list.
            </div>
          )}
        </div>

        {isComplete && cards.length ? <p className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">Scan complete. Review the ordered list, add missing cards manually, or export the PDF.</p> : null}
      </section>
      {isCameraReady && mode !== "video" ? (
        <FullScreenScanner
          mode={mode}
          videoRef={videoRef}
          isScanning={isScanning}
          scanPhase={scanPhase}
          lastCard={lastCard}
          totalCards={cards.length}
          totalValue={totalValue}
          error={error}
          notice={notice}
          onScan={() => void scanCameraFrame()}
          onClose={() => {
            stopCamera();
            setScanPhase("idle");
          }}
          onNext={() => {
            setLastCard(null);
            setError(null);
            setNotice(null);
          }}
          onEnd={() => {
            setIsComplete(true);
            stopCamera();
            setScanPhase("idle");
          }}
        />
      ) : null}
    </div>
  );
}

function FullScreenScanner({
  mode,
  videoRef,
  isScanning,
  scanPhase,
  lastCard,
  totalCards,
  totalValue,
  error,
  notice,
  onScan,
  onClose,
  onNext,
  onEnd
}: {
  mode: ScannerMode;
  videoRef: RefObject<HTMLVideoElement | null>;
  isScanning: boolean;
  scanPhase: ScanPhase;
  lastCard: ScannerCard | null;
  totalCards: number;
  totalValue: number;
  error: string | null;
  notice: string | null;
  onScan: () => void;
  onClose: () => void;
  onNext: () => void;
  onEnd: () => void;
}) {
  const phaseText = scanPhase === "capturing"
    ? "Capturing"
    : scanPhase === "recognizing"
      ? "Reading card"
      : scanPhase === "pricing"
        ? "Checking value"
        : "Ready";

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white">
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_42%,rgba(0,0,0,0.72)_72%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-[16vh] mx-auto max-w-[340px]">
        <div className="relative aspect-[63/88] rounded-2xl border-2 border-amber-300/90 shadow-[0_0_0_999px_rgba(0,0,0,0.22)]">
          <div className="absolute left-4 right-4 top-5 rounded border border-amber-200/70 bg-black/30 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-amber-100">
            Card name area
          </div>
          <div className="absolute bottom-5 left-4 w-24 rounded border border-amber-200/70 bg-black/30 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-amber-100">
            Card #
          </div>
          {isScanning ? <div className="absolute inset-x-2 top-6 h-1 animate-pulse rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.9)]" /> : null}
        </div>
      </div>

      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="rounded-full bg-black/55 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-100">
          {mode === "multi-camera" ? "Multi scan" : "Single scan"} - {phaseText}
        </div>
        <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black via-black/88 to-transparent p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {lastCard ? (
          <div className="rounded-2xl border border-emerald-300/40 bg-emerald-400/15 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-300" />
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{lastCard.cardName}</p>
                <p className="text-sm text-emerald-100">{currency(lastCard.estimatedValue)} estimated value</p>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <p className="rounded-xl border border-rose-300/30 bg-rose-500/20 p-3 text-sm text-rose-100">{error}</p> : null}
        {!error && notice ? <p className="rounded-xl border border-amber-300/30 bg-amber-300/15 p-3 text-sm text-amber-100">{notice}</p> : null}

        <div className="grid grid-cols-2 gap-3 text-center text-sm">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-slate-300">Cards</p>
            <p className="text-xl font-black">{totalCards}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-slate-300">Total</p>
            <p className="text-xl font-black text-amber-200">{currency(totalValue)}</p>
          </div>
        </div>

        <div className="flex gap-3">
          {mode === "multi-camera" && lastCard ? (
            <button onClick={onNext} className="h-14 flex-1 rounded-2xl border border-white/15 bg-white/10 text-base font-bold text-white">
              Next
            </button>
          ) : null}
          <button onClick={onScan} disabled={isScanning} className="h-14 flex-[2] rounded-2xl bg-amber-300 text-base font-black text-slate-950 disabled:opacity-60">
            {isScanning ? <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Scanning</span> : "Scan"}
          </button>
          {mode === "multi-camera" && totalCards ? (
            <button onClick={onEnd} className="h-14 flex-1 rounded-2xl border border-amber-300/50 bg-black/40 text-base font-bold text-amber-100">
              Done
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof ScanLine; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold ${active ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 bg-slate-950/50 text-slate-200"}`}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function captureVideoFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 960;
  canvas.height = video.videoHeight || 1280;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not capture camera frame.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function captureCameraBurst(video: HTMLVideoElement) {
  const frames: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    frames.push(captureVideoFrame(video));
    if (index < 2) await delay(260);
  }
  return frames;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function dataUrlToPayload(dataUrl: string) {
  const [header, imageBase64] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*);base64/)?.[1] ?? "image/jpeg";
  return { imageBase64, mimeType };
}

async function imageScanVariants(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const variants = [dataUrl];
  const crops = [
    centerCrop(image.width, image.height, 0.72, 0.88),
    centerCrop(image.width, image.height, 0.48, 0.92),
    centerCrop(image.width, image.height, 0.9, 0.58)
  ];

  for (const crop of crops) {
    variants.push(cropImage(image, crop.x, crop.y, crop.width, crop.height));
  }

  return variants;
}

async function buildRecognitionFrames(frames: string[]) {
  const variants: string[] = [];
  for (const frame of frames) {
    variants.push(frame);
    const image = await loadImage(frame);
    const guidedCardCrop = centerCrop(image.width, image.height, 0.76, 0.82, -0.02);
    const guidedCard = cropImage(image, guidedCardCrop.x, guidedCardCrop.y, guidedCardCrop.width, guidedCardCrop.height);
    variants.push(guidedCard);

    const cardImage = await loadImage(guidedCard);
    const titleCrop = regionCrop(cardImage.width, cardImage.height, 0.08, 0.03, 0.84, 0.2);
    const numberCrop = regionCrop(cardImage.width, cardImage.height, 0.02, 0.74, 0.62, 0.22);
    const artTextCrop = regionCrop(cardImage.width, cardImage.height, 0.08, 0.12, 0.84, 0.62);
    variants.push(cropImage(cardImage, titleCrop.x, titleCrop.y, titleCrop.width, titleCrop.height));
    variants.push(cropImage(cardImage, numberCrop.x, numberCrop.y, numberCrop.width, numberCrop.height));
    variants.push(cropImage(cardImage, artTextCrop.x, artTextCrop.y, artTextCrop.width, artTextCrop.height));
  }
  return variants;
}

function centerCrop(width: number, height: number, widthRatio: number, heightRatio: number, yOffsetRatio = 0) {
  const cropWidth = Math.max(1, Math.round(width * widthRatio));
  const cropHeight = Math.max(1, Math.round(height * heightRatio));
  return {
    x: Math.max(0, Math.round((width - cropWidth) / 2)),
    y: Math.max(0, Math.min(height - cropHeight, Math.round((height - cropHeight) / 2 + height * yOffsetRatio))),
    width: cropWidth,
    height: cropHeight
  };
}

function regionCrop(width: number, height: number, xRatio: number, yRatio: number, widthRatio: number, heightRatio: number) {
  const cropWidth = Math.max(1, Math.round(width * widthRatio));
  const cropHeight = Math.max(1, Math.round(height * heightRatio));
  return {
    x: Math.max(0, Math.min(width - cropWidth, Math.round(width * xRatio))),
    y: Math.max(0, Math.min(height - cropHeight, Math.round(height * yRatio))),
    width: cropWidth,
    height: cropHeight
  };
}

function cropImage(image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(1280, width);
  canvas.height = Math.round((height / width) * canvas.width);
  const context = canvas.getContext("2d");
  if (!context) return image.src;
  context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not prepare frame crop."));
    image.src = dataUrl;
  });
}

async function buildContactSheet(frames: string[]) {
  if (!frames.length) return null;
  const images = await Promise.all(frames.map((frame) => loadImage(frame)));
  const columns = 4;
  const cellWidth = 320;
  const cellHeight = 420;
  const rows = Math.ceil(images.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = columns * cellWidth;
  canvas.height = rows * cellHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#020617";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8fafc";
  context.font = "24px Arial";

  images.forEach((image, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = row * cellHeight;
    const scale = Math.max(cellWidth / image.width, (cellHeight - 34) / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = x + (cellWidth - drawWidth) / 2;
    const drawY = y + 34 + ((cellHeight - 34) - drawHeight) / 2;
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.fillText(String(index + 1), x + 10, y + 26);
  });

  return canvas.toDataURL("image/jpeg", 0.82);
}

async function buildContactSheets(frames: string[], frameCount: number) {
  const sheets: string[] = [];
  for (let index = 0; index < frames.length; index += frameCount) {
    const sheet = await buildContactSheet(frames.slice(index, index + frameCount));
    if (sheet) sheets.push(sheet);
  }
  return sheets;
}

async function extractVideoFrames(file: File) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = URL.createObjectURL(file);

  try {
    await once(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error("Could not read video duration.");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not scan video frames.");

    const frameCount = Math.min(
      MAX_VIDEO_SCAN_FRAMES,
      Math.max(MIN_VIDEO_SCAN_FRAMES, Math.ceil(duration / 1.25))
    );
    const step = duration / frameCount;
    const frames: string[] = [];

    for (let index = 0; index < frameCount; index += 1) {
      video.currentTime = Math.min(Math.max(0, duration - 0.1), index * step + step / 2);
      await once(video, "seeked");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.78));
    }

    return frames;
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

function selectPreviewFrames(frames: string[]) {
  if (frames.length <= PREVIEW_FRAME_COUNT) return frames;
  return Array.from({ length: PREVIEW_FRAME_COUNT }, (_, index) => {
    const frameIndex = Math.round((index * (frames.length - 1)) / (PREVIEW_FRAME_COUNT - 1));
    return frames[frameIndex];
  });
}

function once(target: EventTarget, eventName: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      target.removeEventListener(eventName, onEvent);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    target.addEventListener(eventName, onEvent, { once: true });
  });
}

function normalizeCardKey(cardName: string, setName: string | null) {
  return `${cardName} ${setName ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function languageLabel(language: string | null) {
  if (!language || language === "auto") return null;
  return language.replace(/_/g, " ");
}

function exportResultsPdf(cards: ScannerCard[], totalValue: number) {
  const lines = [
    "PackWatcher Scanner Results",
    `Generated: ${new Date().toLocaleString()}`,
    `Cards scanned: ${cards.length}`,
    `Total estimated value: ${currency(totalValue)}`,
    "",
    ...cards.flatMap((card) => [
      `${card.order}. ${card.cardName} - ${currency(card.estimatedValue)}`,
      card.originalName ? `   Printed name: ${card.originalName}` : "",
      `   ${[card.setName, card.cardNumber, card.variant, languageLabel(card.language)].filter(Boolean).join(" | ") || "No set details"}`,
      `   Pricing: ${card.pricingSource}`,
      ""
    ])
  ];

  const pdf = buildSimplePdf(lines);
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `packwatcher-scan-${Date.now()}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildSimplePdf(lines: string[]) {
  const escapedLines = lines.map((line) => line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"));
  const content = [
    "BT",
    "/F1 14 Tf",
    "50 760 Td",
    ...escapedLines.map((line, index) => `${index === 0 ? "" : "0 -20 Td"}(${line}) Tj`),
    "ET"
  ].join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}
