import assert from "node:assert/strict";
import test from "node:test";
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
