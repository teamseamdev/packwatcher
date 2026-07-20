import assert from "node:assert/strict";
import test from "node:test";
import { mapVideoPointToCover, orderQuadPoints, type Point } from "../lib/scanner/geometry.ts";

test("orders upright card corners", () => {
  const ordered = orderQuadPoints([{ x: 100, y: 100 }, { x: 250, y: 100 }, { x: 250, y: 320 }, { x: 100, y: 320 }]);
  assert.deepEqual(ordered, [{ x: 100, y: 100 }, { x: 250, y: 100 }, { x: 250, y: 320 }, { x: 100, y: 320 }]);
});

test("orders tilted left card corners supplied randomly", () => {
  const points: Point[] = [{ x: 220, y: 90 }, { x: 300, y: 310 }, { x: 70, y: 370 }, { x: 45, y: 135 }];
  const ordered = orderQuadPoints([points[2], points[0], points[3], points[1]]);
  assert.equal(ordered[0].x, 45);
  assert.equal(ordered[1].x, 220);
  assert.equal(ordered[2].x, 300);
  assert.equal(ordered[3].x, 70);
});

test("orders tilted right and perspective-skewed corners", () => {
  const ordered = orderQuadPoints([{ x: 310, y: 120 }, { x: 110, y: 80 }, { x: 80, y: 325 }, { x: 260, y: 350 }]);
  assert.deepEqual(ordered, [{ x: 110, y: 80 }, { x: 310, y: 120 }, { x: 260, y: 350 }, { x: 80, y: 325 }]);
});

test("orders landscape rotation", () => {
  const ordered = orderQuadPoints([{ x: 90, y: 180 }, { x: 330, y: 120 }, { x: 365, y: 260 }, { x: 125, y: 320 }]);
  assert.deepEqual(ordered, [{ x: 90, y: 180 }, { x: 330, y: 120 }, { x: 365, y: 260 }, { x: 125, y: 320 }]);
});

test("maps video pixels into object-cover preview coordinates", () => {
  const point = mapVideoPointToCover({ x: 640, y: 360 }, 1280, 720, 390, 844);
  assert.equal(Math.round(point.x), 195);
  assert.equal(Math.round(point.y), 422);

  const topLeft = mapVideoPointToCover({ x: 0, y: 0 }, 1280, 720, 390, 844);
  assert.equal(Math.round(topLeft.y), 0);
  assert.ok(topLeft.x < 0);
});
