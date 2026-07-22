import type { CenteringConfidence, CenteringSide, MarginMeasurement } from "./types.ts";

export type LuminanceImage = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

export type CenteringCalibrationResult = {
  margins: MarginMeasurement;
  confidence: CenteringConfidence;
  confidenceScore: number;
  blockers: string[];
  measuredEdges: {
    left: EdgeCandidate | null;
    right: EdgeCandidate | null;
    top: EdgeCandidate | null;
    bottom: EdgeCandidate | null;
  };
};

type EdgeCandidate = {
  position: number;
  strength: number;
  localContrast: number;
};

type SearchRange = {
  min: number;
  max: number;
};

type CalibrationProfile = {
  left: SearchRange;
  right: SearchRange;
  top: SearchRange;
  bottom: SearchRange;
  minimumContrast: number;
  fallback: MarginMeasurement;
};

const FRONT_PROFILE: CalibrationProfile = {
  left: { min: 0.035, max: 0.26 },
  right: { min: 0.035, max: 0.26 },
  top: { min: 0.035, max: 0.28 },
  bottom: { min: 0.04, max: 0.32 },
  minimumContrast: 8.5,
  fallback: { left: 0.085, right: 0.085, top: 0.1, bottom: 0.105 }
};

const BACK_PROFILE: CalibrationProfile = {
  left: { min: 0.06, max: 0.32 },
  right: { min: 0.06, max: 0.32 },
  top: { min: 0.06, max: 0.3 },
  bottom: { min: 0.06, max: 0.3 },
  minimumContrast: 7,
  fallback: { left: 0.13, right: 0.13, top: 0.11, bottom: 0.11 }
};

export function calibrateInnerFrameFromRgba(input: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  side: CenteringSide;
  referenceMargins?: MarginMeasurement | null;
}): CenteringCalibrationResult {
  const luminance = new Float32Array(input.width * input.height);
  let veryDark = 0;
  let overexposed = 0;
  let glareLike = 0;
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const index = pixel * 4;
    const red = input.data[index];
    const green = input.data[index + 1];
    const blue = input.data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const value = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    luminance[pixel] = value;
    if (value < 32) veryDark += 1;
    if (value > 246) overexposed += 1;
    if (value > 230 && max - min < 18) glareLike += 1;
  }

  const result = calibrateInnerFrameFromLuminance({
    image: { width: input.width, height: input.height, data: luminance },
    side: input.side,
    referenceMargins: input.referenceMargins
  });

  const pixels = Math.max(1, input.width * input.height);
  const blockers = [...result.blockers];
  if (veryDark / pixels > 0.34) blockers.push("low-light");
  if (overexposed / pixels > 0.28) blockers.push("overexposed");
  if (glareLike / pixels > 0.16) blockers.push("glare");

  return {
    ...result,
    blockers: Array.from(new Set(blockers)),
    confidenceScore: scoreWithBlockers(result.confidenceScore, blockers),
    confidence: confidenceLabel(scoreWithBlockers(result.confidenceScore, blockers))
  };
}

export function calibrateInnerFrameFromLuminance(input: {
  image: LuminanceImage;
  side: CenteringSide;
  referenceMargins?: MarginMeasurement | null;
}): CenteringCalibrationResult {
  const profile = input.side === "back" ? BACK_PROFILE : FRONT_PROFILE;
  const verticalProfile = buildVerticalEdgeProfile(input.image, 0.18, 0.82);
  const horizontalProfile = buildHorizontalEdgeProfile(input.image, 0.18, 0.82);
  const left = findEdgeFromSide(verticalProfile, input.image.width, profile.left, "start", profile.minimumContrast);
  const right = findEdgeFromSide(verticalProfile, input.image.width, profile.right, "end", profile.minimumContrast);
  const top = findEdgeFromSide(horizontalProfile, input.image.height, profile.top, "start", profile.minimumContrast);
  const bottom = findEdgeFromSide(horizontalProfile, input.image.height, profile.bottom, "end", profile.minimumContrast);
  const blockers: string[] = [];

  let margins: MarginMeasurement = {
    left: left?.position ?? profile.fallback.left,
    right: right?.position ?? profile.fallback.right,
    top: top?.position ?? profile.fallback.top,
    bottom: bottom?.position ?? profile.fallback.bottom
  };

  const missingEdges = [left, right, top, bottom].filter((edge) => !edge).length;
  if (missingEdges) blockers.push("inner-border-not-detected");

  if (input.referenceMargins) {
    const referenceAgreement = marginAgreementScore(margins, input.referenceMargins);
    if (missingEdges >= 2 || referenceAgreement < 0.52) {
      margins = blendMargins(margins, input.referenceMargins, missingEdges >= 2 ? 0.62 : 0.32);
      blockers.push(missingEdges >= 2 ? "reference-guided-frame" : "reference-frame-adjusted");
    }
  }

  const edgeConfidence = edgeConfidenceScore([left, right, top, bottom], profile.minimumContrast);
  const symmetryConfidence = symmetryScore(margins);
  const confidenceScore = scoreWithBlockers(edgeConfidence * 0.72 + symmetryConfidence * 0.28, blockers);

  return {
    margins,
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    blockers: Array.from(new Set(blockers)),
    measuredEdges: { left, right, top, bottom }
  };
}

