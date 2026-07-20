"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, FileDown, Flashlight, FlashlightOff, Loader2, Plus, ScanLine, Search, Trash2, X } from "lucide-react";
import { SetCombobox } from "@/components/set-combobox";
import { createClient } from "@/lib/supabase/browser";

type ScannerMode = "scanner";
type ScannerLanguage = "auto" | "english" | "japanese" | "chinese_simplified" | "chinese_traditional" | "korean";
type FoilPreference = "auto" | "normal" | "foil" | "reverse_holo";
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
  foil: boolean;
  estimatedValue: number;
  confidence: number;
  recognitionSource: string;
  pricingSource: string;
  imageDataUrl?: string | null;
  referenceImageUrl?: string | null;
};

type ScanResponse = {
  ok: boolean;
  card?: Omit<ScannerCard, "id" | "order" | "imageDataUrl">;
  cards?: Array<Omit<ScannerCard, "id" | "order" | "imageDataUrl">>;
  error?: string;
  messages?: string[];
};

type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
  applyConstraints: (constraints: MediaTrackConstraints & { advanced?: Array<MediaTrackConstraintSet & { torch?: boolean }> }) => Promise<void>;
};

const CARD_READINESS_INTERVAL_MS = 450;
const FALLBACK_SET_OPTIONS = [
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
  const cardReadinessIntervalRef = useRef<number | null>(null);
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
  const [foilPreference, setFoilPreference] = useState<FoilPreference>("auto");
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [successFlash, setSuccessFlash] = useState(false);
  const [setOptions, setSetOptions] = useState<string[]>(FALLBACK_SET_OPTIONS);
  const [cardReady, setCardReady] = useState(false);
  const [inventoryCostOpen, setInventoryCostOpen] = useState(false);
  const [scanTotalCost, setScanTotalCost] = useState("");
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lightingLow, setLightingLow] = useState(false);

  const totalValue = useMemo(() => cards.reduce((sum, card) => sum + card.estimatedValue, 0), [cards]);
  const totalScanCost = Number(scanTotalCost || 0);
  const costPerCard = cards.length && Number.isFinite(totalScanCost) ? totalScanCost / cards.length : 0;
  const scanProfit = totalValue - (Number.isFinite(totalScanCost) ? totalScanCost : 0);
  const scanRoi = totalScanCost > 0 ? (scanProfit / totalScanCost) * 100 : 0;
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
    if (!isCameraReady) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCameraReady, mode]);

  useEffect(() => {
    if (!isCameraReady) return;

    cardReadinessIntervalRef.current = window.setInterval(() => {
      const readiness = videoRef.current ? analyzeCardReadiness(videoRef.current) : { ready: false, lowLight: false };
      setCardReady(readiness.ready);
      setLightingLow(readiness.lowLight);
    }, CARD_READINESS_INTERVAL_MS);

    return () => {
      if (cardReadinessIntervalRef.current) window.clearInterval(cardReadinessIntervalRef.current);
      cardReadinessIntervalRef.current = null;
    };
  }, [isCameraReady, mode]);

  useEffect(() => {
    let ignore = false;

    async function loadSetOptions() {
      const response = await fetch("/api/card-sets");
      const body = await response.json().catch(() => null) as { ok?: boolean; sets?: string[] } | null;
      if (ignore || !response.ok || !body?.sets?.length) return;
      setSetOptions(Array.from(new Set([...body.sets, ...FALLBACK_SET_OPTIONS])).sort((left, right) => left.localeCompare(right)));
    }

    void loadSetOptions();
    return () => {
      ignore = true;
    };
  }, []);

  async function startCamera(nextMode = mode) {
    if (!packHint.trim()) {
      const shouldContinue = window.confirm("No Pokemon set is selected. You can proceed, but scanning and pricing may be less accurate. Continue without a set?");
      if (!shouldContinue) return;
    }

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
      const track = getTorchTrack(stream);
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setHasTorch(Boolean(capabilities?.torch));
      setTorchOn(false);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraReady(true);
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : "Could not start camera.");
      setIsCameraReady(false);
    }
  }

  function stopCamera() {
    if (cardReadinessIntervalRef.current) window.clearInterval(cardReadinessIntervalRef.current);
    cardReadinessIntervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCardReady(false);
    setHasTorch(false);
    setTorchOn(false);
    setLightingLow(false);
    setIsCameraReady(false);
  }

  async function toggleTorch() {
    const track = streamRef.current ? getTorchTrack(streamRef.current) : null;
    if (!track) {
      setHasTorch(false);
      return;
    }

    const nextTorchState = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: nextTorchState }] });
      setTorchOn(nextTorchState);
      setHasTorch(true);
    } catch {
      setHasTorch(false);
      setTorchOn(false);
      setNotice("Flashlight control is not available in this browser. Try stronger room lighting.");
    }
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
      const scannedImage = frames[Math.floor(frames.length / 2)] ?? frames[0];

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
      }

      if (!scanned) {
        setError(scanFailures[0] ?? "No readable Pokemon card was detected. Hold the card flat in the frame, tap to focus if needed, then scan again.");
        setNotice(null);
        return;
      }

      const card = addCard({ ...scanned, setName: packHint.trim() || scanned.setName }, scannedImage);
      showScannedCard(card);
      setNotice(null);
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
    const scanned = await scanManualCard(manualName, manualSet || packHint);
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
        body: JSON.stringify({ ...dataUrlToPayload(variant), language, foilPreference, packHint: packHint.trim() || undefined })
      });
      const scanned = await handleScanResponse(response, options);
      if (scanned) return scanned;
    }

    return null;
  }

  async function scanManualCard(cardName: string, setName: string, cardNumber?: string | null) {
    const response = await fetch("/api/scanner/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardName, setName: setName || undefined, cardNumber: cardNumber || undefined, language, foilPreference, packHint: packHint.trim() || undefined })
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

    if (body?.messages?.length) setNotice(body.messages.join(" "));
    return body.card;
  }

  function addCard(card: Omit<ScannerCard, "id" | "order" | "imageDataUrl">, imageDataUrl?: string | null) {
    const next: ScannerCard = {
      ...card,
      foil: card.foil ?? isFoilVariant(card.variant),
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

  function removeCardFromScanner(id: string) {
    removeCard(id);
  }

  async function addScansToInventory(purchasePricePerCard: number) {
    if (!cards.length) return;

    setIsScanning(true);
    setScanPhase("pricing");
    setError(null);
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) {
      setIsScanning(false);
      setScanPhase("idle");
      setError("Sign in again before adding scans to inventory.");
      return;
    }

    const rows = cards.map((card) => ({
      user_id: userId,
      name: [card.cardName, card.cardNumber, card.setName].filter(Boolean).join(" - "),
      card_name: card.cardName,
      set_name: card.setName,
      card_number: card.cardNumber,
      variant: card.variant,
      foil: card.foil,
      language: card.language,
      quantity: 1,
      purchase_price: roundMoney(purchasePricePerCard),
      estimated_sale_price: Number(card.estimatedValue || 0),
      fees: 0,
      shipping: 0,
      image_url: card.referenceImageUrl ?? card.imageDataUrl ?? null,
      notes: [
        "Added from PackWatcher Scanner",
        purchasePricePerCard > 0 ? `Allocated cost: ${currency(purchasePricePerCard)} per card from ${currency(totalScanCost)} total scan cost across ${cards.length} cards` : "Added without purchase cost",
        card.originalName ? `Printed name: ${card.originalName}` : null,
        card.variant ? `Variant: ${card.variant}` : null,
        card.foil ? "Foil: yes" : "Foil: no"
      ].filter(Boolean).join("\n")
    }));

    let { error: insertError } = await supabase.from("inventory_items").insert(rows);
    if (insertError && /card_name|set_name|card_number|variant|foil|language|column/i.test(insertError.message)) {
      const legacyRows = rows.map(({ card_name: _cardName, set_name: _setName, card_number: _cardNumber, variant: _variant, foil: _foil, language: _language, ...row }) => row);
      const retry = await supabase.from("inventory_items").insert(legacyRows);
      insertError = retry.error;
    }
    if (insertError && /image_url/i.test(insertError.message)) {
      const rowsWithoutImages = rows.map(({ image_url: _imageUrl, ...row }) => row);
      const retry = await supabase.from("inventory_items").insert(rowsWithoutImages);
      insertError = retry.error;
    }
    setIsScanning(false);
    setScanPhase("idle");
    if (insertError) {
      setError(`Could not add scans to inventory: ${insertError.message}`);
      return;
    }
    setInventoryCostOpen(false);
    setScanTotalCost("");
    setNotice(`Added ${cards.length} scanned card${cards.length === 1 ? "" : "s"} to inventory${purchasePricePerCard > 0 ? ` with ${currency(purchasePricePerCard)} cost per card` : " without purchase cost"}.`);
  }

  async function lookupCard(card: ScannerCard) {
    if (!card.cardName.trim()) {
      setError("Enter a card name before looking up value.");
      return;
    }

    setIsScanning(true);
    setScanPhase("pricing");
    setError(null);
    const scanned = await scanManualCard(card.cardName, card.setName ?? "", card.cardNumber);
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
      foil: scanned.foil,
      estimatedValue: scanned.estimatedValue,
      confidence: scanned.confidence,
      recognitionSource: scanned.recognitionSource,
      pricingSource: scanned.pricingSource,
      referenceImageUrl: scanned.referenceImageUrl
    });
  }

  return (
    <div className="space-y-5">
      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_190px]">
          <SetCombobox value={packHint} onChange={setPackHint} options={setOptions} placeholder="Search Pokemon set" />
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
          <select
            value={foilPreference}
            onChange={(event) => setFoilPreference(event.target.value as FoilPreference)}
            className="h-12 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-200 outline-none focus:border-amber-300"
          >
            <option value="auto">Auto finish</option>
            <option value="normal">Normal / non-foil</option>
            <option value="foil">Foil / holo</option>
            <option value="reverse_holo">Reverse holo</option>
          </select>
        </div>
        <div className="mt-3">
          <p className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            Choose the set before scanning. Every scanned card will be saved to this set unless you edit it afterward.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
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
          </div>

          {notice ? <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{notice}</p> : null}
          {error ? <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
        </div>

        <aside className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <h2 className="font-bold text-white">Manual add</h2>
          <p className="mt-1 text-sm text-slate-400">Use this if the camera cannot read the card yet.</p>
          <div className="mt-4 grid gap-2">
            <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Card name" className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <SetCombobox value={manualSet} onChange={setManualSet} options={setOptions} placeholder={packHint ? `Default: ${packHint}` : "Search set"} />
            <button onClick={() => void addManualCard()} disabled={isScanning} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
              <Plus className="h-4 w-4" />
              Add card
            </button>
          </div>
        </aside>
      </section>

      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Scan results</h2>
            <p className="mt-1 text-sm text-slate-400">{cards.length} card{cards.length === 1 ? "" : "s"} scanned - Total value {currency(totalValue)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setInventoryCostOpen(true)} disabled={!cards.length || isScanning} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300/40 px-4 text-sm font-bold text-emerald-100 disabled:opacity-50">
              <Plus className="h-4 w-4" />
              Add to inventory
            </button>
            <button onClick={() => exportResultsPdf(cards, totalValue, Number.isFinite(totalScanCost) ? totalScanCost : 0)} disabled={!cards.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">
              <FileDown className="h-4 w-4" />
              Export PDF
            </button>
          </div>
        </div>

        {cards.length ? (
          <div className="mt-4 rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(3,120px)]">
              <label>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total pack/card cost</span>
                <input
                  value={scanTotalCost}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  onChange={(event) => setScanTotalCost(event.target.value)}
                  placeholder="Optional, e.g. 42.00"
                  className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300"
                />
              </label>
              <ScanMetric label="Cost/card" value={currency(costPerCard)} />
              <ScanMetric label="Profit" value={currency(scanProfit)} tone={scanProfit >= 0 ? "positive" : "negative"} />
              <ScanMetric label="ROI" value={totalScanCost > 0 ? `${scanRoi.toFixed(1)}%` : "0.0%"} />
            </div>
            <p className="mt-2 text-xs text-slate-500">This cost is used for inventory purchase cost and PDF ROI. Leave blank if you do not know the pack cost.</p>
          </div>
        ) : null}

        {inventoryCostOpen ? (
          <div className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="font-bold text-white">Confirm inventory cost</h3>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Enter the total cost of the packs/cards scanned. PackWatcher will divide it across {cards.length} scanned card{cards.length === 1 ? "" : "s"}.
                </p>
              </div>
              <button type="button" onClick={() => setInventoryCostOpen(false)} className="h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200">
                Cancel
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ScanMetric label="Total cost" value={currency(totalScanCost)} />
              <ScanMetric label="Cost/card" value={currency(costPerCard)} />
              <ScanMetric label="Inventory ROI" value={totalScanCost > 0 ? `${scanRoi.toFixed(1)}%` : "0.0%"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void addScansToInventory(costPerCard)}
                disabled={isScanning || !cards.length || totalScanCost <= 0}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-50"
              >
                Add with cost
              </button>
              <button
                type="button"
                onClick={() => void addScansToInventory(0)}
                disabled={isScanning || !cards.length}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 disabled:opacity-50"
              >
                Confirm add without cost
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {cards.length ? cards.map((card) => (
            <div key={card.id} className="grid gap-3 rounded-lg bg-slate-950/50 p-3 sm:grid-cols-[64px_1fr]">
              {card.referenceImageUrl || card.imageDataUrl ? (
                <div
                  aria-hidden="true"
                  className="h-20 w-16 rounded-md bg-cover bg-center"
                  style={{ backgroundImage: `url(${card.referenceImageUrl ?? card.imageDataUrl})` }}
                />
              ) : <div className="grid h-20 w-16 place-items-center rounded-md bg-white/5 text-xs text-slate-500">Manual</div>}
              <div className="min-w-0">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_110px_140px_120px]">
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
                    value={card.cardNumber ?? ""}
                    onChange={(event) => updateCard(card.id, { cardNumber: event.target.value || null })}
                    placeholder="Number"
                    className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300"
                    aria-label={`Card ${card.order} number`}
                  />
                  <select
                    value={card.variant ?? (card.foil ? "Holofoil" : "Normal")}
                    onChange={(event) => {
                      const variant = event.target.value || null;
                      updateCard(card.id, { variant, foil: isFoilVariant(variant) });
                    }}
                    className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300"
                    aria-label={`Card ${card.order} finish`}
                  >
                    <option value="Normal">Normal</option>
                    <option value="Holofoil">Foil / holo</option>
                    <option value="Reverse Holofoil">Reverse holo</option>
                  </select>
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
              Scan cards to build a value list.
            </div>
          )}
        </div>

        {isComplete && cards.length ? <p className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">Scan complete. Review the ordered list, add missing cards manually, or export the PDF.</p> : null}
      </section>
      {isCameraReady ? (
        <FullScreenScanner
          videoRef={videoRef}
          cards={cards}
          isScanning={isScanning}
          successFlash={successFlash}
          cardReady={cardReady}
          hasTorch={hasTorch}
          torchOn={torchOn}
          lightingLow={lightingLow}
          lastCard={lastCard}
          totalCards={cards.length}
          totalValue={totalValue}
          error={error}
          notice={notice}
          onScan={() => void scanCameraFrame()}
          onToggleTorch={() => void toggleTorch()}
          onRemove={removeCardFromScanner}
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
  cardReady,
  hasTorch,
  torchOn,
  lightingLow,
  lastCard,
  totalCards,
  totalValue,
  error,
  notice,
  onScan,
  onToggleTorch,
  onRemove,
  onClose,
  onEnd
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cards: ScannerCard[];
  isScanning: boolean;
  successFlash: boolean;
  cardReady: boolean;
  hasTorch: boolean;
  torchOn: boolean;
  lightingLow: boolean;
  lastCard: ScannerCard | null;
  totalCards: number;
  totalValue: number;
  error: string | null;
  notice: string | null;
  onScan: () => void;
  onToggleTorch: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black text-white">
      <style>{`
        @keyframes packwatcherScanLine {
          0% { transform: translateY(-42%); opacity: 0.15; }
          50% { opacity: 1; }
          100% { transform: translateY(42%); opacity: 0.15; }
        }
      `}</style>
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/95" />
      {successFlash ? <div className="pointer-events-none absolute inset-0 bg-emerald-400/35" /> : null}

      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        <button onClick={onClose} className="grid h-12 w-12 place-items-center rounded-full bg-white text-slate-950 shadow-lg">
          <X className="h-6 w-6" />
        </button>
        <div className="rounded-full bg-black/50 px-4 py-2 text-sm font-bold text-white/75 shadow-lg backdrop-blur">
          Manual scan
        </div>
        {hasTorch ? (
          <button
            onClick={onToggleTorch}
            className={`grid h-12 w-12 place-items-center rounded-full shadow-lg backdrop-blur ${torchOn ? "bg-amber-300 text-slate-950" : "bg-black/50 text-white"}`}
            aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
          >
            {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
        ) : <div className="w-12" />}
      </div>

      {lightingLow ? (
        <div className="pointer-events-none absolute left-5 right-5 top-[calc(env(safe-area-inset-top)+76px)] rounded-2xl border border-amber-300/30 bg-black/65 px-4 py-3 text-center text-sm font-bold text-amber-100 shadow-lg backdrop-blur">
          {hasTorch && !torchOn ? "Lighting looks low. Try the flashlight." : "Need better lighting for a cleaner scan."}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-8 top-[20vh] mx-auto max-w-[285px] sm:max-w-[320px]">
        <div className={`relative aspect-[63/88] rounded-[10px] border-[5px] shadow-[0_0_30px_rgba(148,163,184,0.25)] ${cardReady ? "border-emerald-400 shadow-[0_0_30px_rgba(74,222,128,0.5)]" : "border-slate-400/80"}`}>
          <div className={`absolute -left-3 -top-3 h-6 w-6 rounded-full ${cardReady ? "bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" : "bg-slate-400"}`} />
          <div className={`absolute -right-3 -top-3 h-6 w-6 rounded-full ${cardReady ? "bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" : "bg-slate-400"}`} />
          <div className={`absolute -bottom-3 -left-3 h-6 w-6 rounded-full ${cardReady ? "bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" : "bg-slate-400"}`} />
          <div className={`absolute -bottom-3 -right-3 h-6 w-6 rounded-full ${cardReady ? "bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" : "bg-slate-400"}`} />
          <div className={`absolute left-1/2 top-7 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-black shadow-lg backdrop-blur ${cardReady ? "bg-emerald-400/70 text-white" : "bg-slate-900/65 text-slate-100"}`}>
            {isScanning
              ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking</span>
              : cardReady
                ? <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Ready to capture</span>
                : <span>Line card up</span>}
          </div>
          {isScanning ? <div className="absolute inset-x-3 top-1/2 h-1 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(74,222,128,0.9)]" style={{ animation: "packwatcherScanLine 1.2s ease-in-out infinite alternate" }} /> : null}
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
          <div className="mb-6 flex gap-3 overflow-x-auto px-3 pb-3 pt-3">
            {cards.slice().reverse().slice(0, 8).map((card) => (
              <div key={card.id} className="relative flex min-w-[228px] items-center gap-3 rounded-2xl bg-white/12 p-3 shadow-lg backdrop-blur">
                <button
                  onClick={() => onRemove(card.id)}
                  className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-black/80 text-white shadow-lg"
                  aria-label={`Remove ${card.cardName}`}
                >
                  <X className="h-4 w-4" />
                </button>
                {card.referenceImageUrl || card.imageDataUrl ? (
                  <div className="h-20 w-14 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${card.referenceImageUrl ?? card.imageDataUrl})` }} />
                ) : <div className="grid h-20 w-14 shrink-0 place-items-center rounded-lg bg-white/10 text-[10px] text-white/50">Manual</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{card.cardName}</p>
                  <p className="truncate text-xs text-white/60">{[card.cardNumber, card.setName, card.variant].filter(Boolean).join(" - ") || "No set details"}</p>
                  <p className="mt-1 text-base font-black text-emerald-300">{currency(card.estimatedValue)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_96px_1fr] items-end gap-4">
          <div className="grid justify-items-center gap-1 text-xs font-semibold text-white/70">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-black/40 backdrop-blur"><ScanLine className="h-7 w-7" /></span>
            Scanner
          </div>
          <button onClick={onScan} disabled={isScanning} className={`grid h-24 w-24 place-items-center rounded-full border-[5px] text-slate-950 disabled:opacity-70 ${cardReady ? "border-emerald-400 bg-emerald-400 shadow-[0_0_24px_rgba(74,222,128,0.7)]" : "border-slate-300 bg-white"}`}>
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

function ScanMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  const toneClass = tone === "positive" ? "text-emerald-200" : tone === "negative" ? "text-rose-200" : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${toneClass}`}>{value}</p>
    </div>
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

function analyzeCardReadiness(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return { ready: false, lowLight: false };

  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 128;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { ready: false, lowLight: false };

  const crop = centerCrop(video.videoWidth, video.videoHeight, 0.72, 0.78, -0.02);
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  let sum = 0;
  let sumSquares = 0;
  let saturated = 0;
  let bright = 0;
  let veryDark = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  const luminance = new Float32Array(canvas.width * canvas.height);

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const pixel = index / 4;
    luminance[pixel] = luma;
    sum += luma;
    sumSquares += luma * luma;
    if (max - min > 35) saturated += 1;
    if (luma > 170) bright += 1;
    if (luma < 32) veryDark += 1;
  }

  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const i = y * canvas.width + x;
      const gradient = Math.abs(luminance[i] - luminance[i - 1]) + Math.abs(luminance[i] - luminance[i - canvas.width]);
      edgeTotal += gradient;
      edgeCount += 1;
    }
  }

  const pixels = canvas.width * canvas.height;
  const mean = sum / pixels;
  const variance = sumSquares / pixels - mean * mean;
  const contrast = Math.sqrt(Math.max(0, variance));
  const edgeScore = edgeCount ? edgeTotal / edgeCount : 0;
  const saturationRatio = saturated / pixels;
  const brightRatio = bright / pixels;
  const darkRatio = veryDark / pixels;

  const lowLight = mean < 58 || brightRatio < 0.06 || darkRatio > 0.48;
  const ready = mean > 55 && contrast > 34 && edgeScore > 15 && saturationRatio > 0.1 && brightRatio > 0.08 && darkRatio < 0.42;
  return { ready, lowLight };
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

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function languageLabel(language: string | null) {
  if (!language || language === "auto") return null;
  return language.replace(/_/g, " ");
}

function isFoilVariant(variant?: string | null) {
  return /foil|holo/i.test(variant ?? "");
}

function getTorchTrack(stream: MediaStream) {
  const track = stream.getVideoTracks()[0] as TorchTrack | undefined;
  if (!track) return null;
  const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
  return capabilities?.torch ? track : null;
}

function cleanOption(value: string | null | undefined) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length < 2) return null;
  return text;
}

function exportResultsPdf(cards: ScannerCard[], totalValue: number, totalCost = 0) {
  const costPerCard = cards.length && totalCost > 0 ? totalCost / cards.length : 0;
  const profit = totalValue - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const lines = [
    "PackWatcher Scanner Results",
    `Generated: ${new Date().toLocaleString()}`,
    `Cards scanned: ${cards.length}`,
    `Total estimated value: ${currency(totalValue)}`,
    `Total cost: ${currency(totalCost)}`,
    `Cost per card: ${currency(costPerCard)}`,
    `Profit/Loss: ${currency(profit)}`,
    `ROI: ${totalCost > 0 ? `${roi.toFixed(1)}%` : "0.0%"}`,
    "",
    ...cards.flatMap((card) => [
      `${card.order}. ${card.cardName} - ${currency(card.estimatedValue)}`,
      totalCost > 0 ? `   Allocated cost: ${currency(costPerCard)} | Profit/Loss: ${currency(card.estimatedValue - costPerCard)}` : "",
      card.originalName ? `   Printed name: ${card.originalName}` : "",
      `   Finish: ${card.variant ?? (card.foil ? "Foil" : "Normal")}`,
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
