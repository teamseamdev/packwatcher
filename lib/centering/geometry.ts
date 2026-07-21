import { distance, polygonArea, type Point, type Quad } from "../scanner/geometry.ts";
import type { CenteringConfidence, CenteringMeasurementInput, CenteringSideResult, DirectionalCenteringRatio, DisplayRatio, MarginMeasurement } from "./types.ts";

export const CENTERING_ENGINE_VERSION = "centering-v1.0.0";
export const CARD_ASPECT_RATIO = 63 / 88;
const MIN_MARGIN = 0.005;

export function normalizeDisplayRatio(firstSide: number, secondSide: number): DisplayRatio {
  const total = firstSide + secondSide;
  if (!Number.isFinite(total) || total <= 0) return { first: 0, second: 0 };
  const first = firstSide / total * 100;
  const second = secondSide / total * 100;
  const smaller = Math.min(first, second);
  const larger = Math.max(first, second);
  return { first: Math.round(larger), second: Math.round(smaller) };
}

export function directionalRatio(margins: MarginMeasurement): DirectionalCenteringRatio {
  const horizontal = margins.left + margins.right;
  const vertical = margins.top + margins.bottom;
  return {
    left: percent(margins.left, horizontal),
    right: percent(margins.right, horizontal),
    top: percent(margins.top, vertical),
    bottom: percent(margins.bottom, vertical)
  };
}

export function ratioText(ratio: DisplayRatio) {
  return `${ratio.first}/${ratio.second}`;
}

export function analyzeCenteringSide(input: CenteringMeasurementInput): CenteringSideResult {
  const outerQuality = outerCornerQuality(input.outerCorners, input.imageSize);
  const margins = normalizeMargins(input.innerFramePercent);
  const directional = directionalRatio(margins);
  const horizontalRatio = normalizeDisplayRatio(margins.left, margins.right);
  const verticalRatio = normalizeDisplayRatio(margins.top, margins.bottom);
  const blockers = [...(input.blockers ?? [])];
  if (outerQuality.blocker) blockers.push(outerQuality.blocker);
  if (Math.min(margins.left, margins.right, margins.top, margins.bottom) < 0.015) blockers.push("inner-border-not-detected");
  const confidenceScore = confidenceScoreFor({
    outerQuality: outerQuality.score,
    detectionConfidence: input.detectionConfidence,
    userAdjusted: input.userAdjusted,
    blockers,
    horizontalSkew: horizontalRatio.first,
    verticalSkew: verticalRatio.first
  });

  return {
    side: input.side,
    outerCorners: input.outerCorners,
    innerFrame: margins,
    margins,
    directionalRatio: directional,
    horizontalRatio,
    verticalRatio,
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    blockers: Array.from(new Set(blockers)),
    method: input.userAdjusted ? "manual" : input.method ?? (input.side === "back" ? "template-aligned" : "generic-border"),
    referenceImageUsed: input.referenceImageUsed ?? null,
    referenceRegistrationScore: input.referenceRegistrationScore ?? null,
    userAdjusted: input.userAdjusted,
    engineVersion: CENTERING_ENGINE_VERSION
  };
}

export function recommendationFor(front: CenteringSideResult | null, back: CenteringSideResult | null) {
  const sides = [front, back].filter(Boolean) as CenteringSideResult[];
  if (!sides.length || sides.some((side) => side.confidence === "low")) return "retake" as const;
  const worst = Math.max(...sides.flatMap((side) => [side.horizontalRatio.first, side.verticalRatio.first]));
  if (worst <= 52) return "excellent" as const;
  if (worst <= 55) return "strong" as const;
  if (worst <= 60) return "acceptable" as const;
  return "off_center" as const;
}

export function overallConfidence(front: CenteringSideResult | null, back: CenteringSideResult | null): CenteringConfidence {
  const scores = [front?.confidenceScore, back?.confidenceScore].filter((score): score is number => typeof score === "number");
  if (!scores.length) return "low";
  return confidenceLabel(Math.min(...scores));
}

export function marginLinesFromPercent(margins: MarginMeasurement, width: number, height: number) {
  return {
    leftX: margins.left * width,
    rightX: width - margins.right * width,
    topY: margins.top * height,
    bottomY: height - margins.bottom * height
  };
}

function normalizeMargins(margins: MarginMeasurement): MarginMeasurement {
  return {
    left: clampMargin(margins.left),
    right: clampMargin(margins.right),
    top: clampMargin(margins.top),
    bottom: clampMargin(margins.bottom)
  };
}

function clampMargin(value: number) {
  if (!Number.isFinite(value)) return 0.08;
  return Math.min(0.4, Math.max(MIN_MARGIN, value));
}

function percent(value: number, total: number) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return value / total * 100;
}

function outerCornerQuality(corners: Quad, imageSize: { width: number; height: number }) {
  const area = Math.abs(polygonArea(corners));
  const imageArea = imageSize.width * imageSize.height;
  const areaRatio = imageArea > 0 ? area / imageArea : 0;
  const top = distance(corners[0], corners[1]);
  const right = distance(corners[1], corners[2]);
  const bottom = distance(corners[2], corners[3]);
  const left = distance(corners[3], corners[0]);
  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  const aspect = width > 0 && height > 0 ? Math.min(width, height) / Math.max(width, height) : 0;
  let score = 1;
  let blocker: string | null = null;
  if (areaRatio < 0.18) {
    score -= 0.25;
    blocker = "card-too-small";
  }
  if (areaRatio > 0.92) {
    score -= 0.25;
    blocker = "card-cropped";
  }
  if (Math.abs(aspect - CARD_ASPECT_RATIO) > 0.18) {
    score -= 0.18;
    blocker = blocker ?? "severe-perspective";
  }
  if (corners.some((point) => pointOutside(point, imageSize))) {
    score -= 0.3;
    blocker = blocker ?? "card-cropped";
  }
  return { score: Math.max(0, score), blocker };
}

function pointOutside(point: Point, imageSize: { width: number; height: number }) {
  const buffer = 2;
  return point.x < -buffer || point.y < -buffer || point.x > imageSize.width + buffer || point.y > imageSize.height + buffer;
}

function confidenceScoreFor(input: { outerQuality: number; detectionConfidence?: number; userAdjusted: boolean; blockers: string[]; horizontalSkew: number; verticalSkew: number }) {
  let score = input.detectionConfidence !== undefined
    ? input.outerQuality * 0.55 + input.detectionConfidence * 0.45
    : input.outerQuality;
  if (input.userAdjusted) score -= 0.04;
  score -= Math.min(0.35, input.blockers.length * 0.08);
  if (input.horizontalSkew > 65 || input.verticalSkew > 65) score -= 0.08;
  return Math.max(0, Math.min(1, score));
}

function confidenceLabel(score: number): CenteringConfidence {
  if (score >= 0.78) return "high";
  if (score >= 0.52) return "medium";
  return "low";
}