function buildVerticalEdgeProfile(image: LuminanceImage, yStartPercent: number, yEndPercent: number) {
  const yStart = Math.max(1, Math.floor(image.height * yStartPercent));
  const yEnd = Math.min(image.height - 2, Math.ceil(image.height * yEndPercent));
  const profile = new Float32Array(image.width);
  for (let x = 1; x < image.width - 1; x += 1) {
    let total = 0;
    let count = 0;
    for (let y = yStart; y <= yEnd; y += 2) {
      const index = y * image.width + x;
      total += Math.abs(image.data[index + 1] - image.data[index - 1]);
      count += 1;
    }
    profile[x] = count ? total / count : 0;
  }
  return smoothProfile(profile, Math.max(2, Math.round(image.width / 260)));
}

function buildHorizontalEdgeProfile(image: LuminanceImage, xStartPercent: number, xEndPercent: number) {
  const xStart = Math.max(1, Math.floor(image.width * xStartPercent));
  const xEnd = Math.min(image.width - 2, Math.ceil(image.width * xEndPercent));
  const profile = new Float32Array(image.height);
  for (let y = 1; y < image.height - 1; y += 1) {
    let total = 0;
    let count = 0;
    for (let x = xStart; x <= xEnd; x += 2) {
      const index = y * image.width + x;
      total += Math.abs(image.data[index + image.width] - image.data[index - image.width]);
      count += 1;
    }
    profile[y] = count ? total / count : 0;
  }
  return smoothProfile(profile, Math.max(2, Math.round(image.height / 320)));
}

function findEdgeFromSide(profile: Float32Array, length: number, marginRange: SearchRange, side: "start" | "end", minimumContrast: number): EdgeCandidate | null {
  const start = Math.max(1, Math.floor(length * marginRange.min));
  const end = Math.min(length - 2, Math.ceil(length * marginRange.max));
  let bestIndex = -1;
  let bestStrength = 0;
  const background = median(Array.from(profile.slice(Math.max(1, Math.floor(length * 0.34)), Math.min(length - 2, Math.floor(length * 0.66)))));

  for (let distanceFromSide = start; distanceFromSide <= end; distanceFromSide += 1) {
    const actualIndex = side === "start" ? distanceFromSide : length - distanceFromSide;
    const strength = profile[actualIndex];
    const distanceBias = 1 - (distanceFromSide - start) / Math.max(1, end - start) * 0.12;
    const weighted = strength * distanceBias;
    if (weighted > bestStrength) {
      bestStrength = weighted;
      bestIndex = actualIndex;
    }
  }

  if (bestIndex < 0) return null;
  const localContrast = bestStrength - background;
  if (localContrast < minimumContrast) return null;
  return {
    position: side === "start" ? bestIndex / length : (length - bestIndex) / length,
    strength: bestStrength,
    localContrast
  };
}

function smoothProfile(profile: Float32Array, radius: number) {
  const output = new Float32Array(profile.length);
  for (let index = 0; index < profile.length; index += 1) {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const next = index + offset;
      if (next < 0 || next >= profile.length) continue;
      total += profile[next];
      count += 1;
    }
    output[index] = count ? total / count : profile[index];
  }
  return output;
}

function edgeConfidenceScore(edges: Array<EdgeCandidate | null>, minimumContrast: number) {
  const present = edges.filter((edge): edge is EdgeCandidate => Boolean(edge));
  if (!present.length) return 0.22;
  const completeness = present.length / 4;
  const contrast = present.reduce((sum, edge) => sum + Math.min(1, edge.localContrast / (minimumContrast * 3.2)), 0) / present.length;
  return completeness * 0.62 + contrast * 0.38;
}

function symmetryScore(margins: MarginMeasurement) {
  const horizontal = ratioSkew(margins.left, margins.right);
  const vertical = ratioSkew(margins.top, margins.bottom);
  return clamp01(1 - Math.max(horizontal, vertical) / 0.72);
}

function ratioSkew(first: number, second: number) {
  const total = first + second;
  if (total <= 0) return 1;
  return Math.abs(first - second) / total;
}

function marginAgreementScore(left: MarginMeasurement, right: MarginMeasurement) {
  const delta =
    Math.abs(left.left - right.left) +
    Math.abs(left.right - right.right) +
    Math.abs(left.top - right.top) +
    Math.abs(left.bottom - right.bottom);
  return clamp01(1 - delta / 0.28);
}

function blendMargins(measured: MarginMeasurement, reference: MarginMeasurement, referenceWeight: number): MarginMeasurement {
  const measuredWeight = 1 - referenceWeight;
  return {
    left: measured.left * measuredWeight + reference.left * referenceWeight,
    right: measured.right * measuredWeight + reference.right * referenceWeight,
    top: measured.top * measuredWeight + reference.top * referenceWeight,
    bottom: measured.bottom * measuredWeight + reference.bottom * referenceWeight
  };
}

function scoreWithBlockers(score: number, blockers: string[]) {
  const severe = new Set(["low-light", "overexposed", "glare", "inner-border-not-detected"]);
  const penalty = blockers.reduce((sum, blocker) => sum + (severe.has(blocker) ? 0.1 : 0.045), 0);
  return clamp01(score - Math.min(0.38, penalty));
}

function confidenceLabel(score: number): CenteringConfidence {
  if (score >= 0.78) return "high";
  if (score >= 0.52) return "medium";
  return "low";
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
