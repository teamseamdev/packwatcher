import type { VideoRipFrameSample } from "@/lib/video-rip/types";

export type VideoRegionPercent = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VideoPixelRegion = VideoRegionPercent;

export type PhysicalCardMotionResult = {
  independentMotionScore: number;
  rigidPlanarScore: number;
  entersFrame: boolean;
  exitsFrame: boolean;
  backgroundOcclusionScore: number;
  attachedToPackagingScore: number;
  validLooseCardBehavior: boolean;
  rejectionReasons: string[];
};

export function percentRegionToPixels(region: VideoRegionPercent, frame: { width: number; height: number }): VideoPixelRegion {
  return {
    x: region.x / 100 * frame.width,
    y: region.y / 100 * frame.height,
    width: region.width / 100 * frame.width,
    height: region.height / 100 * frame.height
  };
}

export function cropLumaToRegion(input: { luma: Uint8Array; width: number; height: number }, region: VideoPixelRegion) {
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(input.width, Math.ceil(region.x + region.width));
  const y1 = Math.min(input.height, Math.ceil(region.y + region.height));
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const luma = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      luma[y * width + x] = input.luma[(y0 + y) * input.width + (x0 + x)] ?? 0;
    }
  }
  return { luma, width, height, offsetX: x0, offsetY: y0 };
}

export function regionOverlapRatio(region: VideoPixelRegion | null | undefined, target: VideoPixelRegion | null | undefined) {
  if (!region || !target) return 0;
  const x0 = Math.max(region.x, target.x);
  const y0 = Math.max(region.y, target.y);
  const x1 = Math.min(region.x + region.width, target.x + target.width);
  const y1 = Math.min(region.y + region.height, target.y + target.height);
  const overlap = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return overlap / Math.max(1, region.width * region.height);
}

export function evaluatePhysicalCardMotion(input: {
  currentBounds: VideoPixelRegion | null | undefined;
  previousBounds?: VideoPixelRegion | null;
  currentFingerprint?: string | null;
  previousFingerprint?: string | null;
  revealZoneHit: boolean;
  exclusionZoneHit: boolean;
  looseCardConfidence: number;
  cropScore: number;
  frameWidth: number;
  frameHeight: number;
}): PhysicalCardMotionResult {
  const rejectionReasons: string[] = [];
  if (!input.currentBounds) rejectionReasons.push("no-card-crop");
  if (!input.revealZoneHit) rejectionReasons.push("outside-reveal-zone");
  if (input.exclusionZoneHit) rejectionReasons.push("inside-exclusion-zone");

  const motion = input.currentBounds && input.previousBounds
    ? normalizedRegionMotion(input.currentBounds, input.previousBounds, input.frameWidth, input.frameHeight)
    : 0;
  const visualChange = fingerprintDistance(input.currentFingerprint, input.previousFingerprint) / 64;
  const independentMotionScore = clamp01(motion * 2.2 + visualChange * 0.45);
  const attachedToPackagingScore = input.exclusionZoneHit ? 1 : clamp01((motion < 0.012 && visualChange < 0.08 ? 0.64 : 0.15) - Math.max(0, input.cropScore - 0.72) * 0.45);
  const rigidPlanarScore = clamp01(input.cropScore * 0.72 + input.looseCardConfidence * 0.28);
  const entersFrame = Boolean(input.currentBounds && nearFrameEdge(input.currentBounds, input.frameWidth, input.frameHeight));
  const validLooseCardBehavior = (
    Boolean(input.currentBounds) &&
    input.revealZoneHit &&
    !input.exclusionZoneHit &&
    rigidPlanarScore >= 0.56 &&
    attachedToPackagingScore < 0.72 &&
    (independentMotionScore >= 0.018 || input.looseCardConfidence >= 0.78 || input.cropScore >= 0.76)
  );
  if (!validLooseCardBehavior && !rejectionReasons.length) {
    if (attachedToPackagingScore >= 0.72) rejectionReasons.push("attached-to-packaging");
    else rejectionReasons.push("weak-physical-card-behavior");
  }

  return {
    independentMotionScore: round(independentMotionScore),
    rigidPlanarScore: round(rigidPlanarScore),
    entersFrame,
    exitsFrame: false,
    backgroundOcclusionScore: round(clamp01(independentMotionScore * 0.75 + (input.revealZoneHit ? 0.18 : 0))),
    attachedToPackagingScore: round(attachedToPackagingScore),
    validLooseCardBehavior,
    rejectionReasons
  };
}

export function canCreateAutomaticCardTrack(sample: VideoRipFrameSample) {
  if (sample.looseCardStatus !== "verified") return { allowed: false, reason: "no_verified_loose_card" as const };
  if (!sample.revealZoneHit) return { allowed: false, reason: "outside_reveal_zone" as const };
  if (sample.exclusionZoneHit) return { allowed: false, reason: "inside_exclusion_zone" as const };
  if (!sample.physicalCardMotion?.validLooseCardBehavior) return { allowed: false, reason: "invalid_physical_card_motion" as const };
  return { allowed: true, reason: "verified_loose_card_track_input" as const };
}

function normalizedRegionMotion(current: VideoPixelRegion, previous: VideoPixelRegion, frameWidth: number, frameHeight: number) {
  const currentCenterX = current.x + current.width / 2;
  const currentCenterY = current.y + current.height / 2;
  const previousCenterX = previous.x + previous.width / 2;
  const previousCenterY = previous.y + previous.height / 2;
  const centerMotion = Math.hypot((currentCenterX - previousCenterX) / frameWidth, (currentCenterY - previousCenterY) / frameHeight);
  const areaMotion = Math.abs((current.width * current.height) - (previous.width * previous.height)) / Math.max(1, frameWidth * frameHeight);
  return centerMotion + areaMotion;
}

function fingerprintDistance(left?: string | null, right?: string | null) {
  if (!left || !right || left.length !== right.length) return 0;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

function nearFrameEdge(region: VideoPixelRegion, width: number, height: number) {
  const marginX = width * 0.04;
  const marginY = height * 0.04;
  return region.x <= marginX || region.y <= marginY || region.x + region.width >= width - marginX || region.y + region.height >= height - marginY;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
