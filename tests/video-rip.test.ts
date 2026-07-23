import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCardWindows,
  buildVideoRipPdf,
  buildVideoRipReport,
  formatTimestamp,
  fuseRecognitionCandidates,
  isLikelyDisplayedCardFrame,
  isStrongFallbackCardFrame,
  reportToCsv,
  reportToJson,
  scoreFrameQuality,
  visualFingerprintDistance
} from "../lib/video-rip/analysis.ts";
import type { VideoRipFrameSample, VideoRipRecognitionCard } from "../lib/video-rip/types.ts";

test("video frame quality rewards sharp card-like frames", () => {
  const strong = scoreFrameQuality({
    brightness: 128,
    sharpness: 120,
    edgeDensity: 0.16,
    motionScore: 0.05,
    coverageScore: 0.9,
    glareScore: 0.02
  });
  const weak = scoreFrameQuality({
    brightness: 24,
    sharpness: 8,
    edgeDensity: 0.005,
    motionScore: 0.7,
    coverageScore: 0.1,
    glareScore: 0.35
  });

  assert.ok(strong.cardLikeScore > 0.75);
  assert.ok(strong.qualityScore > weak.qualityScore);
});

test("video card windows are grouped from neighboring card-like frames", () => {
  const windows = buildCardWindows([
    sample(0, 0.2),
    sample(1, 0.68),
    sample(1.7, 0.76),
    sample(8.5, 0.74),
    sample(9.2, 0.72)
  ]);

  assert.equal(windows.length, 2);
  assert.equal(windows[0].firstAppearance, 1);
  assert.equal(windows[0].bestFrameTimestamp, 1.7);
  assert.equal(windows[1].firstAppearance, 8.5);
});

test("video card windows split when adjacent frames show different cards", () => {
  const firstCard = "1111111100000000111111110000000011111111000000001111111100000000";
  const secondCard = "0000000011111111000000001111111100000000111111110000000011111111";
  const windows = buildCardWindows([
    sample(10, 0.78, firstCard),
    sample(10.45, 0.8, firstCard),
    sample(10.9, 0.76, firstCard),
    sample(11.35, 0.81, secondCard),
    sample(11.8, 0.79, secondCard),
    sample(12.25, 0.77, secondCard)
  ]);

  assert.equal(windows.length, 2);
  assert.equal(windows[0].bestFrameTimestamp, 10.45);
  assert.equal(windows[1].bestFrameTimestamp, 11.35);
  assert.ok(visualFingerprintDistance(firstCard, secondCard) >= 18);
});

test("video card windows reject visible non-card wrapper frames", () => {
  const wrapperFrame = sample(14, 0.62, null, {
    coverageScore: 0.08,
    edgeDensity: 0.48,
    qualityScore: 0.46
  });
  const cardFrame = sample(15, 0.7, null, {
    coverageScore: 0.64,
    edgeDensity: 0.18,
    qualityScore: 0.68
  });
  const cardFrameNext = sample(15.5, 0.72, null, {
    coverageScore: 0.66,
    edgeDensity: 0.17,
    qualityScore: 0.7
  });

  assert.equal(isLikelyDisplayedCardFrame(wrapperFrame), false);
  assert.equal(isStrongFallbackCardFrame(wrapperFrame), false);
  assert.equal(isStrongFallbackCardFrame(cardFrame), true);
  assert.equal(buildCardWindows([wrapperFrame, cardFrame, cardFrameNext]).length, 1);
});

test("recognition fusion boosts repeated evidence for the same canonical card", () => {
  const fused = fuseRecognitionCandidates([
    candidate("a", "Bulbasaur", "1/86", 0.54),
    candidate("a", "Bulbasaur", "1/86", 0.58),
    candidate("b", "Ivysaur", "2/86", 0.4)
  ]);

  assert.equal(fused?.canonicalCardId, "a");
  assert.ok((fused?.confidence ?? 0) > 0.58);
});

test("video rip report builds pack totals, timeline, and export formats", () => {
  const report = buildVideoRipReport({
    id: "analysis-1",
    fileName: "rip.mp4",
    setId: "set-1",
    setName: "Chaos Rising",
    duration: 142,
    frameCount: 4260,
    analyzedFrameCount: 90,
    cards: [
      card("card-1", "pack-1", "Bulbasaur", 12, 0.25),
      card("card-2", "pack-1", "Charizard ex", 18, 48.9),
      card("card-3", "pack-2", "Squirtle", 74, 1.12)
    ]
  });

  assert.equal(report.packs.length, 2);
  assert.equal(report.totalValue, 50.27);
  assert.equal(report.highestPull?.cardName, "Charizard ex");
  assert.ok(report.timeline.some((event) => event.label === "Pack 1 start"));
  assert.match(reportToCsv(report), /Pack,Timestamp,Card,Collector Number,Rarity,Price,Confidence/);
  assert.match(reportToJson(report), /"fileName": "rip.mp4"/);
  assert.match(buildVideoRipPdf(report), /^%PDF-1.4/);
});

