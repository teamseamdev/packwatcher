"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, FileDown, Flashlight, FlashlightOff, Loader2, Plus, ScanLine, Search, Trash2, X } from "lucide-react";
import { SetCombobox } from "@/components/set-combobox";
import { averageCornerDistance, distance, mapVideoPointToCover, orderQuadPoints, polygonArea, quadCenter, smoothQuad, type Point, type Quad } from "@/lib/scanner/geometry";
import { ScanCoordinator } from "@/lib/scanner/scan-coordinator";
import type { PreparedSetScannerIndex } from "@/lib/scanner/set-pack";
import { createClient } from "@/lib/supabase/browser";

type ScannerMode = "scanner";
type CaptureMode = "auto" | "manual";
type ScannerLanguage = "auto" | "english" | "japanese" | "chinese_simplified" | "chinese_traditional" | "korean";
type FoilPreference = "auto" | "normal" | "foil" | "reverse_holo";
type ScanPhase = "idle" | "capturing" | "recognizing" | "pricing";
type ScannerState = "initializing" | "searching" | "tracking" | "quality-blocked" | "stabilizing" | "capture-ready" | "capturing" | "identifying" | "captured" | "awaiting-removal" | "error" | "paused";
type QualityBlocker = "blur" | "motion" | "dark" | "overexposed" | "glare" | "too-small" | "too-large" | "cropped" | "multiple-cards";
type CardDetection = {
  corners: Quad;
  confidence: number;
  areaRatio: number;
  aspectRatio: number;
  rotationDegrees: number;
  rectangularity: number;
  edgeStrength: number;
  timestamp: number;
  videoWidth: number;
  videoHeight: number;
};
type FrameQuality = {
  blurScore: number;
  brightnessScore: number;
  glareRatio: number;
  motionScore: number;
  allCornersVisible: boolean;
  acceptable: boolean;
  blockers: QualityBlocker[];
};
type TrackingSnapshot = {
  detection: CardDetection;
  quality: FrameQuality;
  stableForMs: number;
  consecutiveDetectedFrames: number;
  consecutiveStableFrames: number;
  multipleCards: boolean;
};
type ScannerCard = {
  id: string;
  order: number;
  scanEventId: string;
  canonicalCardId: string | null;
  canonicalSetId: string | null;
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
type ScannerCardPayload = Omit<ScannerCard, "id" | "order" | "imageDataUrl" | "scanEventId">;

type ScanResponse = {
  ok: boolean;
  card?: ScannerCardPayload;
  cards?: ScannerCardPayload[];
  candidates?: ScannerCardPayload[];
  requiredAction?: "confirm_candidate" | "no_safe_match";
  code?: string;
  error?: string;
  messages?: string[];
  usage?: {
    limit: number | null;
    used: number;
    remaining: number | null;
    replayed?: boolean;
    skipped?: boolean;
  };
};

type CardSetOption = {
  id: string;
  name: string;
};
type ScanJob = {
  detection?: CardDetection | null;
  automatic?: boolean;
  bypassDuplicate?: boolean;
};

type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
  applyConstraints: (constraints: MediaTrackConstraints & { advanced?: Array<MediaTrackConstraintSet & { torch?: boolean }> }) => Promise<void>;
};

const SCANNER_DETECTION_CONFIG = {
  analysisIntervalMs: 110,
  sampleWidth: 150,
  minAreaRatio: 0.09,
  maxAreaRatio: 0.54,
  minAspectRatio: 0.52,
  maxAspectRatio: 0.92,
  minConfidence: 0.68,
  minAutoCaptureMs: 720,
  maxStableMotionPx: 18,
  duplicateHammingDistance: 8,
  rearmNoCardMs: 650,
  sameCardCooldownMs: 2400,
  scanRequestTimeoutMs: 18000
} as const;
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
const setPackCache = new Map<string, PreparedSetScannerIndex>();
const SET_PACK_CACHE_MS = 10 * 60 * 1000;

