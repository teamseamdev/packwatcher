"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, FileDown, Loader2, Plus, ScanLine, UploadCloud, Video } from "lucide-react";

type ScannerMode = "single" | "multi-camera" | "video";
type ScannerLanguage = "auto" | "english" | "japanese" | "chinese_simplified" | "chinese_traditional" | "korean";
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
  const [language, setLanguage] = useState<ScannerLanguage>("auto");
  const [sampledFrames, setSampledFrames] = useState<string[]>([]);

  const totalValue = useMemo(() => cards.reduce((sum, card) => sum + card.estimatedValue, 0), [cards]);

  useEffect(() => {
    return () => stopCamera();
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

  async function scanCameraFrame() {
    if (!videoRef.current) return;
    setIsScanning(true);
    setError(null);
    setNotice(null);

    const imageDataUrl = captureVideoFrame(videoRef.current);
    const scanned = await scanImageDataUrl(imageDataUrl, { tryCrops: true });
    setIsScanning(false);

    if (!scanned) return;
    const card = addCard(scanned, imageDataUrl);
    setLastCard(card);
    if (mode === "single") {
      setIsComplete(true);
      stopCamera();
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

    try {
      const frames = await extractVideoFrames(file);
      setSampledFrames(frames.slice(0, 10));
      const seen = new Set<string>();
      const scanFailures: string[] = [];

      for (let index = 0; index < frames.length; index += 1) {
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
            : "No cards were detected in the sampled frames. Check the frame preview below to confirm the cards are visible."
        );
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Video scan failed.");
    } finally {
      setIsScanning(false);
    }
  }

  async function addManualCard() {
    if (!manualName.trim()) {
      setError("Enter a card name.");
      return;
    }

    setIsScanning(true);
    setError(null);
    const scanned = await scanManualCard(manualName, manualSet);
    setIsScanning(false);
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
        body: JSON.stringify({ ...dataUrlToPayload(variant), language })
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
      body: JSON.stringify({ cardName, setName: setName || undefined, language })
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
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="relative overflow-hidden rounded-lg bg-slate-950">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
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
                <button onClick={() => { setIsComplete(true); stopCamera(); }} className="h-11 rounded-lg border border-amber-300/40 px-4 text-sm font-semibold text-amber-100">End scan</button>
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

function centerCrop(width: number, height: number, widthRatio: number, heightRatio: number) {
  const cropWidth = Math.max(1, Math.round(width * widthRatio));
  const cropHeight = Math.max(1, Math.round(height * heightRatio));
  return {
    x: Math.max(0, Math.round((width - cropWidth) / 2)),
    y: Math.max(0, Math.round((height - cropHeight) / 2)),
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

    const frameCount = Math.min(60, Math.max(1, Math.ceil(duration)));
    const frames: string[] = [];

    for (let index = 0; index < frameCount; index += 1) {
      video.currentTime = Math.min(duration - 0.1, index);
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
