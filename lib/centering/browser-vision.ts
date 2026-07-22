import { CARD_ASPECT_RATIO } from "./geometry.ts";
import { calibrateInnerFrameFromRgba } from "./calibration.ts";
import type { CenteringMethod, CenteringSide, MarginMeasurement } from "./types.ts";
import type { Point, Quad } from "../scanner/geometry.ts";
import { orderQuadPoints, polygonArea } from "../scanner/geometry.ts";

type OpenCv = Record<string, any>;

export type CenteringVisionResult = {
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

const OPENCV_SCRIPT_ID = "packwatcher-opencv-js";
const OPENCV_URL = "https://docs.opencv.org/4.x/opencv.js";
let openCvPromise: Promise<OpenCv | null> | null = null;

export async function analyzeCenteringPhoto(input: {
  dataUrl: string;
  side: CenteringSide;
  width: number;
  height: number;
  referenceImageUrl?: string | null;
}): Promise<CenteringVisionResult> {
  const image = await loadImage(input.dataUrl);
  const analysisSize = fitImageSize(input.width, input.height, 1200);
  const canvas = imageToCanvas(image, analysisSize.width, analysisSize.height);
  const cv = await loadOpenCv();
  const blockers: string[] = [];
  let corners: Quad | null = null;
  let detectionConfidence = 0.55;

  if (cv) {
    try {
      const detected = detectCardBoundaryOpenCv(cv, canvas);
      if (detected) {
        corners = detected.corners;
        detectionConfidence = detected.confidence;
      }
    } catch {
      blockers.push("opencv-detection-failed");
    }
  } else {
    blockers.push("opencv-unavailable");
  }

  if (!corners) {
    const fallback = detectCardBoundaryFallback(canvas);
    corners = fallback.corners;
    detectionConfidence = fallback.confidence;
    blockers.push("fallback-boundary-detection");
  }

  let correctedDataUrl = input.dataUrl;
  if (cv) {
    try {
      correctedDataUrl = perspectiveCorrectOpenCv(cv, canvas, corners);
    } catch {
      blockers.push("perspective-correction-fallback");
      correctedDataUrl = cropBoundingBox(canvas, corners);
    }
  } else {
    correctedDataUrl = cropBoundingBox(canvas, corners);
  }

  const correctedImage = await loadImage(correctedDataUrl);
  const correctedCanvas = imageToCanvas(correctedImage, correctedImage.naturalWidth || correctedImage.width, correctedImage.naturalHeight || correctedImage.height);
  const reference = input.referenceImageUrl && input.side === "front"
    ? await estimateReferenceMargins(input.referenceImageUrl)
    : null;
  const calibrated = estimateInnerMarginsFromImage(
    correctedCanvas,
    input.side,
    reference?.margins ?? null
  );
  blockers.push(...calibrated.blockers);

  return {
    corners,
    correctedDataUrl,
    width: analysisSize.width,
    height: analysisSize.height,
    innerFrame: calibrated.margins,
    method: reference ? "reference-aligned" : input.side === "back" ? "template-aligned" : "generic-border",
    detectionConfidence: Math.min(1, detectionConfidence * 0.64 + calibrated.confidenceScore * 0.36),
    referenceImageUsed: reference?.url ?? null,
    referenceRegistrationScore: reference?.score ?? null,
    blockers: Array.from(new Set(blockers))
  };
}

export function detectCardBoundaryFallback(canvas: HTMLCanvasElement): { corners: Quad; confidence: number } {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { corners: defaultCorners(canvas.width, canvas.height), confidence: 0.4 };
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  const sample = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) / 180));
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  const center = luminanceAt(data.data, canvas.width, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
  for (let y = 0; y < canvas.height; y += sample) {
    for (let x = 0; x < canvas.width; x += sample) {
      const lum = luminanceAt(data.data, canvas.width, x, y);
      if (Math.abs(lum - center) > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX >= maxX || minY >= maxY) return { corners: defaultCorners(canvas.width, canvas.height), confidence: 0.35 };
  const padX = canvas.width * 0.025;
  const padY = canvas.height * 0.025;
  const corners = orderQuadPoints([
    { x: clamp(minX - padX, 0, canvas.width), y: clamp(minY - padY, 0, canvas.height) },
    { x: clamp(maxX + padX, 0, canvas.width), y: clamp(minY - padY, 0, canvas.height) },
    { x: clamp(maxX + padX, 0, canvas.width), y: clamp(maxY + padY, 0, canvas.height) },
    { x: clamp(minX - padX, 0, canvas.width), y: clamp(maxY + padY, 0, canvas.height) }
  ]);
  const areaRatio = Math.abs(polygonArea(corners)) / (canvas.width * canvas.height);
  return { corners, confidence: areaRatio > 0.2 && areaRatio < 0.9 ? 0.58 : 0.42 };
}

export function estimateInnerMarginsFromImage(canvas: HTMLCanvasElement, side: CenteringSide, referenceMargins?: MarginMeasurement | null) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const fallback = side === "back" ? { left: 0.13, right: 0.13, top: 0.11, bottom: 0.11 } : { left: 0.085, right: 0.085, top: 0.1, bottom: 0.105 };
  if (!context) return { margins: fallback, confidenceScore: 0.35, blockers: ["canvas-unavailable"] };
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return calibrateInnerFrameFromRgba({
    data: data.data,
    width: canvas.width,
    height: canvas.height,
    side,
    referenceMargins
  });
}

async function loadOpenCv(): Promise<OpenCv | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const existing = (window as any).cv;
  if (existing?.Mat) return existing;
  if (openCvPromise) return openCvPromise;

  openCvPromise = new Promise((resolve) => {
    const already = document.getElementById(OPENCV_SCRIPT_ID) as HTMLScriptElement | null;
    const script = already ?? document.createElement("script");
    const timeout = window.setTimeout(() => resolve(null), 6000);
    script.id = OPENCV_SCRIPT_ID;
    script.async = true;
    script.src = OPENCV_URL;
    script.onload = () => {
      const wait = () => {
        const cv = (window as any).cv;
        if (cv?.Mat) {
          window.clearTimeout(timeout);
          resolve(cv);
        } else {
          window.setTimeout(wait, 80);
        }
      };
      wait();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };
    if (!already) document.head.appendChild(script);
  });

  return openCvPromise;
}

