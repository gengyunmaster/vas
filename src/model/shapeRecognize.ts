import type { Point } from "./shapeGeometry";

export type RecognizedShapeKind = "line" | "rect" | "ellipse";

export interface RecognizedShape {
  kind: RecognizedShapeKind;
  start: Point;
  end: Point;
}

export interface RecognizeOptions {
  /** Highlighters only ever snap to straight lines. */
  lineOnly?: boolean;
}

const MIN_POINTS = 10;
const MIN_DIAGONAL = 32;
const LINE_MAX_DEVIATION_RATIO = 0.05;
const CLOSURE_RATIO = 0.25;
const RECT_ANGLE_TOLERANCE = (30 * Math.PI) / 180;
const ELLIPSE_RADIAL_RMSE = 0.22;
const ELLIPSE_MAX_GAP_DEG = 75;

export function recognizeShape(
  points: readonly Point[],
  options: RecognizeOptions = {},
): RecognizedShape | null {
  if (points.length < MIN_POINTS) return null;
  const box = boundsOf(points);
  const diagonal = Math.hypot(box.width, box.height);
  if (diagonal < MIN_DIAGONAL) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const lineHit = lineEndpoints(points, first, last, diagonal);
  if (lineHit) return { kind: "line", start: lineHit.start, end: lineHit.end };

  if (options.lineOnly) return null;
  const pathLength = polylineLength(points);
  if (Math.hypot(last.x - first.x, last.y - first.y) > pathLength * CLOSURE_RATIO) return null;

  const rectVertices = rectangleVertices(points, box, diagonal);
  if (rectVertices) {
    const rect = boundsOf(rectVertices);
    return {
      kind: "rect",
      start: { x: rect.x, y: rect.y },
      end: { x: rect.x + rect.width, y: rect.y + rect.height },
    };
  }
  if (isEllipse(points, box)) {
    return { kind: "ellipse", start: { x: box.x, y: box.y }, end: { x: box.x + box.width, y: box.y + box.height } };
  }
  return null;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boundsOf(points: readonly Point[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

function lineEndpoints(
  points: readonly Point[],
  first: Point,
  last: Point,
  diagonal: number,
): { start: Point; end: Point } | null {
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length < diagonal * 0.5) return null;
  let maxDeviation = 0;
  for (const p of points) {
    const deviation = Math.abs((p.x - first.x) * dy - (p.y - first.y) * dx) / length;
    if (deviation > maxDeviation) maxDeviation = deviation;
  }
  if (maxDeviation > length * LINE_MAX_DEVIATION_RATIO) return null;
  return { start: { ...first }, end: { ...last } };
}

function rectangleVertices(points: readonly Point[], box: Box, diagonal: number): Point[] | null {
  if (box.width < MIN_DIAGONAL * 0.4 || box.height < MIN_DIAGONAL * 0.4) return null;
  const corners = simplify(points, diagonal * 0.04);
  // A closed rectangle simplifies to 4 corners plus the duplicated closure point.
  const vertices = corners.length >= 5 && samePoint(corners[0], corners[corners.length - 1], diagonal * 0.05)
    ? corners.slice(0, -1)
    : corners;
  if (vertices.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const prev = vertices[(i + 3) % 4];
    const curr = vertices[i];
    const next = vertices[(i + 1) % 4];
    const angle = interiorAngle(prev, curr, next);
    if (Math.abs(angle - Math.PI / 2) > RECT_ANGLE_TOLERANCE) return null;
  }
  if (edgeCoverage(points, box) < 0.7) return null;
  return vertices;
}

function isEllipse(points: readonly Point[], box: Box): boolean {
  if (box.width < MIN_DIAGONAL * 0.4 || box.height < MIN_DIAGONAL * 0.4) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width / 2;
  const ry = box.height / 2;
  let sumSq = 0;
  const sectors = new Uint8Array(72);
  for (const p of points) {
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    const radius = Math.hypot(nx, ny);
    sumSq += (radius - 1) ** 2;
    const angle = Math.atan2(ny, nx);
    sectors[Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 72) % 72] = 1;
  }
  const rmse = Math.sqrt(sumSq / points.length);
  if (rmse > ELLIPSE_RADIAL_RMSE) return false;
  // The trace must wrap the full outline: no angular gap wider than the limit.
  let maxGap = 0;
  let gap = 0;
  for (let round = 0; round < 144; round++) {
    if (sectors[round % 72]) {
      gap = 0;
    } else {
      gap++;
      if (round >= 72 && gap > maxGap) maxGap = gap;
    }
  }
  return maxGap <= (ELLIPSE_MAX_GAP_DEG / 360) * 72;
}

// Ramer–Douglas–Peucker polyline simplification.
function simplify(points: readonly Point[], epsilon: number): Point[] {
  if (points.length < 3) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  let maxDeviation = 0;
  let split = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const deviation =
      length === 0
        ? Math.hypot(p.x - first.x, p.y - first.y)
        : Math.abs((p.x - first.x) * dy - (p.y - first.y) * dx) / length;
    if (deviation > maxDeviation) {
      maxDeviation = deviation;
      split = i;
    }
  }
  if (maxDeviation <= epsilon) return [{ ...first }, { ...last }];
  return [...simplify(points.slice(0, split + 1), epsilon).slice(0, -1), ...simplify(points.slice(split), epsilon)];
}

function samePoint(a: Point, b: Point, tolerance: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function interiorAngle(prev: Point, curr: Point, next: Point): number {
  const a1 = Math.atan2(prev.y - curr.y, prev.x - curr.x);
  const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
  let angle = Math.abs(a1 - a2);
  if (angle > Math.PI) angle = 2 * Math.PI - angle;
  return angle;
}

// Fraction of points lying near the bounding-box edges.
function edgeCoverage(points: readonly Point[], box: Box): number {
  const tolerance = Math.max(box.width, box.height) * 0.12;
  let near = 0;
  for (const p of points) {
    const dx = Math.min(Math.abs(p.x - box.x), Math.abs(p.x - (box.x + box.width)));
    const dy = Math.min(Math.abs(p.y - box.y), Math.abs(p.y - (box.y + box.height)));
    if (Math.min(dx, dy) <= tolerance) near++;
  }
  return near / points.length;
}
