import assert from "node:assert/strict";
import test from "node:test";
import { buildPreparedSetScannerIndex } from "../lib/scanner/set-pack.ts";
import { ScanCoordinator } from "../lib/scanner/scan-coordinator.ts";
import { CAPTURE_POLICIES, computeAutoReadiness } from "../lib/scanner/capture-policy.ts";
import type { CanonicalCardCandidate } from "../lib/cards/set-matching.ts";

test("scan coordinator permits only one active request", async () => {
  const coordinator = new ScanCoordinator<{ value: number }, number>();
  let calls = 0;
  const execute = async (input: { value: number }) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return input.value;
  };

  const first = coordinator.run({ value: 1 }, execute);
  const second = coordinator.run({ value: 2 }, execute);
  const [left, right] = await Promise.all([first, second]);

  assert.equal(left, 1);
  assert.equal(right, 1);
  assert.equal(calls, 1);
});

test("prepared scanner set pack builds compact lookup indexes", () => {
  const pack = buildPreparedSetScannerIndex({
    setId: "set-1",
    setName: "Chaos Rising",
    cards: [
      candidate("a", "Goomy", "066/086"),
      candidate("b", "Goomy", "067/086"),
      candidate("c", "Pikachu", "025/086")
    ]
  });

  assert.equal(pack.cards.length, 3);
  assert.deepEqual(pack.byNormalizedCollectorNumber["66/86"], ["a"]);
  assert.deepEqual(pack.byNormalizedName.goomy, ["a", "b"]);
  assert.deepEqual(pack.byNameAndNumber["goomy:66/86"], ["a"]);
  assert.deepEqual(pack.byNumericPortion["25"], ["c"]);
});

test("manual capture policy does not inherit auto stable-duration requirements", () => {
  assert.equal(CAPTURE_POLICIES.auto.requireStableDetection, true);
  assert.equal(CAPTURE_POLICIES.manual.requireStableDetection, false);
  assert.equal(CAPTURE_POLICIES.manual.minimumStableDurationMs, 0);
  assert.equal(CAPTURE_POLICIES.manual.allowUserOverride, true);
  assert.ok(CAPTURE_POLICIES.manual.minimumDetectionConfidence < CAPTURE_POLICIES.auto.minimumDetectionConfidence);
});

test("auto readiness tolerates one weak frame without full reset", () => {
  const strong = readinessFrame(0, 0.78, 6);
  const readiness = computeAutoReadiness({
    frames: [
      strong,
      readinessFrame(120, 0.76, 7),
      readinessFrame(240, 0.42, 12),
      readinessFrame(360, 0.77, 8),
      readinessFrame(480, 0.79, 7)
    ],
    previousProgress: 0.58,
    prepared: true,
    activeScan: false,
    armed: true
  });

  assert.ok(readiness.progress > 0.35);
  assert.equal(readiness.blockers.length, 0);
});

test("auto readiness hard-resets on active scan or missing set pack", () => {
  const readiness = computeAutoReadiness({
    frames: [readinessFrame(0, 0.8, 5), readinessFrame(120, 0.82, 5), readinessFrame(240, 0.81, 4)],
    previousProgress: 0.8,
    prepared: false,
    activeScan: true,
    armed: true
  });

  assert.equal(readiness.progress, 0);
  assert.deepEqual(readiness.blockers, ["set-not-ready", "active-scan"]);
});

test("auto mode with one valid stable card reaches capture without manual button", () => {
  const readiness = computeAutoReadiness({
    frames: [
      readinessFrame(0, 0.7, 6),
      readinessFrame(120, 0.71, 7),
      readinessFrame(240, 0.69, 8),
      readinessFrame(360, 0.72, 6),
      readinessFrame(480, 0.7, 6)
    ],
    previousProgress: 0.55,
    prepared: true,
    activeScan: false,
    armed: true
  });

  assert.equal(readiness.captureAllowed, true);
  assert.ok(readiness.progress >= 0.72);
});

test("active scan blocks a second auto capture", () => {
  const readiness = computeAutoReadiness({
    frames: [
      readinessFrame(0, 0.8, 5),
      readinessFrame(120, 0.81, 5),
      readinessFrame(240, 0.8, 5),
      readinessFrame(360, 0.82, 5)
    ],
    previousProgress: 0.8,
    prepared: true,
    activeScan: true,
    armed: true
  });

  assert.equal(readiness.captureAllowed, false);
  assert.ok(readiness.blockers.includes("active-scan"));
});

function candidate(id: string, name: string, number: string): CanonicalCardCandidate {
  return {
    id,
    setId: "set-1",
    setName: "Chaos Rising",
    name,
    normalizedName: name.toLowerCase(),
    collectorNumberRaw: number,
    collectorNumberNormalized: number,
    rarity: "Common",
    imageUrl: null,
    tcgplayerProductId: null,
    marketPrice: null
  };
}

function readinessFrame(timestamp: number, confidence: number, motionScore: number) {
  return {
    confidence,
    cardLikeness: confidence,
    blurScore: 130,
    motionScore,
    glareRatio: 0.04,
    allCornersVisible: true,
    cropped: false,
    multipleCards: false,
    timestamp
  };
}
