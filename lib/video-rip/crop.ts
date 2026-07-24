export type VideoCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VideoCardCropCandidate = VideoCropRect & {
  score: number;
  areaRatio: number;
  aspectRatio: number;
  reason: string;
  looseCardStatus: "verified" | "possible" | "rejected";
  looseCardConfidence: number;
};

type LocateInput = {
  luma: Uint8Array;
  width: number;
  height: number;
};

const CARD_ASPECT_RATIOS = [0.716, 0.76, 0.66] as const;

export function locateVideoCardCrop(input: LocateInput): VideoCardCropCandidate | null {
  if (!input.width || !input.height || input.luma.length < input.width * input.height) return null;
  const edges = buildEdgeMaps(input);
  const edgeIntegral = buildIntegralImage(edges.all, input.width, input.height);
  const verticalEdgeIntegral = buildIntegralImage(edges.vertical, input.width, input.height);
  const horizontalEdgeIntegral = buildIntegralImage(edges.horizontal, input.width, input.height);
  const lumaIntegral = buildIntegralImage(input.luma, input.width, input.height);

  let best: VideoCardCropCandidate | null = null;
  const minHeight = Math.max(48, Math.floor(input.height * 0.2));
  const maxHeight = Math.max(minHeight, Math.floor(input.height * 0.78));

  for (let candidateHeight = minHeight; candidateHeight <= maxHeight; candidateHeight += Math.max(10, Math.floor(input.height * 0.04))) {
    for (const aspectRatio of CARD_ASPECT_RATIOS) {
      const candidateWidth = Math.round(candidateHeight * aspectRatio);
      if (candidateWidth < 36 || candidateWidth > input.width * 0.82) continue;
      const stepX = Math.max(8, Math.floor(candidateWidth * 0.12));
      const stepY = Math.max(8, Math.floor(candidateHeight * 0.12));
      for (let y = 0; y <= input.height - candidateHeight; y += stepY) {
        for (let x = 0; x <= input.width - candidateWidth; x += stepX) {
          const scored = scoreCropCandidate({
            x,
            y,
            width: candidateWidth,
            height: candidateHeight
          }, input, edgeIntegral, verticalEdgeIntegral, horizontalEdgeIntegral, lumaIntegral);
          if (!scored) continue;
          if (!best || scored.score > best.score) best = scored;
        }
      }
    }
  }

  return best && best.looseCardStatus !== "rejected" && best.score >= 0.45 ? expandCrop(best, input.width, input.height, 0.08) : null;
}

export function expandCrop(rect: VideoCardCropCandidate, frameWidth: number, frameHeight: number, paddingRatio = 0.08): VideoCardCropCandidate {
  const padX = rect.width * paddingRatio;
  const padY = rect.height * paddingRatio;
  const x = Math.max(0, rect.x - padX);
  const y = Math.max(0, rect.y - padY);
  const maxX = Math.min(frameWidth, rect.x + rect.width + padX);
  const maxY = Math.min(frameHeight, rect.y + rect.height + padY);
  const width = Math.max(1, maxX - x);
  const height = Math.max(1, maxY - y);
  return {
    ...rect,
    x,
    y,
    width,
    height,
    areaRatio: (width * height) / Math.max(1, frameWidth * frameHeight),
    aspectRatio: width / Math.max(1, height)
  };
}