export function CardScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const successFlashTimeoutRef = useRef<number | null>(null);
  const cardHideTimeoutRef = useRef<number | null>(null);
  const detectionFrameRef = useRef<number | null>(null);
  const lastAnalysisAtRef = useRef(0);
  const detectionInFlightRef = useRef(false);
  const stableSinceRef = useRef<number | null>(null);
  const lastDetectionRef = useRef<CardDetection | null>(null);
  const trackingCountersRef = useRef({ detected: 0, stable: 0 });
  const captureLockRef = useRef(false);
  const scanCoordinatorRef = useRef(new ScanCoordinator<ScanJob, ScannerCardPayload | null>());
  const activeScanAbortRef = useRef<AbortController | null>(null);
  const scannerSessionIdRef = useRef("");
  const scannerModeRef = useRef<CaptureMode>("auto");
  const duplicateGuardRef = useRef<{ hash: string; canonicalCardId: string | null; capturedAt: number; armed: boolean }>({ hash: "", canonicalCardId: null, capturedAt: 0, armed: true });
  const noCardSinceRef = useRef<number | null>(null);
  const [mode, setMode] = useState<ScannerMode>("scanner");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("auto");
  const [preparedSetPack, setPreparedSetPack] = useState<PreparedSetScannerIndex | null>(null);
  const [isPreparingSet, setIsPreparingSet] = useState(false);
  const [scannerState, setScannerState] = useState<ScannerState>("searching");
  const [tracking, setTracking] = useState<TrackingSnapshot | null>(null);
  const [autoProgress, setAutoProgress] = useState(0);
  const [cards, setCards] = useState<ScannerCard[]>([]);
  const [lastCard, setLastCard] = useState<ScannerCard | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualSet, setManualSet] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [packHint, setPackHint] = useState("");
  const [language, setLanguage] = useState<ScannerLanguage>("auto");
  const [foilPreference, setFoilPreference] = useState<FoilPreference>("auto");
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [successFlash, setSuccessFlash] = useState(false);
  const [setOptions, setSetOptions] = useState<string[]>(FALLBACK_SET_OPTIONS);
  const [cardSetOptions, setCardSetOptions] = useState<CardSetOption[]>([]);
  const [candidateChoices, setCandidateChoices] = useState<ScannerCardPayload[]>([]);
  const [cardReady, setCardReady] = useState(false);
  const [inventoryCostOpen, setInventoryCostOpen] = useState(false);
  const [scanTotalCost, setScanTotalCost] = useState("");
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lightingLow, setLightingLow] = useState(false);

  const totalValue = useMemo(() => cards.reduce((sum, card) => sum + card.estimatedValue, 0), [cards]);
  const uniqueSessionCards = useMemo(() => new Set(cards.map((card) => card.canonicalCardId ?? `${card.cardName}:${card.setName}:${card.cardNumber}`)).size, [cards]);
  const totalScanCost = Number(scanTotalCost || 0);
  const costPerCard = cards.length && Number.isFinite(totalScanCost) ? totalScanCost / cards.length : 0;
  const scanProfit = totalValue - (Number.isFinite(totalScanCost) ? totalScanCost : 0);
  const scanRoi = totalScanCost > 0 ? (scanProfit / totalScanCost) * 100 : 0;
  const selectedSet = useMemo(() => {
    const normalized = normalizeSetLabel(packHint);
    return cardSetOptions.find((option) => normalizeSetLabel(option.name) === normalized) ?? null;
  }, [cardSetOptions, packHint]);
  useEffect(() => {
    return () => {
      stopCamera();
      clearScannerTimers();
    };
  }, []);

  useEffect(() => {
    scannerModeRef.current = captureMode;
  }, [captureMode]);

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
    const loop = (timestamp: number) => {
      detectionFrameRef.current = window.requestAnimationFrame(loop);
      if (document.hidden || captureLockRef.current || isScanning || !videoRef.current) return;
      if (timestamp - lastAnalysisAtRef.current < SCANNER_DETECTION_CONFIG.analysisIntervalMs || detectionInFlightRef.current) return;
      lastAnalysisAtRef.current = timestamp;
      detectionInFlightRef.current = true;
      try {
        handleDetectionFrame(videoRef.current, timestamp);
      } finally {
        detectionInFlightRef.current = false;
      }
    };
    detectionFrameRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (detectionFrameRef.current) window.cancelAnimationFrame(detectionFrameRef.current);
      detectionFrameRef.current = null;
      detectionInFlightRef.current = false;
    };
  // The loop intentionally reads current refs/state guards and is restarted only when camera/scanning status changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraReady, isScanning]);

  useEffect(() => {
    let ignore = false;

    async function loadSetOptions() {
      const response = await fetch("/api/card-sets");
      const body = await response.json().catch(() => null) as { ok?: boolean; sets?: string[]; cardSets?: CardSetOption[] } | null;
      if (ignore || !response.ok || !body?.sets?.length) return;
      setSetOptions(Array.from(new Set([...body.sets, ...FALLBACK_SET_OPTIONS])).sort((left, right) => left.localeCompare(right)));
      setCardSetOptions(body.cardSets ?? []);
    }

    void loadSetOptions();
    return () => {
      ignore = true;
    };
  }, []);

  async function startCamera(nextMode = mode) {
    if (!selectedSet) {
      setError("Choose a set from the list before scanning. Scanner matches are locked to the selected set.");
      return;
    }

    setError(null);
    setNotice(`Preparing ${selectedSet.name}...`);
    setCandidateChoices([]);
    setMode(nextMode);
    setIsComplete(false);
    setIsPreparingSet(true);

    try {
      const preparedPack = await prepareSelectedSetPack(selectedSet);
      setPreparedSetPack(preparedPack);
      setNotice(`${preparedPack.cards.length} cards ready`);
      stopCamera();
      scannerSessionIdRef.current = crypto.randomUUID();
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
      stream.getVideoTracks().forEach((videoTrack) => {
        videoTrack.onended = () => {
          setScannerState("error");
          setError("Camera stopped. Reopen the scanner to continue.");
          stopCamera();
        };
      });
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setHasTorch(Boolean(capabilities?.torch));
      setTorchOn(false);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraReady(true);
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : "Could not start camera.");
      setIsCameraReady(false);
    } finally {
      setIsPreparingSet(false);
    }
  }

  function stopCamera() {
    scannerSessionIdRef.current = "";
    activeScanAbortRef.current?.abort();
    activeScanAbortRef.current = null;
    if (detectionFrameRef.current) window.cancelAnimationFrame(detectionFrameRef.current);
    detectionFrameRef.current = null;
    detectionInFlightRef.current = false;
    lastDetectionRef.current = null;
    stableSinceRef.current = null;
    trackingCountersRef.current = { detected: 0, stable: 0 };
    captureLockRef.current = false;
    noCardSinceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCardReady(false);
    setTracking(null);
    setAutoProgress(0);
    setScannerState("searching");
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

  function handleDetectionFrame(video: HTMLVideoElement, timestamp: number) {
    const analysis = analyzeVideoFrame(video, lastDetectionRef.current, timestamp);
    if (!analysis.detection) {
      const noCardSince = noCardSinceRef.current ?? timestamp;
      noCardSinceRef.current = noCardSince;
      if (timestamp - noCardSince > SCANNER_DETECTION_CONFIG.rearmNoCardMs) {
        duplicateGuardRef.current.armed = true;
        setScannerState("searching");
      }
      setCardReady(false);
      setTracking(null);
      setAutoProgress(0);
      stableSinceRef.current = null;
      trackingCountersRef.current = { detected: 0, stable: 0 };
      return;
    }

    noCardSinceRef.current = null;
    const previous = lastDetectionRef.current;
    const smoothedCorners = smoothQuad(previous?.corners ?? null, analysis.detection.corners, 0.42);
    const detection: CardDetection = { ...analysis.detection, corners: smoothedCorners };
    const motionScore = previous ? averageCornerDistance(previous.corners, detection.corners) : 0;
    const quality = { ...analysis.quality, motionScore, acceptable: analysis.quality.acceptable && motionScore <= SCANNER_DETECTION_CONFIG.maxStableMotionPx };
    if (motionScore > SCANNER_DETECTION_CONFIG.maxStableMotionPx && !quality.blockers.includes("motion")) quality.blockers.push("motion");

    lastDetectionRef.current = detection;
    trackingCountersRef.current.detected += 1;
    const stable = detection.confidence >= SCANNER_DETECTION_CONFIG.minConfidence && quality.acceptable && !analysis.multipleCards;
    if (stable) {
      trackingCountersRef.current.stable += 1;
      stableSinceRef.current ??= timestamp;
    } else {
      trackingCountersRef.current.stable = 0;
      stableSinceRef.current = null;
    }

    const stableForMs = stableSinceRef.current ? timestamp - stableSinceRef.current : 0;
    const progress = stable ? Math.min(1, stableForMs / SCANNER_DETECTION_CONFIG.minAutoCaptureMs) : 0;
    setTracking({
      detection,
      quality,
      stableForMs,
      consecutiveDetectedFrames: trackingCountersRef.current.detected,
      consecutiveStableFrames: trackingCountersRef.current.stable,
      multipleCards: analysis.multipleCards
    });
    setLightingLow(quality.blockers.includes("dark"));
    setCardReady(stable);
    setAutoProgress(progress);
    setScannerState(scannerStateForAnalysis(stable, progress, quality.blockers, analysis.multipleCards));

    if (
      scannerModeRef.current === "auto" &&
      progress >= 1 &&
      duplicateGuardRef.current.armed &&
      preparedSetPack?.setId === selectedSet?.id &&
      !scanCoordinatorRef.current.active &&
      !captureLockRef.current &&
      !isScanning
    ) {
      void scanCameraFrame({ detection, automatic: true });
    }
  }

  async function prepareSelectedSetPack(set: CardSetOption) {
    const cached = setPackCache.get(set.id);
    if (cached && Date.now() - cached.preparedAt < SET_PACK_CACHE_MS) return cached;

    const response = await fetch(`/api/scanner/set-pack?setId=${encodeURIComponent(set.id)}`, {
      headers: { accept: "application/json" }
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; pack?: PreparedSetScannerIndex; error?: string } | null;
    if (!response.ok || !body?.ok || !body.pack) {
      throw new Error(body?.error ?? `Could not prepare scanner set. Status ${response.status}.`);
    }
    setPackCache.set(set.id, body.pack);
    return body.pack;
  }

  async function scanCameraFrame(options: ScanJob = {}) {
    return scanCoordinatorRef.current.run(options, executeScanCameraFrame);
  }

  async function executeScanCameraFrame(options: ScanJob = {}, scanEventId: string) {
    const sessionId = scannerSessionIdRef.current;
    if (!videoRef.current) return null;
    if (!selectedSet || preparedSetPack?.setId !== selectedSet.id) {
      setError("Prepare the selected set before scanning.");
      return null;
    }
    const detection = options.detection ?? lastDetectionRef.current;
    if (options.automatic && !duplicateGuardRef.current.armed) {
      setNotice("Remove card, then present the next copy.");
      setScannerState("awaiting-removal");
      return null;
    }
    duplicateGuardRef.current.armed = false;
    setIsScanning(true);
    captureLockRef.current = true;
    setScanPhase("capturing");
    setScannerState("capturing");
    setError(null);
    setNotice("Checking card...");

    try {
      const sourceImage = detection ? capturePerspectiveCorrectedCard(videoRef.current, detection.corners) : captureVideoFrame(videoRef.current);
      const fingerprint = await imageFingerprint(sourceImage);
      if (options.automatic && isDuplicatePhysicalCardHash(fingerprint, duplicateGuardRef.current, noCardSinceRef.current)) {
        setNotice("Remove card, then present the next copy.");
        setScannerState("awaiting-removal");
        return null;
      }

      const frames = detection ? [sourceImage] : await captureCameraBurst(videoRef.current);
      const scanFailures: string[] = [];
      let scanned: ScannerCardPayload | null = null;
      const scannedImage = sourceImage;

      const focusedFrames = await buildRecognitionFrames(frames);
      const contactSheet = await buildContactSheet(focusedFrames);
      setScanPhase("recognizing");
      setScannerState("identifying");
      setNotice("Identifying...");
      scanned = await scanImageDataUrl(contactSheet ?? focusedFrames[0] ?? sourceImage, {
        scanEventId,
        scannerSessionId: sessionId,
        silentMiss: true,
        onMiss: (message) => {
          if (message && !scanFailures.includes(message)) scanFailures.push(message);
        }
      });

      if (!scanned) {
        setError(scanFailures[0] ?? "No readable Pokemon card was detected. Hold the card flat in the frame, tap to focus if needed, then scan again.");
        setNotice(null);
        setScannerState("error");
        return null;
      }
      if (!sessionId || scannerSessionIdRef.current !== sessionId || preparedSetPack?.setId !== selectedSet.id) return null;

      const card = addCard({ ...scanned, setName: selectedSet?.name ?? scanned.setName }, scannedImage, scanEventId);
      duplicateGuardRef.current = {
        hash: fingerprint,
        canonicalCardId: card.canonicalCardId,
        capturedAt: Date.now(),
        armed: false
      };
      showScannedCard(card);
      setNotice(null);
      setScannerState("captured");
      window.setTimeout(() => setScannerState("awaiting-removal"), 650);
      return scanned;
    } finally {
      setScanPhase("idle");
      setIsScanning(false);
      captureLockRef.current = false;
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
    const scanned = await scanManualCard(manualName, manualSet || packHint, manualNumber);
    setIsScanning(false);
    setScanPhase("idle");
    if (!scanned) return;

    const card = addCard(scanned, null, crypto.randomUUID());
    setLastCard(card);
    setManualName("");
    setManualSet("");
    setManualNumber("");
  }

  async function scanImageDataUrl(
    imageDataUrl: string,
    options: { scanEventId?: string; scannerSessionId?: string; silentMiss?: boolean; onMiss?: (message: string) => void } = {}
  ) {
    if (!selectedSet) {
      setError("Choose a set from the list before scanning.");
      return null;
    }
    activeScanAbortRef.current?.abort();
    const controller = new AbortController();
    activeScanAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), SCANNER_DETECTION_CONFIG.scanRequestTimeoutMs);
    try {
      const response = await fetch("/api/scanner/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ...dataUrlToPayload(imageDataUrl),
          scanEventId: options.scanEventId,
          scannerSessionId: options.scannerSessionId,
          language,
          foilPreference,
          packHint: selectedSet.name,
          selectedSetId: selectedSet.id
        })
      });
      return handleScanResponse(response, options);
    } catch (scanError) {
      const message = scanError instanceof DOMException && scanError.name === "AbortError"
        ? "Scanner request timed out. Retake the card once; PackWatcher will not keep retrying automatically."
        : scanError instanceof Error ? scanError.message : "Scanner request failed.";
      options.onMiss?.(message);
      if (!options.silentMiss) setError(message);
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (activeScanAbortRef.current === controller) activeScanAbortRef.current = null;
    }
  }

  async function scanManualCard(cardName: string, setName: string, cardNumber?: string | null) {
    const manualSelectedSet = setName.trim()
      ? cardSetOptions.find((option) => normalizeSetLabel(option.name) === normalizeSetLabel(setName))
      : selectedSet;
    if (!manualSelectedSet) {
      setError("Choose a set from the list before adding or looking up a card.");
      return null;
    }
    const response = await fetch("/api/scanner/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardName,
        setName: manualSelectedSet.name,
        cardNumber: cardNumber || undefined,
        language,
        foilPreference,
        packHint: manualSelectedSet.name,
        selectedSetId: manualSelectedSet.id
      })
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
      if (body?.candidates?.length) {
        setCandidateChoices(body.candidates);
        setNotice("Choose the matching card from the selected set.");
      }
      options.onMiss?.(message);
      if (!options.silentMiss) {
        setError(message);
      }
      return null;
    }

    setCandidateChoices([]);
    return body.card;
  }

  function addCard(card: ScannerCardPayload, imageDataUrl?: string | null, scanEventId = crypto.randomUUID()) {
    const next: ScannerCard = {
      ...card,
      foil: card.foil ?? isFoilVariant(card.variant),
      id: crypto.randomUUID(),
      scanEventId,
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

  function confirmCandidate(card: ScannerCardPayload) {
    const added = addCard(card, null);
    showScannedCard(added);
    setCandidateChoices([]);
    setError(null);
    setNotice("Confirmed selected-set match.");
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
      scan_event_id: card.scanEventId,
      canonical_card_id: card.canonicalCardId,
      canonical_set_id: card.canonicalSetId,
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
    if (insertError && /scan_event_id|canonical_card_id|canonical_set_id|card_name|set_name|card_number|variant|foil|language|column/i.test(insertError.message)) {
      const legacyRows = rows.map(({
        canonical_card_id: _canonicalCardId,
        canonical_set_id: _canonicalSetId,
        scan_event_id: _scanEventId,
        card_name: _cardName,
        set_name: _setName,
        card_number: _cardNumber,
        variant: _variant,
        foil: _foil,
        language: _language,
        ...row
      }) => row);
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
      canonicalCardId: scanned.canonicalCardId,
      canonicalSetId: scanned.canonicalSetId,
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
            {selectedSet ? `Scanning only: ${selectedSet.name}. Every match is restricted to this set.` : "Choose a set from the list before scanning. Typed custom set names cannot be scanned until they match a catalog set."}
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
              disabled={isScanning || isPreparingSet}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50 sm:flex-none"
            >
              <ScanLine className="h-4 w-4" />
              {isPreparingSet ? "Preparing set..." : isCameraReady ? "Stop scanning" : "Start scanner"}
            </button>
          </div>

          {notice ? <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{notice}</p> : null}
          {error ? <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
          {candidateChoices.length ? (
            <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3">
              <p className="text-sm font-bold text-amber-100">Confirm card from {selectedSet?.name ?? "selected set"}</p>
              <div className="mt-3 grid gap-2">
                {candidateChoices.map((candidate) => (
                  <button
                    key={`${candidate.canonicalCardId ?? candidate.cardName}-${candidate.cardNumber}`}
                    type="button"
                    onClick={() => confirmCandidate(candidate)}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-2 text-left"
                  >
                    {candidate.referenceImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={candidate.referenceImageUrl} alt="" className="h-14 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-14 w-10 rounded bg-slate-900" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">{candidate.cardName}</span>
                      <span className="block truncate text-xs text-slate-400">{candidate.cardNumber ?? "No number"} - {candidate.setName}</span>
                    </span>
                    <span className="text-sm font-black text-emerald-300">{currency(candidate.estimatedValue)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <h2 className="font-bold text-white">Manual add</h2>
          <p className="mt-1 text-sm text-slate-400">Use this if the camera cannot read the card yet.</p>
          <div className="mt-4 grid gap-2">
            <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Card name" className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <SetCombobox value={manualSet} onChange={setManualSet} options={setOptions} placeholder={packHint ? `Default: ${packHint}` : "Search set"} />
            <input value={manualNumber} onChange={(event) => setManualNumber(event.target.value)} placeholder="Collector number, e.g. 025/198" className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
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
          captureMode={captureMode}
          scannerState={scannerState}
          tracking={tracking}
          autoProgress={autoProgress}
          hasTorch={hasTorch}
          torchOn={torchOn}
          lightingLow={lightingLow}
          lastCard={lastCard}
          activeSetName={preparedSetPack?.setName ?? selectedSet?.name ?? null}
          totalCards={cards.length}
          uniqueCards={uniqueSessionCards}
          totalValue={totalValue}
          error={error}
          notice={notice}
          onScan={() => void scanCameraFrame({ automatic: false, bypassDuplicate: true })}
          onModeChange={setCaptureMode}
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
  captureMode,
  scannerState,
  tracking,
  autoProgress,
  hasTorch,
  torchOn,
  lightingLow,
  lastCard,
  activeSetName,
  totalCards,
  uniqueCards,
  totalValue,
  error,
  notice,
  onScan,
  onModeChange,
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
  captureMode: CaptureMode;
  scannerState: ScannerState;
  tracking: TrackingSnapshot | null;
  autoProgress: number;
  hasTorch: boolean;
  torchOn: boolean;
  lightingLow: boolean;
  lastCard: ScannerCard | null;
  activeSetName: string | null;
  totalCards: number;
  uniqueCards: number;
  totalValue: number;
  error: string | null;
  notice: string | null;
  onScan: () => void;
  onModeChange: (mode: CaptureMode) => void;
  onToggleTorch: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onEnd: () => void;
}) {
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  useEffect(() => {
    function updateViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  const overlayPoints = tracking?.detection
    ? tracking.detection.corners.map((point) => mapVideoPointToCover(point, tracking.detection.videoWidth, tracking.detection.videoHeight, viewport.width, viewport.height))
    : null;
  const statusText = scannerStatusText(scannerState, tracking);
  const manualCaptureEnabled = Boolean(tracking?.detection) && !isScanning;

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
        <div className="grid grid-cols-2 rounded-full bg-black/55 p-1 text-xs font-black shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => onModeChange("auto")}
            className={`rounded-full px-4 py-2 ${captureMode === "auto" ? "bg-emerald-400 text-slate-950" : "text-white/75"}`}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => onModeChange("manual")}
            className={`rounded-full px-4 py-2 ${captureMode === "manual" ? "bg-white text-slate-950" : "text-white/75"}`}
          >
            Manual
          </button>
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

      {activeSetName ? (
        <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+75px)] -translate-x-1/2 rounded-full border border-amber-300/25 bg-black/55 px-3 py-1.5 text-center text-xs font-black text-amber-100 shadow-lg backdrop-blur">
          {compactSetName(activeSetName)}
        </div>
      ) : null}

      {lightingLow ? (
        <div className="pointer-events-none absolute left-5 right-5 top-[calc(env(safe-area-inset-top)+106px)] rounded-2xl border border-amber-300/30 bg-black/65 px-4 py-3 text-center text-sm font-bold text-amber-100 shadow-lg backdrop-blur">
          {hasTorch && !torchOn ? "Lighting looks low. Try the flashlight." : "Need better lighting for a cleaner scan."}
        </div>
      ) : null}

      <svg className="pointer-events-none absolute inset-0 h-full w-full" width={viewport.width} height={viewport.height} aria-hidden="true">
        {overlayPoints ? (
          <>
            <polygon
              points={overlayPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              fill={cardReady ? "rgba(16,185,129,0.16)" : "rgba(148,163,184,0.12)"}
              stroke={cardReady ? "rgb(52,211,153)" : "rgb(203,213,225)"}
              strokeWidth="5"
              strokeLinejoin="round"
              filter={cardReady ? "drop-shadow(0 0 12px rgba(52,211,153,0.8))" : undefined}
            />
            {overlayPoints.map((point, index) => (
              <circle key={index} cx={point.x} cy={point.y} r="10" fill={cardReady ? "rgb(52,211,153)" : "rgb(203,213,225)"} />
            ))}
          </>
        ) : (
          <rect
            x={viewport.width / 2 - 132}
            y={viewport.height * 0.2}
            width="264"
            height="368"
            rx="12"
            fill="rgba(15,23,42,0.08)"
            stroke="rgba(203,213,225,0.45)"
            strokeWidth="3"
            strokeDasharray="12 12"
          />
        )}
      </svg>

      <div className="pointer-events-none absolute left-5 right-5 top-[calc(env(safe-area-inset-top)+132px)] flex justify-center">
        <div className={`max-w-[290px] rounded-full px-5 py-3 text-center text-sm font-black shadow-lg backdrop-blur ${cardReady ? "bg-emerald-400/75 text-white" : "bg-slate-950/70 text-slate-100"}`}>
          {isScanning
            ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Scanning...</span>
            : cardReady
              ? <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {captureMode === "auto" ? "Hold steady" : "Ready"}</span>
              : <span>{statusText}</span>}
          {captureMode === "auto" && autoProgress > 0 && !isScanning ? (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white" style={{ width: `${Math.round(autoProgress * 100)}%` }} />
            </span>
          ) : null}
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
          <div>{totalCards} total / {uniqueCards} unique</div>
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
          <button
            onClick={onScan}
            disabled={isScanning || (captureMode === "manual" && !manualCaptureEnabled)}
            className={`grid h-24 w-24 place-items-center rounded-full border-[5px] text-slate-950 disabled:opacity-60 ${cardReady ? "border-emerald-400 bg-emerald-400 shadow-[0_0_24px_rgba(74,222,128,0.7)]" : "border-slate-300 bg-white"}`}
            aria-label={captureMode === "manual" ? "Capture card" : "Manual capture now"}
          >
            {isScanning ? <Loader2 className="h-10 w-10 animate-spin" /> : captureMode === "manual" ? <ScanLine className="h-11 w-11" /> : <Check className="h-12 w-12 stroke-[3]" />}
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

function scannerStatusText(state: ScannerState, tracking: TrackingSnapshot | null) {
  if (state === "awaiting-removal") return "Remove card";
  if (state === "searching" || !tracking) return "Place one card in view";
  if (tracking.multipleCards) return "Use one card at a time";
  const blocker = tracking.quality.blockers[0];
  if (blocker === "blur") return "Camera is still focusing";
  if (blocker === "motion") return "Hold still";
  if (blocker === "dark") return "More light needed";
  if (blocker === "overexposed") return "Reduce bright light";
  if (blocker === "glare") return "Reduce glare";
  if (blocker === "too-small") return "Move card closer";
  if (blocker === "too-large") return "Move card farther away";
  if (blocker === "cropped") return "Keep entire card visible";
  if (state === "stabilizing") return "Hold steady";
  if (state === "tracking") return "Card detected";
  return "Place one card in view";
}

function compactSetName(name: string) {
  return name.length > 24 ? `${name.slice(0, 21)}...` : name;
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

function capturePerspectiveCorrectedCard(video: HTMLVideoElement, corners: Quad) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = video.videoWidth || 960;
  sourceCanvas.height = video.videoHeight || 1280;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) return captureVideoFrame(video);
  sourceContext.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);

  const portraitCorners = normalizeQuadForPortrait(corners);
  const top = distance(portraitCorners[0], portraitCorners[1]);
  const right = distance(portraitCorners[1], portraitCorners[2]);
  const bottom = distance(portraitCorners[2], portraitCorners[3]);
  const left = distance(portraitCorners[3], portraitCorners[0]);
  const sourceShort = Math.max(1, Math.min((top + bottom) / 2, (left + right) / 2));
  const targetWidth = Math.round(clamp(sourceShort * 1.25, 640, 920));
  const targetHeight = Math.round(targetWidth / 0.716);
  const target = document.createElement("canvas");
  target.width = targetWidth;
  target.height = targetHeight;
  const targetContext = target.getContext("2d");
  if (!targetContext) return captureVideoFrame(video);

  const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const output = targetContext.createImageData(targetWidth, targetHeight);
  const homography = computeHomography(
    [{ x: 0, y: 0 }, { x: targetWidth - 1, y: 0 }, { x: targetWidth - 1, y: targetHeight - 1 }, { x: 0, y: targetHeight - 1 }],
    portraitCorners
  );
  if (!homography) return captureVideoFrame(video);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourcePoint = applyHomography(homography, x, y);
      const sx = Math.max(0, Math.min(sourceCanvas.width - 1, Math.round(sourcePoint.x)));
      const sy = Math.max(0, Math.min(sourceCanvas.height - 1, Math.round(sourcePoint.y)));
      const sourceIndex = (sy * sourceCanvas.width + sx) * 4;
      const targetIndex = (y * targetWidth + x) * 4;
      output.data[targetIndex] = sourceData.data[sourceIndex];
      output.data[targetIndex + 1] = sourceData.data[sourceIndex + 1];
      output.data[targetIndex + 2] = sourceData.data[sourceIndex + 2];
      output.data[targetIndex + 3] = 255;
    }
  }
  targetContext.putImageData(output, 0, 0);
  return target.toDataURL("image/jpeg", 0.9);
}

function normalizeQuadForPortrait(corners: Quad): Quad {
  const width = (distance(corners[0], corners[1]) + distance(corners[2], corners[3])) / 2;
  const height = (distance(corners[1], corners[2]) + distance(corners[3], corners[0])) / 2;
  return width > height ? [corners[3], corners[0], corners[1], corners[2]] : corners;
}

function computeHomography(from: Quad, to: Quad) {
  const matrix: number[][] = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = from[index];
    const u = to[index].x;
    const v = to[index].y;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const solution = solveLinearSystem(matrix);
  return solution ? [...solution.slice(0, 8), 1] : null;
}

function solveLinearSystem(matrix: number[][]) {
  const size = 8;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < 1e-8) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    for (let item = column; item <= size; item += 1) matrix[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let item = column; item <= size; item += 1) matrix[row][item] -= factor * matrix[column][item];
    }
  }
  return matrix.map((row) => row[size]);
}

function applyHomography(h: number[], x: number, y: number) {
  const denominator = h[6] * x + h[7] * y + h[8];
  return {
    x: (h[0] * x + h[1] * y + h[2]) / denominator,
    y: (h[3] * x + h[4] * y + h[5]) / denominator
  };
}

async function imageFingerprint(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.drawImage(image, 0, 0, 8, 8);
  const { data } = context.getImageData(0, 0, 8, 8);
  const values: number[] = [];
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    values.push(value);
    sum += value;
  }
  const average = sum / values.length;
  return values.map((value) => value >= average ? "1" : "0").join("");
}

function isDuplicatePhysicalCardHash(
  hash: string,
  guard: { hash: string; canonicalCardId: string | null; capturedAt: number; armed: boolean },
  noCardSince: number | null
) {
  if (!hash || guard.armed || !guard.hash) return false;
  if (Date.now() - guard.capturedAt > SCANNER_DETECTION_CONFIG.sameCardCooldownMs && noCardSince) return false;
  return hammingDistance(hash, guard.hash) <= SCANNER_DETECTION_CONFIG.duplicateHammingDistance;
}

function hammingDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function analyzeVideoFrame(video: HTMLVideoElement, previous: CardDetection | null, timestamp: number): { detection: CardDetection | null; quality: FrameQuality; multipleCards: boolean } {
  if (!video.videoWidth || !video.videoHeight) {
    return { detection: null, quality: emptyQuality(["cropped"]), multipleCards: false };
  }

  const candidates = detectCardCandidates(video, video.videoWidth, video.videoHeight, timestamp)
    .sort((left, right) => right.confidence - left.confidence);
  const best = candidates[0] ?? null;
  if (!best) return { detection: null, quality: emptyQuality([]), multipleCards: false };

  const multipleCards = candidates.filter((candidate) => candidate.confidence > 0.46).length > 1;
  const quality = analyzeFrameQuality(video, best, previous, multipleCards);
  return { detection: best, quality, multipleCards };
}

function detectCardCandidates(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, timestamp = performance.now()): CardDetection[] {
  const sampleWidth = SCANNER_DETECTION_CONFIG.sampleWidth;
  const sampleHeight = Math.max(180, Math.round((sourceHeight / sourceWidth) * sampleWidth));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, sampleWidth, sampleHeight);
  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
  const luminance = new Float32Array(sampleWidth * sampleHeight);
  let mean = 0;

  for (let index = 0; index < data.length; index += 4) {
    const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    luminance[index / 4] = luma;
    mean += luma;
  }
  mean /= luminance.length;

  const edges = new Uint8Array(sampleWidth * sampleHeight);
  const strengths = new Float32Array(sampleWidth * sampleHeight);
  let gradientMean = 0;
  let gradientCount = 0;
  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const i = y * sampleWidth + x;
      const gx = Math.abs(luminance[i + 1] - luminance[i - 1]);
      const gy = Math.abs(luminance[i + sampleWidth] - luminance[i - sampleWidth]);
      const gradient = gx + gy;
      strengths[i] = gradient;
      gradientMean += gradient;
      gradientCount += 1;
    }
  }
  gradientMean = gradientCount ? gradientMean / gradientCount : 0;
  const threshold = Math.max(28, gradientMean * 2.15, mean < 75 ? 20 : 0);
  for (let index = 0; index < strengths.length; index += 1) {
    if (strengths[index] >= threshold) edges[index] = 1;
  }

  const components = connectedEdgeComponents(edges, strengths, sampleWidth, sampleHeight);
  const sx = sourceWidth / sampleWidth;
  const sy = sourceHeight / sampleHeight;
  return components
    .map((component) => componentToDetection(component, sampleWidth, sampleHeight, sx, sy, timestamp))
    .filter((candidate): candidate is CardDetection => Boolean(candidate));
}

