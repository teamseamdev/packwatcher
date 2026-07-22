import sharp from "sharp";
import { calibrateInnerFrameFromLuminance } from "./calibration.ts";
import type { CenteringMethod, CenteringSide, MarginMeasurement } from "./types.ts";
import { CARD_ASPECT_RATIO } from "./geometry.ts";
import { orderQuadPoints, polygonArea, type Quad } from "../scanner/geometry.ts";

export type ServerCenteringProcessResult = {
  corners: Quad;
  correctedDataUrl: string;
  width: number;
  height: number;
  innerFrame: MarginMeasurement;
  method: CenteringMethod;
  detectionConfidence: number;
  referenceImageUsed: string | null;
  referenceRegistrationScore: number | null;
  blockers: string[];
};

type RawImage = {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
};

type Boundary = {
  corners: Quad;
  confidence: number;
  blockers: string[];
};

const PROCESS_MAX_DIMENSION = 1400;
const CORRECTED_HEIGHT = 1400;
const CORRECTED_WIDTH = Math.round(CORRECTED_HEIGHT * CARD_ASPECT_RATIO);

export async function processCenteringImage(input: {
  buffer: Buffer;
  mimeType?: string;
  side: CenteringSide;
  referenceImageUrl?: string | null;
}): Promise<ServerCenteringProcessResult> {
  const normalized = sharp(input.buffer, { failOn: "truncated" })
    .rotate()
    .resize({
      width: PROCESS_MAX_DIMENSION,
      height: PROCESS_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true
    });
  const { data, info } = await normalized
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw: RawImage = {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels
  };
  const boundary = detectCardBoundary(raw);
  if (boundary.confidence < 0.42 || boundary.blockers.includes("card-not-recognized")) {
    throw new Error("No card-like rectangle was recognized. Use a clearer photo or adjust corners manually.");
  }

  const crop = cropForBoundary(boundary.corners, raw.width, raw.height);
  const corrected = await sharp(input.buffer)
    .rotate()
    .resize({
      width: PROCESS_MAX_DIMENSION,
      height: PROCESS_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true
    })
    .extract(crop)
    .resize(CORRECTED_WIDTH, CORRECTED_HEIGHT, { fit: "fill" })
    .jpeg({ quality: 88 })
    .toBuffer();
  const { data: correctedData, info: correctedInfo } = await sharp(corrected)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const calibrated = calibrateInnerFrameFromLuminance({
    image: rgbaToLuminance({
      data: correctedData,
      width: correctedInfo.width,
      height: correctedInfo.height,
      channels: correctedInfo.channels
    }),
    side: input.side
  });

  return {
    corners: boundary.corners,
    correctedDataUrl: `data:image/jpeg;base64,${corrected.toString("base64")}`,
    width: raw.width,
    height: raw.height,
    innerFrame: calibrated.margins,
    method: input.side === "back" ? "template-aligned" : "generic-border",
    detectionConfidence: Math.min(1, boundary.confidence * 0.62 + calibrated.confidenceScore * 0.38),
    referenceImageUsed: null,
    referenceRegistrationScore: null,
    blockers: Array.from(new Set([...boundary.blockers, ...calibrated.blockers]))
  };
}

export function detectCardBoundary(raw: RawImage): Boundary {
  const luminance = rgbaToLuminance(raw);
  const sampleStep = Math.max(4, Math.round(Math.min(raw.width, raw.height) / 220));
  const centerValue = luminanceAt(luminance.data, luminance.width, Math.floor(luminance.width / 2), Math.floor(luminance.height / 2));
  let minX = raw.width;
  let minY = raw.height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  for (let y = 0; y < raw.height; y += sampleStep) {
    for (let x = 0; x < raw.width; x += sampleStep) {
      const value = luminanceAt(luminance.data, luminance.width, x, y);
      if (Math.abs(value - centerValue) > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }
  }

  if (!hits || minX >= maxX || minY >= maxY) {
    return {
      corners: defaultCorners(raw.width, raw.height),
      confidence: 0.2,
      blockers: ["card-not-recognized"]
    };
  }

  const padX = raw.width * 0.02;
  const padY = raw.height * 0.02;
  const corners = orderQuadPoints([
    { x: clamp(minX - padX, 0, raw.width), y: clamp(minY - padY, 0, raw.height) },
    { x: clamp(maxX + padX, 0, raw.width), y: clamp(minY - padY, 0, raw.height) },
    { x: clamp(maxX + padX, 0, raw.width), y: clamp(maxY + padY, 0, raw.height) },
    { x: clamp(minX - padX, 0, raw.width), y: clamp(maxY + padY, 0, raw.height) }
  ]);
  const score = scoreBoundary(corners, raw.width, raw.height);
  const blockers: string[] = [];
  if (score < 0.42) blockers.push("card-not-recognized");
  return { corners, confidence: score, blockers };
}

function scoreBoundary(corners: Quad, width: number, height: number) {
  const areaRatio = Math.abs(polygonArea(corners)) / Math.max(1, width * height);
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const boxWidth = Math.max(...xs) - Math.min(...xs);
  const boxHeight = Math.max(...ys) - Math.min(...ys);
  const aspect = Math.min(boxWidth, boxHeight) / Math.max(1, Math.max(boxWidth, boxHeight));
  const areaScore = areaRatio >= 0.16 && areaRatio <= 0.9 ? 1 - Math.abs(areaRatio - 0.48) / 0.48 : 0;
  const aspectScore = Math.max(0, 1 - Math.abs(aspect - CARD_ASPECT_RATIO) / 0.28);
  const visibilityScore = corners.every((point) => point.x > 2 && point.y > 2 && point.x < width - 2 && point.y < height - 2) ? 1 : 0.62;
  return clamp01(areaScore * 0.34 + aspectScore * 0.48 + visibilityScore * 0.18);
}

function cropForBoundary(corners: Quad, width: number, height: number) {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.floor(clamp(Math.min(...xs), 0, width - 1));
  const top = Math.floor(clamp(Math.min(...ys), 0, height - 1));
  const right = Math.ceil(clamp(Math.max(...xs), left + 1, width));
  const bottom = Math.ceil(clamp(Math.max(...ys), top + 1, height));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

function rgbaToLuminance(raw: RawImage) {
  const data = new Float32Array(raw.width * raw.height);
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const index = pixel * raw.channels;
    data[pixel] = raw.data[index] * 0.2126 + raw.data[index + 1] * 0.7152 + raw.data[index + 2] * 0.0722;
  }
  return { width: raw.width, height: raw.height, data };
}

function luminanceAt(data: ArrayLike<number>, width: number, x: number, y: number) {
  return data[y * width + x] ?? 0;
}

function defaultCorners(width: number, height: number): Quad {
  const insetX = width * 0.06;
  const insetY = height * 0.04;
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY }
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}
