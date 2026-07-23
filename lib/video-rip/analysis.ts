import type {
  VideoRipCardWindow,
  VideoRipFrameSample,
  VideoRipPack,
  VideoRipRecognitionCard,
  VideoRipReport,
  VideoRipTimelineEvent
} from "@/lib/video-rip/types";

export const VIDEO_RIP_ANALYSIS_CONFIG = {
  baseSampleIntervalSeconds: 0.9,
  denseSampleIntervalSeconds: 0.45,
  maxAnalyzedFrames: 360,
  minimumCardLikeScore: 0.5,
  minimumWindowSeconds: 0.55,
  maxGapWithinCardSeconds: 2.15,
  visualSplitDistance: 18,
  moderateVisualSplitDistance: 14,
  maxGapWithinPackSeconds: 36,
  maxCardsPerPackBeforeSoftSplit: 14
} as const;

export type FusionInput = {
  id: string;
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
  referenceImageUrl: string | null;
  recognitionSource: string;
  pricingSource: string;
};

export function scoreFrameQuality(input: {
  brightness: number;
  sharpness: number;
  edgeDensity: number;
  motionScore: number;
  coverageScore: number;
  glareScore: number;
}) {
  const brightnessScore = 1 - Math.min(1, Math.abs(input.brightness - 126) / 126);
  const sharpnessScore = clamp01(input.sharpness / 80);
  const edgeScore = input.edgeDensity < 0.015 || input.edgeDensity > 0.46
    ? 0
    : 1 - Math.min(1, Math.abs(input.edgeDensity - 0.16) / 0.22);
  const motionScore = clamp01(1 - input.motionScore / 0.42);
  const glareScore = clamp01(1 - input.glareScore / 0.26);
  const coverageScore = clamp01(input.coverageScore);
  const cardLikeScore = clamp01(
    edgeScore * 0.32 +
    coverageScore * 0.24 +
    brightnessScore * 0.16 +
    sharpnessScore * 0.14 +
    motionScore * 0.08 +
    glareScore * 0.06
  );
  const qualityScore = clamp01(
    cardLikeScore * 0.42 +
    sharpnessScore * 0.24 +
    motionScore * 0.16 +
    glareScore * 0.1 +
    brightnessScore * 0.08
  );
  return { cardLikeScore: round(cardLikeScore), qualityScore: round(qualityScore) };
}

export function buildCardWindows(samples: VideoRipFrameSample[]) {
  const windows: VideoRipCardWindow[] = [];
  const candidates = samples
    .filter((sample) => sample.cardLikeScore >= VIDEO_RIP_ANALYSIS_CONFIG.minimumCardLikeScore)
    .sort((left, right) => left.timestamp - right.timestamp);
  let current: VideoRipFrameSample[] = [];

  for (const sample of candidates) {
    const previous = current.at(-1);
    const shouldSplit = previous ? shouldSplitCardWindow(current, sample) : false;
    if (!previous || !shouldSplit) {
      current.push(sample);
      continue;
    }
    pushWindow(windows, current);
    current = [sample];
  }
  pushWindow(windows, current);
  return windows;
}

