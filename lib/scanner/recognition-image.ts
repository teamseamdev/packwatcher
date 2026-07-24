export type RecognitionMimeType = "image/jpeg" | "image/png";

export type RecognitionImageMetrics = {
  width: number;
  height: number;
  byteSize: number;
  meanLuminance: number;
  variance: number;
};

export type PreparedRecognitionImage = RecognitionImageMetrics & {
  dataUrl: string;
  imageBase64: string;
  mimeType: RecognitionMimeType;
  fingerprint: string;
};

export type RecognitionCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function dataUrlToRecognitionPayload(dataUrl: string) {
  const [header, imageBase64 = ""] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*);base64/)?.[1] ?? "image/jpeg";
  return {
    imageBase64,
    mimeType: mimeType === "image/png" ? "image/png" as RecognitionMimeType : "image/jpeg" as RecognitionMimeType,
    byteSize: estimateBase64Bytes(imageBase64)
  };
}

export function validateRecognitionImageMetrics(metrics: RecognitionImageMetrics) {
  if (!Number.isFinite(metrics.width) || !Number.isFinite(metrics.height) || metrics.width <= 0 || metrics.height <= 0) {
    return { ok: false, reason: "invalid_dimensions" as const };
  }
  if (metrics.width < 220 || metrics.height < 300) {
    return { ok: false, reason: "crop_too_small" as const };
  }
  if (metrics.byteSize < 8_000) {
    return { ok: false, reason: "blob_too_small" as const };
  }
  if (metrics.meanLuminance < 8 || metrics.variance < 5) {
    return { ok: false, reason: "blank_or_black_crop" as const };
  }
  return { ok: true, reason: "ok" as const };
}

export async function prepareRecognitionImage(
  source: CanvasImageSource,
  options: {
    crop?: RecognitionCrop | null;
    maxWidth?: number;
    maxHeight?: number;
    mimeType?: RecognitionMimeType;
    jpegQuality?: number;
  } = {}
): Promise<PreparedRecognitionImage> {
  const sourceSize = getSourceSize(source);
  const crop = clampCrop(options.crop ?? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height }, sourceSize);
  const maxWidth = options.maxWidth ?? 900;
  const maxHeight = options.maxHeight ?? 1200;
  const scale = Math.min(1, maxWidth / crop.width, maxHeight / crop.height);
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not prepare recognition image.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const stats = computeImageStats(imageData);
  const mimeType = options.mimeType ?? "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, options.jpegQuality ?? 0.9);
  const payload = dataUrlToRecognitionPayload(dataUrl);
  return {
    dataUrl,
    imageBase64: payload.imageBase64,
    mimeType: payload.mimeType,
    width,
    height,
    byteSize: payload.byteSize,
    meanLuminance: stats.meanLuminance,
    variance: stats.variance,
    fingerprint: stats.fingerprint
  };
}

function getSourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  if ("displayWidth" in source && "displayHeight" in source) return { width: source.displayWidth, height: source.displayHeight };
  if ("width" in source && "height" in source) return { width: Number(source.width), height: Number(source.height) };
  throw new Error("Unsupported recognition image source.");
}

function clampCrop(crop: RecognitionCrop, source: { width: number; height: number }) {
  const x = Math.max(0, Math.min(source.width - 1, crop.x));
  const y = Math.max(0, Math.min(source.height - 1, crop.y));
  const width = Math.max(1, Math.min(source.width - x, crop.width));
  const height = Math.max(1, Math.min(source.height - y, crop.height));
  return { x, y, width, height };
}

function computeImageStats(imageData: ImageData) {
  const { data, width, height } = imageData;
  const luma = new Uint8Array(width * height);
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]);
    luma[index / 4] = value;
    sum += value;
  }
  const meanLuminance = sum / Math.max(1, luma.length);
  let varianceSum = 0;
  for (const value of luma) varianceSum += (value - meanLuminance) ** 2;
  return {
    meanLuminance,
    variance: varianceSum / Math.max(1, luma.length),
    fingerprint: buildLumaFingerprint(luma, width, height)
  };
}

function buildLumaFingerprint(luma: Uint8Array, width: number, height: number) {
  const grid = 8;
  const values: number[] = [];
  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const x0 = Math.floor(column * width / grid);
      const x1 = Math.floor((column + 1) * width / grid);
      const y0 = Math.floor(row * height / grid);
      const y1 = Math.floor((row + 1) * height / grid);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          sum += luma[y * width + x] ?? 0;
          count += 1;
        }
      }
      values.push(count ? sum / count : 0);
    }
  }
  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return values.map((value) => value >= median ? "1" : "0").join("");
}

function estimateBase64Bytes(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}
