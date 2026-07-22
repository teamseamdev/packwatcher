import assert from "node:assert/strict";
import test from "node:test";
import { calibrateInnerFrameFromLuminance } from "../lib/centering/calibration.ts";
import { buildCenteringAnalysis, compareCenteringToStandard, GRADING_CENTERING_STANDARDS } from "../lib/centering/grading-standards.ts";
import { analyzeCenteringSide, overallConfidence, ratioText, recommendationFor } from "../lib/centering/geometry.ts";
import type { Quad } from "../lib/scanner/geometry.ts";

const corners: Quad = [
  { x: 60, y: 40 },
  { x: 940, y: 40 },
  { x: 940, y: 1360 },
  { x: 60, y: 1360 }
];

test("calculates directional and display centering ratios", () => {
  const side = analyzeCenteringSide({
    side: "front",
    outerCorners: corners,
    imageSize: { width: 1000, height: 1400 },
    innerFramePercent: { left: 0.09, right: 0.11, top: 0.1, bottom: 0.1 },
    userAdjusted: true
  });

  assert.equal(Math.round(side.directionalRatio.left), 45);
  assert.equal(Math.round(side.directionalRatio.right), 55);
  assert.equal(ratioText(side.horizontalRatio), "55/45");
  assert.equal(ratioText(side.verticalRatio), "50/50");
});

test("flags low confidence when card is cropped or inner border is uncertain", () => {
  const side = analyzeCenteringSide({
    side: "front",
    outerCorners: [
      { x: -50, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1400 },
      { x: -50, y: 1400 }
    ],
    imageSize: { width: 1000, height: 1400 },
    innerFramePercent: { left: 0.002, right: 0.1, top: 0.1, bottom: 0.1 },
    userAdjusted: false
  });

  assert.equal(side.confidence, "low");
  assert.equal(side.blockers.includes("card-cropped"), true);
  assert.equal(side.blockers.includes("inner-border-not-detected"), true);
});

test("compares centering to versioned PSA and Beckett standards", () => {
  const front = analyzeCenteringSide({
    side: "front",
    outerCorners: corners,
    imageSize: { width: 1000, height: 1400 },
    innerFramePercent: { left: 0.09, right: 0.11, top: 0.1, bottom: 0.1 },
    userAdjusted: true
  });
  const back = analyzeCenteringSide({
    side: "back",
    outerCorners: corners,
    imageSize: { width: 1000, height: 1400 },
    innerFramePercent: { left: 0.13, right: 0.13, top: 0.1, bottom: 0.1 },
    userAdjusted: true
  });

  const psa = compareCenteringToStandard(GRADING_CENTERING_STANDARDS.psa, front, back);
  const beckett = compareCenteringToStandard(GRADING_CENTERING_STANDARDS.beckett, front, back);

  assert.equal(psa.frontWithinTolerance, true);
  assert.equal(psa.backWithinTolerance, true);
  assert.equal(beckett.frontWithinTolerance, false);
  assert.equal(beckett.backWithinTolerance, true);
});

test("builds conservative overall recommendations", () => {
  const front = analyzeCenteringSide({
    side: "front",
    outerCorners: corners,
    imageSize: { width: 1000, height: 1400 },
    innerFramePercent: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 },
    userAdjusted: true
  });
  const confidence = overallConfidence(front, null);
  const recommendation = recommendationFor(front, null);
  const analysis = buildCenteringAnalysis(front, null, confidence, recommendation);

  assert.equal(analysis.overallConfidence, "high");
  assert.equal(analysis.recommendation, "excellent");
  assert.match(analysis.disclaimer, /do not guarantee a grade/i);
  assert.equal(analysis.psaComparison?.backWithinTolerance, null);
});

test("calibrates modern front margins from a corrected card image", () => {
  const image = syntheticCardImage({
    width: 720,
    height: 1000,
    margins: { left: 0.08, right: 0.12, top: 0.09, bottom: 0.11 },
    borderLuma: 210,
    innerLuma: 82
  });

  const calibrated = calibrateInnerFrameFromLuminance({ image, side: "front" });

  assert.equal(calibrated.confidence, "high");
  assert.equal(calibrated.blockers.includes("inner-border-not-detected"), false);
  assert.ok(Math.abs(calibrated.margins.left - 0.08) < 0.012);
  assert.ok(Math.abs(calibrated.margins.right - 0.12) < 0.012);
  assert.ok(Math.abs(calibrated.margins.top - 0.09) < 0.012);
  assert.ok(Math.abs(calibrated.margins.bottom - 0.11) < 0.012);
});

test("calibrates Pokemon back margins with the back-specific profile", () => {
  const image = syntheticCardImage({
    width: 720,
    height: 1000,
    margins: { left: 0.14, right: 0.1, top: 0.12, bottom: 0.16 },
    borderLuma: 56,
    innerLuma: 188
  });

  const calibrated = calibrateInnerFrameFromLuminance({ image, side: "back" });

  assert.notEqual(calibrated.confidence, "low");
  assert.ok(Math.abs(calibrated.margins.left - 0.14) < 0.015);
  assert.ok(Math.abs(calibrated.margins.right - 0.1) < 0.015);
  assert.ok(Math.abs(calibrated.margins.top - 0.12) < 0.015);
  assert.ok(Math.abs(calibrated.margins.bottom - 0.16) < 0.015);
});

test("uses reference guidance when full-art style contrast hides inner edges", () => {
  const image = syntheticCardImage({
    width: 720,
    height: 1000,
    margins: { left: 0.08, right: 0.08, top: 0.08, bottom: 0.08 },
    borderLuma: 128,
    innerLuma: 132
  });

  const calibrated = calibrateInnerFrameFromLuminance({
    image,
    side: "front",
    referenceMargins: { left: 0.07, right: 0.11, top: 0.1, bottom: 0.13 }
  });

  assert.equal(calibrated.blockers.includes("reference-guided-frame"), true);
  assert.ok(Math.abs(calibrated.margins.left - 0.07) < 0.04);
  assert.ok(Math.abs(calibrated.margins.bottom - 0.13) < 0.04);
});

test("marks low-confidence calibration when edges are not measurable", () => {
  const image = syntheticCardImage({
    width: 720,
    height: 1000,
    margins: { left: 0.08, right: 0.08, top: 0.08, bottom: 0.08 },
    borderLuma: 118,
    innerLuma: 120
  });

  const calibrated = calibrateInnerFrameFromLuminance({ image, side: "front" });

  assert.equal(calibrated.confidence, "low");
  assert.equal(calibrated.blockers.includes("inner-border-not-detected"), true);
});

function syntheticCardImage(input: {
  width: number;
  height: number;
  margins: { left: number; right: number; top: number; bottom: number };
  borderLuma: number;
  innerLuma: number;
}) {
  const data = new Float32Array(input.width * input.height);
  const left = Math.round(input.width * input.margins.left);
  const right = Math.round(input.width * (1 - input.margins.right));
  const top = Math.round(input.height * input.margins.top);
  const bottom = Math.round(input.height * (1 - input.margins.bottom));
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const inside = x >= left && x <= right && y >= top && y <= bottom;
      const texture = ((x * 13 + y * 7) % 11) - 5;
      data[y * input.width + x] = (inside ? input.innerLuma : input.borderLuma) + texture;
    }
  }
  return { width: input.width, height: input.height, data };
}