function connectedEdgeComponents(edges: Uint8Array, strengths: Float32Array, width: number, height: number) {
  const visited = new Uint8Array(edges.length);
  const components: Array<Array<{ x: number; y: number; strength: number }>> = [];
  const queue: number[] = [];

  for (let start = 0; start < edges.length; start += 1) {
    if (!edges[start] || visited[start]) continue;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;
    const points: Array<{ x: number; y: number; strength: number }> = [];

    while (queue.length) {
      const current = queue.pop() as number;
      const x = current % width;
      const y = Math.floor(current / width);
      points.push({ x, y, strength: strengths[current] });

      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (!ox && !oy) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (edges[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }

    if (points.length >= 60) components.push(points);
  }

  return components.sort((left, right) => right.length - left.length).slice(0, 8);
}

function componentToDetection(
  points: Array<{ x: number; y: number; strength: number }>,
  sampleWidth: number,
  sampleHeight: number,
  scaleX: number,
  scaleY: number,
  timestamp: number
): CardDetection | null {
  let weight = 0;
  let cx = 0;
  let cy = 0;
  for (const point of points) {
    const w = Math.max(1, point.strength);
    weight += w;
    cx += point.x * w;
    cy += point.y * w;
  }
  cx /= weight;
  cy /= weight;

  let xx = 0;
  let xy = 0;
  let yy = 0;
  let edgeStrength = 0;
  for (const point of points) {
    const w = Math.max(1, point.strength);
    const dx = point.x - cx;
    const dy = point.y - cy;
    xx += dx * dx * w;
    xy += dx * dy * w;
    yy += dy * dy * w;
    edgeStrength += point.strength;
  }
  xx /= weight;
  xy /= weight;
  yy /= weight;
  edgeStrength /= points.length;

  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const axisA = { x: Math.cos(angle), y: Math.sin(angle) };
  const axisB = { x: -Math.sin(angle), y: Math.cos(angle) };
  let minA = Number.POSITIVE_INFINITY;
  let maxA = Number.NEGATIVE_INFINITY;
  let minB = Number.POSITIVE_INFINITY;
  let maxB = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const a = dx * axisA.x + dy * axisA.y;
    const b = dx * axisB.x + dy * axisB.y;
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
    minB = Math.min(minB, b);
    maxB = Math.max(maxB, b);
  }

  const sampleCorners = orderQuadPoints([
    { x: cx + axisA.x * minA + axisB.x * minB, y: cy + axisA.y * minA + axisB.y * minB },
    { x: cx + axisA.x * maxA + axisB.x * minB, y: cy + axisA.y * maxA + axisB.y * minB },
    { x: cx + axisA.x * maxA + axisB.x * maxB, y: cy + axisA.y * maxA + axisB.y * maxB },
    { x: cx + axisA.x * minA + axisB.x * maxB, y: cy + axisA.y * minA + axisB.y * maxB }
  ]);
  const corners = sampleCorners.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })) as Quad;
  const sourceWidth = sampleWidth * scaleX;
  const sourceHeight = sampleHeight * scaleY;
  const areaRatio = Math.abs(polygonArea(corners)) / (sourceWidth * sourceHeight);
  const top = distance(corners[0], corners[1]);
  const right = distance(corners[1], corners[2]);
  const bottom = distance(corners[2], corners[3]);
  const left = distance(corners[3], corners[0]);
  const longEdge = Math.max(top, right, bottom, left);
  const shortEdge = Math.min(top, right, bottom, left);
  const horizontalCoverage = Math.max(top, bottom) / sourceWidth;
  const verticalCoverage = Math.max(left, right) / sourceHeight;
  const aspectRatio = shortEdge / Math.max(1, longEdge);
  const center = quadCenter(corners);
  const centerDistance = Math.hypot(center.x / sourceWidth - 0.5, center.y / sourceHeight - 0.5);
  const rectangularity = Math.min(top, bottom) / Math.max(top, bottom) * (Math.min(left, right) / Math.max(left, right));
  const sampleArea = Math.max(1, (maxA - minA) * (maxB - minB));
  const edgeDensity = points.length / sampleArea;
  const confidence = scoreCardDetection({
    areaRatio,
    aspectRatio,
    rectangularity,
    edgeStrength,
    edgeDensity,
    centerDistance,
    horizontalCoverage,
    verticalCoverage,
    corners,
    sourceWidth,
    sourceHeight
  });

  if (confidence < 0.28) return null;
  return {
    corners,
    confidence,
    areaRatio,
    aspectRatio,
    rotationDegrees: angle * 180 / Math.PI,
    rectangularity,
    edgeStrength,
    timestamp,
    videoWidth: sourceWidth,
    videoHeight: sourceHeight
  };
}