function scoreCropCandidate(
  rect: VideoCropRect,
  input: LocateInput,
  edgeIntegral: Float64Array,
  verticalEdgeIntegral: Float64Array,
  horizontalEdgeIntegral: Float64Array,
  lumaIntegral: Float64Array
): VideoCardCropCandidate | null {
  const frameArea = input.width * input.height;
  const areaRatio = (rect.width * rect.height) / Math.max(1, frameArea);
  if (areaRatio < 0.025 || areaRatio > 0.58) return null;

  const aspectRatio = rect.width / Math.max(1, rect.height);
  if (aspectRatio < 0.5 || aspectRatio > 0.95) return null;

  const edgeDensity = rectMean(edgeIntegral, input.width, rect);
  if (edgeDensity < 0.015 || edgeDensity > 0.5) return null;

  const topBand = band(rect, 0.03, 0.16);
  const artBand = band(rect, 0.18, 0.5);
  const textBand = band(rect, 0.56, 0.36);
  const leftBorder = sideBand(rect, "left");
  const rightBorder = sideBand(rect, "right");
  const topBorder = band(rect, 0, 0.05);
  const bottomBorder = band(rect, 0.92, 0.08);

  const topEdges = rectMean(edgeIntegral, input.width, topBand);
  const artEdges = rectMean(edgeIntegral, input.width, artBand);
  const textEdges = rectMean(edgeIntegral, input.width, textBand);
  const leftSideEdges = rectMean(verticalEdgeIntegral, input.width, leftBorder);
  const rightSideEdges = rectMean(verticalEdgeIntegral, input.width, rightBorder);
  const topSideEdges = rectMean(horizontalEdgeIntegral, input.width, topBorder);
  const bottomSideEdges = rectMean(horizontalEdgeIntegral, input.width, bottomBorder);
  const leftSpan = edgeRowSpan(verticalEdgeIntegral, input.width, leftBorder);
  const rightSpan = edgeRowSpan(verticalEdgeIntegral, input.width, rightBorder);
  const topSpan = edgeColumnSpan(horizontalEdgeIntegral, input.width, topBorder);
  const bottomSpan = edgeColumnSpan(horizontalEdgeIntegral, input.width, bottomBorder);
  const sideBorderEdges = (leftSideEdges + rightSideEdges) / 2;
  const topBottomEdges = (topSideEdges + bottomSideEdges) / 2;
  const borderEdges = sideBorderEdges * 0.65 + topBottomEdges * 0.35;
  if (Math.min(leftSideEdges, rightSideEdges) < 0.035 || sideBorderEdges < 0.055) return null;
  if (Math.min(leftSpan, rightSpan) < 0.32 || Math.min(topSpan, bottomSpan) < 0.28) return null;

  const meanLuma = rectMean(lumaIntegral, input.width, rect);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const centerDistance = Math.hypot((centerX / input.width) - 0.5, (centerY / input.height) - 0.52);
  const centerScore = clamp01(1 - centerDistance / 0.55);
  const aspectScore = clamp01(1 - Math.abs(aspectRatio - 0.716) / 0.28);
  const sizeScore = areaRatio < 0.07 ? clamp01(areaRatio / 0.07) : clamp01(1 - Math.max(0, areaRatio - 0.32) / 0.3);
  const brightnessScore = clamp01(1 - Math.abs(meanLuma - 128) / 128);
  const layoutScore = clamp01(
    topEdges * 4.2 +
    artEdges * 2.2 +
    textEdges * 3.4 +
    borderEdges * 2.6
  );
  const textVsArtScore = textEdges >= artEdges * 0.45 ? 1 : 0.65;
  const borderContinuityScore = clamp01((leftSpan + rightSpan + topSpan + bottomSpan) / 2.4);
  const looseCardConfidence = clamp01(
    aspectScore * 0.18 +
    sizeScore * 0.12 +
    layoutScore * 0.2 +
    borderContinuityScore * 0.28 +
    textVsArtScore * 0.12 +
    centerScore * 0.1
  );
  const looseCardStatus = looseCardConfidence >= 0.68
    ? "verified"
    : looseCardConfidence >= 0.54
      ? "possible"
      : "rejected";

  const score = clamp01(
    aspectScore * 0.2 +
    sizeScore * 0.18 +
    centerScore * 0.16 +
    layoutScore * 0.18 +
    clamp01(sideBorderEdges * 8) * 0.12 +
    textVsArtScore * 0.12 +
    brightnessScore * 0.1
  );

  return {
    ...rect,
    score: Number(score.toFixed(3)),
    areaRatio: Number(areaRatio.toFixed(4)),
    aspectRatio: Number(aspectRatio.toFixed(3)),
    looseCardStatus,
    looseCardConfidence: Number(looseCardConfidence.toFixed(3)),
    reason: `loose-card ${looseCardStatus}, confidence ${looseCardConfidence.toFixed(2)}, aspect ${aspectRatio.toFixed(2)}, area ${(areaRatio * 100).toFixed(1)}%, layout ${layoutScore.toFixed(2)}, border ${borderContinuityScore.toFixed(2)}`
  };
}