function detectCardBoundaryOpenCv(cv: OpenCv, canvas: HTMLCanvasElement): { corners: Quad; confidence: number } | null {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 45, 120);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best: { corners: Quad; confidence: number } | null = null;
    const frameArea = canvas.width * canvas.height;
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      try {
        cv.approxPolyDP(contour, approx, 0.025 * perimeter, true);
        if (approx.rows !== 4) continue;
        const points: Point[] = [];
        for (let row = 0; row < 4; row += 1) {
          points.push({ x: approx.intPtr(row, 0)[0], y: approx.intPtr(row, 0)[1] });
        }
        const corners = orderQuadPoints(points);
        const confidence = scoreQuad(corners, canvas.width, canvas.height, frameArea);
        if (confidence > 0.5 && (!best || confidence > best.confidence)) best = { corners, confidence };
      } finally {
        approx.delete();
        contour.delete();
      }
    }
    return best;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function perspectiveCorrectOpenCv(cv: OpenCv, canvas: HTMLCanvasElement, corners: Quad) {
  const targetHeight = 1400;
  const targetWidth = Math.round(targetHeight * CARD_ASPECT_RATIO);
  const src = cv.imread(canvas);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((point) => [point.x, point.y]));
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, targetWidth, 0, targetWidth, targetHeight, 0, targetHeight]);
  try {
    const transform = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(src, dst, transform, new cv.Size(targetWidth, targetHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    const output = document.createElement("canvas");
    output.width = targetWidth;
    output.height = targetHeight;
    cv.imshow(output, dst);
    transform.delete();
    return output.toDataURL("image/jpeg", 0.92);
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
  }
}

async function estimateReferenceMargins(url: string) {
  try {
    const image = await loadImage(url, "anonymous");
    const canvas = imageToCanvas(image, image.naturalWidth, image.naturalHeight);
    const calibrated = estimateInnerMarginsFromImage(canvas, "front");
    return {
      url,
      margins: calibrated.margins,
      score: Math.max(0.58, calibrated.confidenceScore)
    };
  } catch {
    return null;
  }
}

function cropBoundingBox(canvas: HTMLCanvasElement, corners: Quad) {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = clamp(Math.min(...xs), 0, canvas.width);
  const maxX = clamp(Math.max(...xs), 0, canvas.width);
  const minY = clamp(Math.min(...ys), 0, canvas.height);
  const maxY = clamp(Math.max(...ys), 0, canvas.height);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  context?.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
  return output.toDataURL("image/jpeg", 0.9);
}

function scoreQuad(corners: Quad, width: number, height: number, frameArea: number) {
  const areaRatio = Math.abs(polygonArea(corners)) / frameArea;
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const boxWidth = Math.max(...xs) - Math.min(...xs);
  const boxHeight = Math.max(...ys) - Math.min(...ys);
  const aspect = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const centerDistance = Math.hypot(centerX - width / 2, centerY - height / 2) / Math.hypot(width / 2, height / 2);
  let score = 0.2;
  score += Math.max(0, 1 - Math.abs(aspect - CARD_ASPECT_RATIO) / 0.24) * 0.38;
  score += areaRatio > 0.18 && areaRatio < 0.86 ? 0.28 : 0;
  score += Math.max(0, 1 - centerDistance) * 0.14;
  return Math.max(0, Math.min(1, score));
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

function imageToCanvas(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context?.drawImage(image, 0, 0, width, height);
  return canvas;
}

function fitImageSize(width: number, height: number, maxDimension: number) {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return { width: 1000, height: 1400 };
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function loadImage(src: string, crossOrigin?: "" | "anonymous") {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin !== undefined) image.crossOrigin = crossOrigin;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function luminanceAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
