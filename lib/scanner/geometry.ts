export type Point = {
  x: number;
  y: number;
};

export type Quad = [Point, Point, Point, Point];

export type CoverMapping = {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedWidth: number;
  renderedHeight: number;
};

export function orderQuadPoints(points: Point[]): Quad {
  if (points.length !== 4) throw new Error("Exactly four points are required.");
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  const sorted = [...points].sort((left, right) => Math.atan2(left.y - center.y, left.x - center.x) - Math.atan2(right.y - center.y, right.x - center.x));
  const topFirst = rotateToTopLeft(sorted);
  const signedArea = polygonArea(topFirst);
  const clockwise = signedArea > 0 ? topFirst : [topFirst[0], topFirst[3], topFirst[2], topFirst[1]];
  return clockwise as Quad;
}

export function polygonArea(points: Point[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function distance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function quadCenter(corners: Quad) {
  return corners.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
}

export function averageCornerDistance(left: Quad, right: Quad) {
  return left.reduce((sum, point, index) => sum + distance(point, right[index]), 0) / 4;
}

export function smoothQuad(previous: Quad | null, next: Quad, alpha = 0.36): Quad {
  if (!previous) return next;
  return next.map((point, index) => ({
    x: previous[index].x * (1 - alpha) + point.x * alpha,
    y: previous[index].y * (1 - alpha) + point.y * alpha
  })) as Quad;
}

export function getObjectCoverMapping(videoWidth: number, videoHeight: number, containerWidth: number, containerHeight: number): CoverMapping {
  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;
  return {
    scale,
    offsetX: (containerWidth - renderedWidth) / 2,
    offsetY: (containerHeight - renderedHeight) / 2,
    renderedWidth,
    renderedHeight
  };
}

export function mapVideoPointToCover(point: Point, videoWidth: number, videoHeight: number, containerWidth: number, containerHeight: number): Point {
  const mapping = getObjectCoverMapping(videoWidth, videoHeight, containerWidth, containerHeight);
  return {
    x: point.x * mapping.scale + mapping.offsetX,
    y: point.y * mapping.scale + mapping.offsetY
  };
}

function rotateToTopLeft(points: Point[]) {
  let topLeftIndex = 0;
  let topLeftScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const score = point.x + point.y;
    if (score < topLeftScore) {
      topLeftScore = score;
      topLeftIndex = index;
    }
  }
  return [...points.slice(topLeftIndex), ...points.slice(0, topLeftIndex)];
}