function edgeRowSpan(integral: Float64Array, sourceWidth: number, rect: VideoCropRect) {
  const y0 = Math.max(0, Math.floor(rect.y));
  const y1 = Math.max(y0 + 1, Math.floor(rect.y + rect.height));
  let rowsWithEdges = 0;
  for (let y = y0; y < y1; y += 1) {
    const mean = rectMean(integral, sourceWidth, { x: rect.x, y, width: rect.width, height: 1 });
    if (mean > 0.025) rowsWithEdges += 1;
  }
  return rowsWithEdges / Math.max(1, y1 - y0);
}

function edgeColumnSpan(integral: Float64Array, sourceWidth: number, rect: VideoCropRect) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const x1 = Math.max(x0 + 1, Math.floor(rect.x + rect.width));
  let columnsWithEdges = 0;
  for (let x = x0; x < x1; x += 1) {
    const mean = rectMean(integral, sourceWidth, { x, y: rect.y, width: 1, height: rect.height });
    if (mean > 0.025) columnsWithEdges += 1;
  }
  return columnsWithEdges / Math.max(1, x1 - x0);
}

function buildEdgeMaps(input: LocateInput) {
  const all = new Uint8Array(input.width * input.height);
  const vertical = new Uint8Array(input.width * input.height);
  const horizontal = new Uint8Array(input.width * input.height);
  for (let y = 1; y < input.height - 1; y += 1) {
    for (let x = 1; x < input.width - 1; x += 1) {
      const i = y * input.width + x;
      const gx = Math.abs((input.luma[i + 1] ?? 0) - (input.luma[i - 1] ?? 0));
      const gy = Math.abs((input.luma[i + input.width] ?? 0) - (input.luma[i - input.width] ?? 0));
      if (gx + gy > 34) all[i] = 1;
      if (gx > 28 && gx >= gy * 0.65) vertical[i] = 1;
      if (gy > 28 && gy >= gx * 0.65) horizontal[i] = 1;
    }
  }
  return { all, vertical, horizontal };
}

function buildIntegralImage(values: Uint8Array, width: number, height: number) {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += values[(y - 1) * width + (x - 1)] ?? 0;
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
    }
  }
  return integral;
}

function rectMean(integral: Float64Array, sourceWidth: number, rect: VideoCropRect) {
  const width = sourceWidth + 1;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.max(x0 + 1, Math.floor(rect.x + rect.width));
  const y1 = Math.max(y0 + 1, Math.floor(rect.y + rect.height));
  const sum = integral[y1 * width + x1] - integral[y0 * width + x1] - integral[y1 * width + x0] + integral[y0 * width + x0];
  return sum / Math.max(1, (x1 - x0) * (y1 - y0));
}

function band(rect: VideoCropRect, yRatio: number, heightRatio: number): VideoCropRect {
  return {
    x: rect.x,
    y: rect.y + rect.height * yRatio,
    width: rect.width,
    height: Math.max(1, rect.height * heightRatio)
  };
}

function sideBand(rect: VideoCropRect, side: "left" | "right"): VideoCropRect {
  const width = Math.max(1, rect.width * 0.08);
  return {
    x: side === "left" ? rect.x : rect.x + rect.width - width,
    y: rect.y,
    width,
    height: rect.height
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