test("video rip report marks unresolved windows as needs-review instead of complete", () => {
  const report = buildVideoRipReport({
    id: "analysis-review",
    fileName: "rip.mp4",
    setId: "set-1",
    setName: "Chaos Rising",
    duration: 135,
    frameCount: 4050,
    analyzedFrameCount: 210,
    diagnostics: diagnostics({ cardWindows: 4, recognitionAttempts: 4, reviewItems: 4 }),
    cards: [
      { ...card("review-1", "pack-1", "Review needed", 32, 0), canonicalCardId: null, needsReview: true, selected: false },
      { ...card("review-2", "pack-1", "Review needed", 41, 0), canonicalCardId: null, needsReview: true, selected: false }
    ]
  });

  assert.equal(report.outcome, "needs-review");
  assert.equal(report.reviewItemCount, 2);
  assert.equal(report.packs.length, 1);
});

test("video rip report classifies decoded videos with no card windows", () => {
  const report = buildVideoRipReport({
    id: "analysis-empty",
    fileName: "rip.mp4",
    setId: "set-1",
    setName: "Chaos Rising",
    duration: 135,
    frameCount: 4050,
    analyzedFrameCount: 210,
    diagnostics: diagnostics({ cardWindows: 0, recognitionAttempts: 0, reviewItems: 0 }),
    cards: []
  });

  assert.equal(report.outcome, "no-card-windows");
  assert.equal(report.cards.length, 0);
});

test("timestamp formatting supports long videos", () => {
  assert.equal(formatTimestamp(65), "1:05");
  assert.equal(formatTimestamp(3725), "1:02:05");
});

function sample(timestamp: number, cardLikeScore: number, visualFingerprint: string | null = null, overrides: Partial<VideoRipFrameSample> = {}): VideoRipFrameSample {
  return {
    id: `frame-${timestamp}`,
    timestamp,
    imageDataUrl: "data:image/jpeg;base64,abc",
    brightness: 128,
    sharpness: 110,
    edgeDensity: 0.16,
    motionScore: 0.08,
    coverageScore: 0.86,
    glareScore: 0.02,
    cardLikeScore,
    qualityScore: cardLikeScore,
    visualFingerprint,
    ...overrides
  };
}

function candidate(id: string, cardName: string, collectorNumber: string, confidence: number) {
  return {
    id,
    canonicalCardId: id,
    canonicalSetId: "set-1",
    cardName,
    setName: "Chaos Rising",
    collectorNumber,
    rarity: "Common",
    variant: null,
    language: null,
    price: 1,
    confidence,
    referenceImageUrl: null,
    recognitionSource: "test",
    pricingSource: "tcgcsv"
  };
}

function card(id: string, packId: string, cardName: string, timestamp: number, price: number): VideoRipRecognitionCard {
  return {
    id,
    packId,
    canonicalCardId: id,
    canonicalSetId: "set-1",
    cardName,
    setName: "Chaos Rising",
    collectorNumber: `${timestamp}/86`,
    rarity: "Common",
    variant: null,
    language: "english",
    price,
    confidence: 0.88,
    firstAppearance: timestamp - 1,
    bestFrameTimestamp: timestamp,
    lastAppearance: timestamp + 1,
    thumbnailDataUrl: null,
    referenceImageUrl: null,
    recognitionSource: "test",
    pricingSource: "tcgcsv",
    notes: null,
    selected: true
  };
}

function diagnostics(overrides = {}) {
  return {
    decodeStatus: "supported",
    decodePath: "native",
    duration: 135,
    width: 1080,
    height: 1920,
    probeFrames: 6,
    sampledFrames: 210,
    visibleFrames: 190,
    blackFrames: 0,
    frozenFrames: false,
    cardLikeFrames: 36,
    cardWindows: 0,
    recognitionAttempts: 0,
    identifiedCards: 0,
    reviewItems: 0,
    skippedWindows: 0,
    rejectionReasons: {},
    ...overrides
  } as const;
}