function scoreCardDetection(input: {
  areaRatio: number;
  aspectRatio: number;
  rectangularity: number;
  edgeStrength: number;
  edgeDensity: number;
  centerDistance: number;
  horizontalCoverage: number;
  verticalCoverage: number;
  corners: Quad;
  sourceWidth: number;
  sourceHeight: number;
}) {
  const areaScore = clamp01(1 - Math.abs(input.areaRatio - 0.24) / 0.24);
  const aspectScore = clamp01(1 - Math.abs(input.aspectRatio - 0.716) / 0.22);
  const rectangularityScore = clamp01(input.rectangularity);
  const edgeScore = clamp01((input.edgeStrength - 20) / 70);
  const edgeDensityScore = input.edgeDensity < 0.012 || input.edgeDensity > 0.48 ? 0 : clamp01(1 - Math.abs(input.edgeDensity - 0.09) / 0.2);
  const centerScore = clamp01(1 - input.centerDistance / 0.52);
  const visibleScore = input.corners.every((point) => point.x > 2 && point.y > 2 && point.x < input.sourceWidth - 2 && point.y < input.sourceHeight - 2) ? 1 : 0.45;
  const center = quadCenter(input.corners);
  const centerY = center.y / input.sourceHeight;

  if (input.areaRatio < SCANNER_DETECTION_CONFIG.minAreaRatio || input.areaRatio > SCANNER_DETECTION_CONFIG.maxAreaRatio) return 0;
  if (input.aspectRatio < SCANNER_DETECTION_CONFIG.minAspectRatio || input.aspectRatio > SCANNER_DETECTION_CONFIG.maxAspectRatio) return 0;
  if (input.horizontalCoverage > 0.82 || input.verticalCoverage > 0.82) return 0;
  if (centerY < 0.12 || centerY > 0.86) return 0;
  if (input.rectangularity < 0.52) return 0;

  return Number((
    areaScore * 0.2 +
    aspectScore * 0.26 +
    rectangularityScore * 0.18 +
    edgeScore * 0.12 +
    edgeDensityScore * 0.1 +
    centerScore * 0.08 +
    visibleScore * 0.06
  ).toFixed(3));
}

