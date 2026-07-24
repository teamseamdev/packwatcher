import assert from "node:assert/strict";
import test from "node:test";
import { dataUrlToRecognitionPayload, validateRecognitionImageMetrics } from "../lib/scanner/recognition-image.ts";

test("recognition image validator rejects blank or tiny crops", () => {
  assert.deepEqual(
    validateRecognitionImageMetrics({ width: 180, height: 260, byteSize: 12_000, meanLuminance: 120, variance: 80 }),
    { ok: false, reason: "crop_too_small" }
  );
  assert.deepEqual(
    validateRecognitionImageMetrics({ width: 640, height: 900, byteSize: 20_000, meanLuminance: 4, variance: 1 }),
    { ok: false, reason: "blank_or_black_crop" }
  );
});

test("recognition image validator accepts scanner-sized visible crops", () => {
  assert.deepEqual(
    validateRecognitionImageMetrics({ width: 700, height: 980, byteSize: 48_000, meanLuminance: 118, variance: 420 }),
    { ok: true, reason: "ok" }
  );
});

test("data URL payload extraction preserves scanner MIME and byte size", () => {
  const payload = dataUrlToRecognitionPayload("data:image/jpeg;base64,QUJDRA==");
  assert.equal(payload.mimeType, "image/jpeg");
  assert.equal(payload.imageBase64, "QUJDRA==");
  assert.equal(payload.byteSize, 4);
});
