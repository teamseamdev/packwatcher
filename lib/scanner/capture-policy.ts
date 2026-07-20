export type CapturePolicy = {
  requireStableDetection: boolean;
  minimumStableDurationMs: number;
  minimumStableFrames: number;
  minimumDetectionConfidence: number;
  minimumCardLikeness: number;
  minimumSharpness: number;
  maximumMotionScore: number;
  maximumGlareRatio: number;
  requireAllCornersVisible: boolean;
  allowFallbackCrop: boolean;
  allowUserOverride: boolean;
};

export type ReadinessFrame = {
  confidence: number;
  cardLikeness: number;
  blurScore: number;
  motionScore: number;
  glareRatio: number;
  allCornersVisible: boolean;
  cropped: boolean;
  multipleCards: boolean;
  timestamp: number;
};

export type AutoReadiness = {
  score: number;
  progress: number;
  captureAllowed: boolean;
  blockers: string[];
};

export const CAPTURE_POLICIES = {
  auto: {
    requireStableDetection: true,
    minimumStableDurationMs: 480,
    minimumStableFrames: 3,
    minimumDetectionConfidence: 0.6,
    minimumCardLikeness: 0.58,
    minimumSharpness: 70,
    maximumMotionScore: 28,
    maximumGlareRatio: 0.24,
    requireAllCornersVisible: true,
    allowFallbackCrop: false,
    allowUserOverride: false
  },
  manual: {
    requireStableDetection: false,
    minimumStableDurationMs: 0,
    minimumStableFrames: 0,
    minimumDetectionConfidence: 0.34,
    minimumCardLikeness: 0.3,
    minimumSharpness: 32,
    maximumMotionScore: 999,
    maximumGlareRatio: 0.38,
    requireAllCornersVisible: false,
    allowFallbackCrop: true,
    allowUserOverride: true
  },
  manualFallback: {
    requireStableDetection: false,
    minimumStableDurationMs: 0,
    minimumStableFrames: 0,
    minimumDetectionConfidence: 0,
    minimumCardLikeness: 0,
    minimumSharpness: 18,
    maximumMotionScore: 999,
    maximumGlareRatio: 0.5,
    requireAllCornersVisible: false,
    allowFallbackCrop: true,
    allowUserOverride: true
  }
} satisfies Record<string, CapturePolicy>;

export function computeAutoReadiness(input: {
  policy?: CapturePolicy;
  frames: ReadinessFrame[];
  previousProgress: number;
  prepared: boolean;
  activeScan: boolean;
  armed: boolean;
}): AutoReadiness {
  const policy = input.policy ?? CAPTURE_POLICIES.auto;
  const latest = input.frames.at(-1);
  const blockers: string[] = [];
  if (!input.prepared) blockers.push("set-not-ready");
  if (input.activeScan) blockers.push("active-scan");
  if (!input.armed) blockers.push("same-card-blocked");
  if (!latest) blockers.push("no-card");
  if (latest?.multipleCards) blockers.push("multiple-cards");
  if (latest?.cropped && policy.requireAllCornersVisible) blockers.push("cropped");

  if (!latest || blockers.length) {
    return { score: 0, progress: 0, captureAllowed: false, blockers };
  }

  const recent = input.frames.slice(-8);
  const validFrames = recent.filter((frame) =>
    frame.confidence >= policy.minimumDetectionConfidence &&
    frame.cardLikeness >= policy.minimumCardLikeness &&
    frame.glareRatio <= policy.maximumGlareRatio &&
    (!policy.requireAllCornersVisible || frame.allCornersVisible)
  );
  const firstValid = validFrames[0];
  const stableDuration = firstValid ? latest.timestamp - firstValid.timestamp : 0;
  const confidence = average(recent.map((frame) => frame.confidence));
  const cardLikeness = average(recent.map((frame) => frame.cardLikeness));
  const sharpness = clamp01(average(recent.map((frame) => frame.blurScore)) / Math.max(1, policy.minimumSharpness * 1.8));
  const motion = clamp01(1 - median(recent.map((frame) => frame.motionScore)) / Math.max(1, policy.maximumMotionScore));
  const glare = clamp01(1 - median(recent.map((frame) => frame.glareRatio)) / Math.max(0.01, policy.maximumGlareRatio));
  const consistency = clamp01(validFrames.length / Math.max(1, policy.minimumStableFrames + 2));
  const duration = clamp01(stableDuration / Math.max(1, policy.minimumStableDurationMs));
  const score = clamp01(
    confidence * 0.24 +
    cardLikeness * 0.2 +
    sharpness * 0.12 +
    motion * 0.14 +
    glare * 0.1 +
    consistency * 0.12 +
    duration * 0.08
  );
  const progress = score >= 0.5 ? Math.min(1, input.previousProgress * 0.75 + score * 0.35) : Math.max(0, input.previousProgress * 0.7);
  const captureAllowed =
    progress >= 0.78 &&
    score >= 0.68 &&
    validFrames.length >= policy.minimumStableFrames &&
    stableDuration >= policy.minimumStableDurationMs * 0.7;

  return { score, progress, captureAllowed, blockers };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