function analyzeFrameQuality(video: HTMLVideoElement, detection: CardDetection, previous: CardDetection | null, multipleCards: boolean): FrameQuality {
  const crop = boundsForQuad(detection.corners, video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 132;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return emptyQuality(["blur"]);
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const luma = new Float32Array(canvas.width * canvas.height);
  let sum = 0;
  let glare = 0;
  let veryDark = 0;
  let overexposed = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    luma[index / 4] = value;
    sum += value;
    if (value < 36) veryDark += 1;
    if (value > 245) overexposed += 1;
    if (value > 232 && Math.max(data[index], data[index + 1], data[index + 2]) - Math.min(data[index], data[index + 1], data[index + 2]) < 20) glare += 1;
  }
  const pixels = canvas.width * canvas.height;
  const brightnessScore = sum / pixels;
  let laplacianVariance = 0;
  let laplacianSum = 0;
  let laplacianCount = 0;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const i = y * canvas.width + x;
      const laplacian = luma[i - 1] + luma[i + 1] + luma[i - canvas.width] + luma[i + canvas.width] - 4 * luma[i];
      laplacianSum += laplacian;
      laplacianVariance += laplacian * laplacian;
      laplacianCount += 1;
    }
  }
  const blurScore = laplacianCount ? laplacianVariance / laplacianCount - (laplacianSum / laplacianCount) ** 2 : 0;
  const motionScore = previous ? averageCornerDistance(previous.corners, detection.corners) : 0;
  const glareRatio = glare / pixels;
  const blockers: QualityBlocker[] = [];
  if (blurScore < 95) blockers.push("blur");
  if (motionScore > SCANNER_DETECTION_CONFIG.maxStableMotionPx) blockers.push("motion");
  if (brightnessScore < 48 || veryDark / pixels > 0.45) blockers.push("dark");
  if (brightnessScore > 224 || overexposed / pixels > 0.32) blockers.push("overexposed");
  if (glareRatio > 0.18) blockers.push("glare");
  if (detection.areaRatio < SCANNER_DETECTION_CONFIG.minAreaRatio) blockers.push("too-small");
  if (detection.areaRatio > SCANNER_DETECTION_CONFIG.maxAreaRatio) blockers.push("too-large");
  if (!detection.corners.every((point) => point.x > 3 && point.y > 3 && point.x < video.videoWidth - 3 && point.y < video.videoHeight - 3)) blockers.push("cropped");
  if (multipleCards) blockers.push("multiple-cards");

  return {
    blurScore,
    brightnessScore,
    glareRatio,
    motionScore,
    allCornersVisible: !blockers.includes("cropped"),
    acceptable: blockers.length === 0,
    blockers
  };
}

