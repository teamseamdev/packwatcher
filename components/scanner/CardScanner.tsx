"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, FileDown, Images, Loader2, Plus, ScanLine, Search, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type ScannerMode = "scanner" | "video";
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
const FALLBACK_PACK_OPTIONS = [
  "Pokemon 151",
  "Prismatic Evolutions",
  "Surging Sparks",
  "Journey Together",
  "Destined Rivals",
  "Twilight Masquerade",
  "Temporal Forces",
  "Paldean Fates",
  "Obsidian Flames",
  "Scarlet & Violet",
  "Crown Zenith",
  "Japanese Pokemon",
  "Chinese Pokemon",
  "Korean Pokemon"
];

export function CardScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const successFlashTimeoutRef = useRef<number | null>(null);
  const cardHideTimeoutRef = useRef<number | null>(null);
  const [mode, setMode] = useState<ScannerMode>("scanner");
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
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [successFlash, setSuccessFlash] = useState(false);
  const [packOptions, setPackOptions] = useState<string[]>(FALLBACK_PACK_OPTIONS);

  const totalValue = useMemo(() => cards.reduce((sum, card) => sum + card.estimatedValue, 0), [cards]);

  useEffect(() => {
    return () => {
      stopCamera();
      clearScannerTimers();
    };
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

  useEffect(() => {
    let ignore = false;

    async function loadPackOptions() {
      const supabase = createClient();
      const { data } = await supabase
        .from("catalog_products")
        .select("name,title,set_name,product_type")
        .eq("tcg", "pokemon")
        .order("tracking_count", { ascending: false })
        .limit(400);

      if (ignore || !data?.length) return;
      const names = new Set<string>();
      for (const product of data) {
        const name = cleanOption(product.title || product.name);
        if (name) names.add(name);
        const setName = cleanOption(product.set_name);
        if (setName) names.add(setName);
      }
      setPackOptions(Array.from(new Set([...Array.from(names), ...FALLBACK_PACK_OPTIONS])).slice(0, 500));
    }

    void loadPackOptions();
    return () => {
      ignore = true;
    };
  }, []);

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

  function clearScannerTimers() {
    if (successFlashTimeoutRef.current) window.clearTimeout(successFlashTimeoutRef.current);
    if (cardHideTimeoutRef.current) window.clearTimeout(cardHideTimeoutRef.current);
    successFlashTimeoutRef.current = null;
    cardHideTimeoutRef.current = null;
  }

  function showScannedCard(card: ScannerCard) {
    clearScannerTimers();
    setLastCard(card);
    setSuccessFlash(true);
    successFlashTimeoutRef.current = window.setTimeout(() => {
      setSuccessFlash(false);
      successFlashTimeoutRef.current = null;
    }, 450);
    cardHideTimeoutRef.current = window.setTimeout(() => {
      setLastCard(null);
      cardHideTimeoutRef.current = null;
    }, 5000);
  }

  async function scanCameraFrame() {
    if (!videoRef.current) return;
    setIsScanning(true);
    setScanPhase("capturing");
    setError(null);
    setNotice("Checking card...");

    try {
      const frames = await captureCameraBurst(videoRef.current);
      const scanFailures: string[] = [];
      let scanned: Omit<ScannerCard, "id" | "order" | "imageDataUrl"> | null = null;
      let scannedImage = frames[0];

      const focusedFrames = await buildRecognitionFrames(frames);
      const contactSheet = await buildContactSheet(focusedFrames);
      if (contactSheet) {
        setScanPhase("recognizing");
        setNotice("Checking card...");
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
        setNotice("Checking card...");
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
      showScannedCard(card);
      setNotice(null);
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
    setError(null);
    setNotice("Scanning video frames in your browser. The raw video is not uploaded.");
    setIsScanning(true);
    setScanPhase("capturing");

    try {
      const frames = await extractVideoFrames(file);
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
    setCards((current) => {
      const storedCard = {
        ...next,
        order: current.length + 1,
      };
      return [...current, storedCard];
    });
    return next;
  }

  function updateCard(id: string, changes: Partial<ScannerCard>) {
    setCards((current) => current.map((card) => card.id === id ? { ...card, ...changes } : card));
  }

  function removeCard(id: string) {
    setCards((current) => reorderCards(current.filter((card) => card.id !== id)));
    if (lastCard?.id === id) setLastCard(null);
  }

  async function lookupCard(card: ScannerCard) {
    if (!card.cardName.trim()) {
      setError("Enter a card name before looking up value.");
      return;
    }

    setIsScanning(true);
    setScanPhase("pricing");
    setError(null);
    const scanned = await scanManualCard(card.cardName, card.setName ?? "");
    setIsScanning(false);
    setScanPhase("idle");
    if (!scanned) return;

    updateCard(card.id, {
      cardName: scanned.cardName,
      originalName: scanned.originalName,
      language: scanned.language,
      setName: scanned.setName,
      cardNumber: scanned.cardNumber,
      variant: scanned.variant,
      estimatedValue: scanned.estimatedValue,
      confidence: scanned.confidence,
      recognitionSource: scanned.recognitionSource,
      pricingSource: scanned.pricingSource
    });
  }

  function resetSession(nextMode: ScannerMode) {
    stopCamera();
    setMode(nextMode);
    setCards([]);
    setLastCard(null);
    setIsComplete(false);
    setError(null);
    setNotice(null);
    setScanPhase("idle");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            list="packwatcher-pack-options"
            value={packHint}
            onChange={(event) => setPackHint(event.target.value)}
            placeholder="Choose pack, box, or set"
            className="h-12 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300"
          />
          <datalist id="packwatcher-pack-options">
            {packOptions.map((option) => <option key={option} value={option} />)}
          </datalist>
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
        <div className="mt-3">
          <p className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            Helps match card names, numbers, and set context.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                if (isCameraReady) {
                  setIsComplete(true);
                  stopCamera();
                  setScanPhase("idle");
                } else {
                  void startCamera("scanner");
                }
              }}
              disabled={isScanning}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50 sm:flex-none"
            >
              <ScanLine className="h-4 w-4" />
              {isCameraReady ? "Stop scanning" : "Start scanner"}
            </button>
            <label className="inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-4 text-sm font-semibold text-slate-200 sm:flex-none">
              <UploadCloud className="h-4 w-4" />
              Upload video
              <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void scanUploadedVideo(selected);
                event.currentTarget.value = "";
              }} />
            </label>
          </div>

          {notice ? <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{notice}</p> : null}
          {error ? <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
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
            <div key={card.id} className="grid gap-3 rounded-lg bg-slate-950/50 p-3 sm:grid-cols-[64px_1fr]">
              {card.imageDataUrl ? (
                <div
                  aria-hidden="true"
                  className="h-20 w-16 rounded-md bg-cover bg-center"
                  style={{ backgroundImage: `url(${card.imageDataUrl})` }}
                />
              ) : <div className="grid h-20 w-16 place-items-center rounded-md bg-white/5 text-xs text-slate-500">Manual</div>}
              <div className="min-w-0">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_120px]">
                  <input
                    value={card.cardName}
                    onChange={(event) => updateCard(card.id, { cardName: event.target.value })}
                    className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300"
                    aria-label={`Card ${card.order} name`}
                  />
                  <input
                    value={card.setName ?? ""}
                    onChange={(event) => updateCard(card.id, { setName: event.target.value || null })}
                    placeholder="Set"
                    className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300"
                    aria-label={`Card ${card.order} set`}
                  />
                  <input
                    value={String(card.estimatedValue || 0)}
                    type="number"
                    min="0"
                    step="0.01"
                    onChange={(event) => updateCard(card.id, { estimatedValue: Number(event.target.value) || 0 })}
                    className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm font-bold text-amber-200 outline-none focus:border-amber-300"
                    aria-label={`Card ${card.order} value`}
                  />
                </div>
                {card.originalName ? <p className="mt-1 text-sm text-slate-300">Printed name: {card.originalName}</p> : null}
                <p className="mt-1 text-sm text-slate-400">{[card.setName, card.cardNumber, card.variant, languageLabel(card.language)].filter(Boolean).join(" - ") || "No set details"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => void lookupCard(card)} disabled={isScanning} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200 disabled:opacity-50">
                    <Search className="h-3.5 w-3.5" />
                    Lookup value
                  </button>
                  <button onClick={() => removeCard(card.id)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300/30 px-3 text-xs font-semibold text-rose-100">
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
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
          videoRef={videoRef}
          cards={cards}
          isScanning={isScanning}
          successFlash={successFlash}
          lastCard={lastCard}
          totalCards={cards.length}
          totalValue={totalValue}
          error={error}
          notice={notice}
          onScan={() => void scanCameraFrame()}
          onUpload={(file) => {
            stopCamera();
            void scanUploadedVideo(file);
          }}
          onClose={() => {
            setIsComplete(true);
            stopCamera();
            setScanPhase("idle");
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
  videoRef,
  cards,
  isScanning,
  successFlash,
  lastCard,
  totalCards,
  totalValue,
  error,
  notice,
  onScan,
  onUpload,
  onClose,
  onEnd
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cards: ScannerCard[];
  isScanning: boolean;
  successFlash: boolean;
  lastCard: ScannerCard | null;
  totalCards: number;
  totalValue: number;
  error: string | null;
  notice: string | null;
  onScan: () => void;
  onUpload: (file: File) => void;
  onClose: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black text-white">
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/95" />
      {successFlash ? <div className="pointer-events-none absolute inset-0 bg-emerald-400/35" /> : null}

      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        <button onClick={onClose} className="grid h-12 w-12 place-items-center rounded-full bg-white text-slate-950 shadow-lg">
          <X className="h-6 w-6" />
        </button>
        <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-1 text-sm font-bold shadow-lg backdrop-blur">
          <span className="rounded-xl bg-white/20 px-4 py-2">Recognition</span>
          <span className="px-4 py-2 text-white/80">AI Mode</span>
        </div>
        <button className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur">
          <Sparkles className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+86px)] flex justify-center gap-3 px-4 text-xs font-bold">
        <div className="rounded-full bg-black/45 px-4 py-2 text-white/80 backdrop-blur">Auto Capture</div>
        <div className="rounded-full bg-emerald-400/18 px-4 py-2 text-emerald-300 backdrop-blur">Auto Cropping</div>
      </div>

      <div className="pointer-events-none absolute inset-x-8 top-[26vh] mx-auto max-w-[340px]">
        <div className="relative aspect-[63/88] rounded-[10px] border-[5px] border-emerald-400 shadow-[0_0_30px_rgba(74,222,128,0.5)]">
          <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" />
          <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" />
          <div className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" />
          <div className="absolute -bottom-3 -right-3 h-6 w-6 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" />
          <div className="absolute left-1/2 top-7 -translate-x-1/2 rounded-full bg-emerald-400/65 px-5 py-3 text-sm font-black shadow-lg backdrop-blur">
            {isScanning ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking</span> : <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Ready to capture</span>}
          </div>
          {isScanning ? <div className="absolute inset-x-3 top-1/2 h-1 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(74,222,128,0.9)]" /> : null}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/88 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-24">
        {lastCard ? (
          <div className="mx-auto mb-3 max-w-sm rounded-full bg-emerald-400/25 px-4 py-2 text-center text-sm font-black text-emerald-100 backdrop-blur">
            {lastCard.cardName} - {currency(lastCard.estimatedValue)}
          </div>
        ) : null}
        {error ? <p className="mb-3 rounded-xl border border-rose-300/30 bg-rose-500/20 p-3 text-sm text-rose-100">{error}</p> : null}
        {!error && notice ? <p className="mb-3 rounded-xl border border-white/10 bg-black/35 p-3 text-center text-sm text-white/85 backdrop-blur">{notice}</p> : null}

        <div className="mb-3 flex items-center justify-between text-base font-bold">
          <div>{totalCards} card{totalCards === 1 ? "" : "s"} scanned</div>
          <div className="text-white/80">Total <span className="text-emerald-300">{currency(totalValue)}</span></div>
        </div>

        {cards.length ? (
          <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
            {cards.slice(-8).map((card) => (
              <div key={card.id} className="flex min-w-[228px] items-center gap-3 rounded-2xl bg-white/12 p-3 shadow-lg backdrop-blur">
                {card.imageDataUrl ? (
                  <div className="h-20 w-14 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${card.imageDataUrl})` }} />
                ) : <div className="grid h-20 w-14 shrink-0 place-items-center rounded-lg bg-white/10 text-[10px] text-white/50">Manual</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{card.cardName}</p>
                  <p className="truncate text-xs text-white/60">{[card.cardNumber, card.setName].filter(Boolean).join(" - ") || "No set details"}</p>
                  <p className="mt-1 text-base font-black text-emerald-300">{currency(card.estimatedValue)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_96px_1fr] items-end gap-4">
          <label className="grid cursor-pointer justify-items-center gap-1 text-xs font-semibold text-white/85">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-black/40 backdrop-blur"><Images className="h-7 w-7" /></span>
            Gallery
            <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) onUpload(selected);
              event.currentTarget.value = "";
            }} />
          </label>
          <button onClick={onScan} disabled={isScanning} className="grid h-24 w-24 place-items-center rounded-full border-[5px] border-emerald-400 bg-emerald-400 text-slate-950 shadow-[0_0_24px_rgba(74,222,128,0.7)] disabled:opacity-70">
            {isScanning ? <Loader2 className="h-10 w-10 animate-spin" /> : <Check className="h-12 w-12 stroke-[3]" />}
          </button>
          <button onClick={onEnd} className="grid justify-items-center gap-1 text-xs font-semibold text-white/85">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-slate-950"><Check className="h-8 w-8 stroke-[3]" /></span>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function reorderCards(cards: ScannerCard[]) {
  return cards.map((card, index) => ({ ...card, order: index + 1 }));
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

function cleanOption(value: string | null | undefined) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length < 2) return null;
  return text;
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
