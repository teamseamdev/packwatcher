export type VideoRipStage =
  | "idle"
  | "preparing"
  | "extracting"
  | "detecting-packs"
  | "finding-cards"
  | "recognizing"
  | "pricing"
  | "report-ready"
  | "failed";

export type VideoAnalysisOutcome =
  | "complete"
  | "partial"
  | "needs-review"
  | "decode-failed"
  | "no-card-windows"
  | "recognition-failed"
  | "cancelled";

export type VideoDecodeStatus =
  | "supported"
  | "black-frames"
  | "frozen-frame"
  | "canvas-empty"
  | "seek-failed"
  | "unsupported-codec"
  | "unknown";

export type VideoRipFrameSample = {
  id: string;
  timestamp: number;
  imageDataUrl: string;
  cardCropDataUrl?: string | null;
  cardCropBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  cardCropScore?: number | null;
  cardCropReason?: string | null;
  brightness: number;
  sharpness: number;
  edgeDensity: number;
  motionScore: number;
  coverageScore: number;
  glareScore: number;
  cardLikeScore: number;
  qualityScore: number;
  visualFingerprint?: string | null;
};

export type VideoRipCardWindow = {
  id: string;
  packId: string;
  firstAppearance: number;
  bestFrameTimestamp: number;
  lastAppearance: number;
  bestFrame: VideoRipFrameSample;
  alternateFrames: VideoRipFrameSample[];
  qualityScore: number;
};

export type VideoRipRecognitionCard = {
  id: string;
  packId: string;
  canonicalCardId: string | null;
  canonicalSetId: string | null;
  cardName: string;
  setName: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  variant: string | null;
  language: string | null;
  price: number;
  confidence: number;
  firstAppearance: number;
  bestFrameTimestamp: number;
  lastAppearance: number;
  thumbnailDataUrl: string | null;
  referenceImageUrl: string | null;
  recognitionSource: string;
  pricingSource: string;
  notes: string | null;
  selected: boolean;
  needsReview?: boolean;
};

export type VideoRipPack = {
  id: string;
  packNumber: number;
  start: number;
  end: number;
  cards: VideoRipRecognitionCard[];
  totalValue: number;
  highestValue: number;
  duplicateCount: number;
};

export type VideoRipTimelineEvent = {
  id: string;
  timestamp: number;
  label: string;
  type: "intro" | "pack-start" | "card" | "pack-end" | "summary";
  packId?: string;
  cardId?: string;
};

export type VideoRipReport = {
  id: string;
  fileName: string;
  setId: string;
  setName: string;
  duration: number;
  createdAt: string;
  packs: VideoRipPack[];
  timeline: VideoRipTimelineEvent[];
  cards: VideoRipRecognitionCard[];
  totalValue: number;
  averagePackValue: number;
  highestPull: VideoRipRecognitionCard | null;
  frameCount: number;
  analyzedFrameCount: number;
  outcome: VideoAnalysisOutcome;
  reviewItemCount: number;
  diagnostics?: VideoRipDiagnostics;
};

export type VideoRipDiagnostics = {
  decodeStatus: VideoDecodeStatus;
  decodePath: "native" | "webcodecs" | "ffmpeg" | "unavailable";
  duration: number;
  width: number;
  height: number;
  probeFrames: number;
  sampledFrames: number;
  visibleFrames: number;
  blackFrames: number;
  frozenFrames: boolean;
  cardLikeFrames: number;
  cardWindows: number;
  recognitionAttempts: number;
  identifiedCards: number;
  reviewItems: number;
  skippedWindows: number;
  rejectionReasons: Record<string, number>;
};
