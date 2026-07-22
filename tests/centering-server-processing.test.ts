import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { detectCardBoundary, processCenteringImage } from "../lib/centering/server-processing.ts";

test("server centering processing detects and measures a card-like photo", async () => {
  const buffer = await syntheticCardPhoto({
    width: 820,
    height: 1200,
    card: { left: 160, top: 80, width: 500, height: 980 },
    margins: { left: 0.09, right: 0.11, top: 0.1, bottom: 0.12 }
  });

  const result = await processCenteringImage({
    buffer,
    mimeType: "image/png",
    side: "front"
  });

  assert.equal(result.correctedDataUrl.startsWith("data:image/jpeg;base64,"), true);
  assert.ok(result.detectionConfidence > 0.5);
  assert.notEqual(result.innerFrame.left, 0);
  assert.equal(result.blockers.includes("card-not-recognized"), false);
});

test("server boundary detection rejects a blank image", async () => {
  const width = 640;
  const height = 900;
  const data = Buffer.alloc(width * height * 4, 44);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;

  const boundary = detectCardBoundary({ data, width, height, channels: 4 });

  assert.equal(boundary.blockers.includes("card-not-recognized"), true);
  assert.ok(boundary.confidence < 0.42);
});

async function syntheticCardPhoto(input: {
  width: number;
  height: number;
  card: { left: number; top: number; width: number; height: number };
  margins: { left: number; right: number; top: number; bottom: number };
}) {
  const data = Buffer.alloc(input.width * input.height * 4);
  const cardRight = input.card.left + input.card.width;
  const cardBottom = input.card.top + input.card.height;
  const innerLeft = input.card.left + Math.round(input.card.width * input.margins.left);
  const innerRight = cardRight - Math.round(input.card.width * input.margins.right);
  const innerTop = input.card.top + Math.round(input.card.height * input.margins.top);
  const innerBottom = cardBottom - Math.round(input.card.height * input.margins.bottom);

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const index = (y * input.width + x) * 4;
      const inCard = x >= input.card.left && x <= cardRight && y >= input.card.top && y <= cardBottom;
      const inInner = x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom;
      const luma = inInner ? 82 : inCard ? 214 : 28;
      data[index] = luma;
      data[index + 1] = luma;
      data[index + 2] = luma;
      data[index + 3] = 255;
    }
  }

  return sharp(data, {
    raw: {
      width: input.width,
      height: input.height,
      channels: 4
    }
  }).png().toBuffer();
}