export function visualFingerprintDistance(left?: string | null, right?: string | null) {
  if (!left || !right || left.length !== right.length) return 0;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

export function assignWindowsToPacks(windows: VideoRipCardWindow[]) {
  const sorted = [...windows].sort((left, right) => left.firstAppearance - right.firstAppearance);
  const packBuckets: VideoRipCardWindow[][] = [];
  let current: VideoRipCardWindow[] = [];

  for (const window of sorted) {
    const previous = current.at(-1);
    const gap = previous ? window.firstAppearance - previous.lastAppearance : 0;
    const softSplit = current.length >= VIDEO_RIP_ANALYSIS_CONFIG.maxCardsPerPackBeforeSoftSplit && gap > 4;
    if (!previous || (gap <= VIDEO_RIP_ANALYSIS_CONFIG.maxGapWithinPackSeconds && !softSplit)) {
      current.push(window);
      continue;
    }
    packBuckets.push(current);
    current = [window];
  }
  if (current.length) packBuckets.push(current);

  return packBuckets.map((bucket, index) => {
    const packId = `pack-${index + 1}`;
    return bucket.map((window) => ({ ...window, packId }));
  }).flat();
}

export function fuseRecognitionCandidates(candidates: FusionInput[]) {
  if (!candidates.length) return null;
  const grouped = new Map<string, FusionInput[]>();
  for (const candidate of candidates) {
    const key = candidate.canonicalCardId ?? `${normalize(candidate.cardName)}:${candidate.collectorNumber ?? ""}`;
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }
  const ranked = Array.from(grouped.values())
    .map((group) => {
      const best = group.reduce((left, right) => right.confidence > left.confidence ? right : left);
      const confidenceBoost = Math.min(0.18, (group.length - 1) * 0.06);
      return { ...best, confidence: round(Math.min(1, best.confidence + confidenceBoost)) };
    })
    .sort((left, right) => right.confidence - left.confidence);
  return ranked[0] ?? null;
}

export function buildVideoRipReport(input: {
  id: string;
  fileName: string;
  setId: string;
  setName: string;
  duration: number;
  frameCount: number;
  analyzedFrameCount: number;
  cards: VideoRipRecognitionCard[];
}) {
  const cards = input.cards.sort((left, right) => left.bestFrameTimestamp - right.bestFrameTimestamp);
  const packMap = new Map<string, VideoRipRecognitionCard[]>();
  for (const card of cards) packMap.set(card.packId, [...(packMap.get(card.packId) ?? []), card]);
  const packs: VideoRipPack[] = Array.from(packMap.entries()).map(([packId, packCards], index) => {
    const unique = new Set(packCards.map((card) => card.canonicalCardId ?? `${card.cardName}:${card.collectorNumber}`));
    const totalValue = roundMoney(packCards.reduce((sum, card) => sum + card.price, 0));
    return {
      id: packId,
      packNumber: index + 1,
      start: Math.max(0, Math.min(...packCards.map((card) => card.firstAppearance)) - 8),
      end: Math.min(input.duration, Math.max(...packCards.map((card) => card.lastAppearance)) + 4),
      cards: packCards,
      totalValue,
      highestValue: roundMoney(Math.max(0, ...packCards.map((card) => card.price))),
      duplicateCount: Math.max(0, packCards.length - unique.size)
    };
  });
  const totalValue = roundMoney(cards.reduce((sum, card) => sum + card.price, 0));
  const highestPull = cards.reduce<VideoRipRecognitionCard | null>((best, card) => !best || card.price > best.price ? card : best, null);
  const timeline = buildTimeline({ packs, duration: input.duration });
  return {
    id: input.id,
    fileName: input.fileName,
    setId: input.setId,
    setName: input.setName,
    duration: input.duration,
    createdAt: new Date().toISOString(),
    packs,
    timeline,
    cards,
    totalValue,
    averagePackValue: packs.length ? roundMoney(totalValue / packs.length) : 0,
    highestPull,
    frameCount: input.frameCount,
    analyzedFrameCount: input.analyzedFrameCount
  } satisfies VideoRipReport;
}

export function updateReportCards(report: VideoRipReport, cards: VideoRipRecognitionCard[]) {
  return buildVideoRipReport({
    id: report.id,
    fileName: report.fileName,
    setId: report.setId,
    setName: report.setName,
    duration: report.duration,
    frameCount: report.frameCount,
    analyzedFrameCount: report.analyzedFrameCount,
    cards
  });
}

export function reportToCsv(report: VideoRipReport) {
  const rows = [
    ["Pack", "Timestamp", "Card", "Collector Number", "Rarity", "Price", "Confidence"],
    ...report.cards.map((card) => [
      packNumber(report, card.packId),
      formatTimestamp(card.bestFrameTimestamp),
      card.cardName,
      card.collectorNumber ?? "",
      card.rarity ?? "",
      card.price.toFixed(2),
      `${Math.round(card.confidence * 100)}%`
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function reportToJson(report: VideoRipReport) {
  return JSON.stringify(report, null, 2);
}

export function buildVideoRipPdf(report: VideoRipReport) {
  const lines = [
    "PackWatcher Video Rip Analysis",
    `Video: ${report.fileName}`,
    `Set: ${report.setName}`,
    `Duration: ${formatTimestamp(report.duration)}`,
    `Packs: ${report.packs.length}`,
    `Cards: ${report.cards.length}`,
    `Total value: ${currency(report.totalValue)}`,
    `Average pack: ${currency(report.averagePackValue)}`,
    report.highestPull ? `Highest pull: ${report.highestPull.cardName} ${currency(report.highestPull.price)}` : "Highest pull: none",
    "",
    ...report.packs.flatMap((pack) => [
      `Pack ${pack.packNumber} | ${formatTimestamp(pack.start)} - ${formatTimestamp(pack.end)} | ${currency(pack.totalValue)}`,
      ...pack.cards.map((card) => `  ${formatTimestamp(card.bestFrameTimestamp)} ${card.cardName} ${card.collectorNumber ?? ""} ${currency(card.price)} ${Math.round(card.confidence * 100)}%`),
      ""
    ])
  ];
  return buildSimplePdf(lines);
}

export function formatTimestamp(seconds: number) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60).toString().padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${wholeSeconds}` : `${minutes}:${wholeSeconds}`;
}

export function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

function pushWindow(windows: VideoRipCardWindow[], samples: VideoRipFrameSample[]) {
  if (!samples.length) return;
  const first = samples[0];
  const last = samples.at(-1) ?? first;
  if (last.timestamp - first.timestamp < VIDEO_RIP_ANALYSIS_CONFIG.minimumWindowSeconds && samples.length < 2) return;
  const sorted = [...samples].sort((left, right) => right.qualityScore - left.qualityScore);
  const best = sorted[0];
  windows.push({
    id: `window-${windows.length + 1}`,
    packId: "pack-1",
    firstAppearance: first.timestamp,
    bestFrameTimestamp: best.timestamp,
    lastAppearance: last.timestamp,
    bestFrame: best,
    alternateFrames: sorted.slice(1, 3),
    qualityScore: best.qualityScore
  });
}

function shouldSplitCardWindow(current: VideoRipFrameSample[], sample: VideoRipFrameSample) {
  const previous = current.at(-1);
  if (!previous) return false;
  const gap = sample.timestamp - previous.timestamp;
  if (gap > VIDEO_RIP_ANALYSIS_CONFIG.maxGapWithinCardSeconds) return true;
  if (!sample.visualFingerprint || !previous.visualFingerprint) return false;

  const recent = current.slice(-3);
  const averageDistance = recent.reduce((sum, frame) => sum + visualFingerprintDistance(frame.visualFingerprint, sample.visualFingerprint), 0) / recent.length;
  const immediateDistance = visualFingerprintDistance(previous.visualFingerprint, sample.visualFingerprint);
  const enoughEvidenceForPreviousCard = current.length >= 2 || previous.qualityScore >= 0.72;
  const newFrameUseful = sample.qualityScore >= 0.48 && sample.cardLikeScore >= VIDEO_RIP_ANALYSIS_CONFIG.minimumCardLikeScore;

  if (!enoughEvidenceForPreviousCard || !newFrameUseful) return false;
  if (immediateDistance >= VIDEO_RIP_ANALYSIS_CONFIG.visualSplitDistance && averageDistance >= VIDEO_RIP_ANALYSIS_CONFIG.moderateVisualSplitDistance) return true;
  return current.length >= 6 && averageDistance >= VIDEO_RIP_ANALYSIS_CONFIG.visualSplitDistance;
}

function buildTimeline(input: { packs: VideoRipPack[]; duration: number }) {
  const events: VideoRipTimelineEvent[] = [{ id: "intro", timestamp: 0, label: "Intro", type: "intro" }];
  for (const pack of input.packs) {
    events.push({ id: `${pack.id}-start`, timestamp: pack.start, label: `Pack ${pack.packNumber} start`, type: "pack-start", packId: pack.id });
    for (const card of pack.cards) {
      events.push({ id: card.id, timestamp: card.bestFrameTimestamp, label: card.cardName, type: "card", packId: pack.id, cardId: card.id });
    }
    events.push({ id: `${pack.id}-end`, timestamp: pack.end, label: `Pack ${pack.packNumber} end`, type: "pack-end", packId: pack.id });
  }
  events.push({ id: "summary", timestamp: input.duration, label: "Summary", type: "summary" });
  return events.sort((left, right) => left.timestamp - right.timestamp);
}

function packNumber(report: VideoRipReport, packId: string) {
  return String(report.packs.find((pack) => pack.id === packId)?.packNumber ?? "");
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function round(value: number) {
  return Number(clamp01(value).toFixed(3));
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function buildSimplePdf(lines: string[]) {
  const escapedLines = lines.slice(0, 46).map((line) => line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"));
  const content = [
    "BT",
    "/F1 12 Tf",
    "48 760 Td",
    ...escapedLines.map((line, index) => `${index === 0 ? "" : "0 -16 Td"}(${line}) Tj`),
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