function scannerStateForAnalysis(stable: boolean, progress: number, blockers: QualityBlocker[], multipleCards: boolean): ScannerState {
  if (multipleCards) return "quality-blocked";
  if (blockers.length) return "quality-blocked";
  if (stable && progress >= 1) return "capture-ready";
  if (stable) return "stabilizing";
  return "tracking";
}

function emptyQuality(blockers: QualityBlocker[]): FrameQuality {
  return {
    blurScore: 0,
    brightnessScore: 0,
    glareRatio: 0,
    motionScore: 0,
    allCornersVisible: false,
    acceptable: blockers.length === 0,
    blockers
  };
}

function analyzeCardReadiness(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return { ready: false, lowLight: false };

  const detectedCrop = detectCardBounds(video, video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 128;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { ready: false, lowLight: false };

  const crop = detectedCrop ?? centerCrop(video.videoWidth, video.videoHeight, 0.72, 0.78, -0.02);
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
  const ready = Boolean(detectedCrop) && mean > 55 && contrast > 28 && edgeScore > 12 && brightRatio > 0.06 && darkRatio < 0.48;
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
  const detectedCardCrop = detectCardBounds(image, image.width, image.height);
  if (detectedCardCrop) {
    const isolated = cropImage(image, detectedCardCrop.x, detectedCardCrop.y, detectedCardCrop.width, detectedCardCrop.height);
    variants.push(isolated);
    variants.push(await enhanceTextImage(isolated));
  }
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
    const guidedCardCrop = detectCardBounds(image, image.width, image.height) ?? centerCrop(image.width, image.height, 0.76, 0.82, -0.02);
    const guidedCard = cropImage(image, guidedCardCrop.x, guidedCardCrop.y, guidedCardCrop.width, guidedCardCrop.height);
    variants.push(guidedCard);
    variants.push(await enhanceTextImage(guidedCard));

    const cardImage = await loadImage(guidedCard);
    const titleCrop = regionCrop(cardImage.width, cardImage.height, 0.08, 0.03, 0.84, 0.2);
    const numberCrop = regionCrop(cardImage.width, cardImage.height, 0.02, 0.74, 0.62, 0.22);
    const lowerRightNumberCrop = regionCrop(cardImage.width, cardImage.height, 0.38, 0.74, 0.6, 0.22);
    const artTextCrop = regionCrop(cardImage.width, cardImage.height, 0.08, 0.12, 0.84, 0.62);
    variants.push(cropImage(cardImage, titleCrop.x, titleCrop.y, titleCrop.width, titleCrop.height));
    variants.push(cropImage(cardImage, numberCrop.x, numberCrop.y, numberCrop.width, numberCrop.height));
    variants.push(cropImage(cardImage, lowerRightNumberCrop.x, lowerRightNumberCrop.y, lowerRightNumberCrop.width, lowerRightNumberCrop.height));
    variants.push(cropImage(cardImage, artTextCrop.x, artTextCrop.y, artTextCrop.width, artTextCrop.height));
  }
  return variants;
}

function detectCardBounds(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const detection = detectCardCandidates(source, sourceWidth, sourceHeight)[0] ?? null;
  return detection ? boundsForQuad(detection.corners, sourceWidth, sourceHeight) : null;
}

function boundsForQuad(corners: Quad, maxWidth: number, maxHeight: number) {
  const minX = Math.max(0, Math.min(...corners.map((point) => point.x)));
  const minY = Math.max(0, Math.min(...corners.map((point) => point.y)));
  const maxX = Math.min(maxWidth, Math.max(...corners.map((point) => point.x)));
  const maxY = Math.min(maxHeight, Math.max(...corners.map((point) => point.y)));
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY))
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
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

async function enhanceTextImage(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    const adjusted = Math.max(0, Math.min(255, (luma - 128) * 1.45 + 128));
    data[index] = adjusted;
    data[index + 1] = adjusted;
    data[index + 2] = adjusted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.88);
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

function normalizeSetLabel(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokémon/gi, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
