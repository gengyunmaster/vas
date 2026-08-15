import { arrowHead, ellipseOutline } from "./shapeGeometry";
import { effectiveStrokeSize, type Stroke } from "./stroke";

export const ERASER_TOLERANCE = 5;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function strokeBounds(stroke: Stroke, padding: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (stroke.shape === "arrow") {
    const [a, b] = stroke.points;
    if (a && b) {
      for (const wing of arrowHead(a, b, stroke.size)) {
        minX = Math.min(minX, wing.x);
        minY = Math.min(minY, wing.y);
        maxX = Math.max(maxX, wing.x);
        maxY = Math.max(maxY, wing.y);
      }
    }
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

export function hitTestStroke(
  point: { x: number; y: number },
  stroke: Stroke,
  tolerance: number,
): boolean {
  if (stroke.shape) return hitTestShape(point, stroke, tolerance);
  const radius = effectiveStrokeSize(stroke) / 2 + tolerance;
  const bounds = strokeBounds(stroke, radius);
  if (
    point.x < bounds.minX ||
    point.x > bounds.maxX ||
    point.y < bounds.minY ||
    point.y > bounds.maxY
  ) {
    return false;
  }
  const points = stroke.points;
  if (points.length === 1) {
    return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= radius;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (pointToSegmentDistance(point.x, point.y, a.x, a.y, b.x, b.y) <= radius) return true;
  }
  return false;
}

function hitTestShape(point: { x: number; y: number }, stroke: Stroke, tolerance: number): boolean {
  const radius = stroke.size / 2 + tolerance;
  const [a, b] = stroke.points;
  if (!a || !b) return false;
  switch (stroke.shape) {
    case "line":
      return pointToSegmentDistance(point.x, point.y, a.x, a.y, b.x, b.y) <= radius;
    case "arrow": {
      if (pointToSegmentDistance(point.x, point.y, a.x, a.y, b.x, b.y) <= radius) return true;
      const [left, right] = arrowHead(a, b, stroke.size);
      return (
        pointToSegmentDistance(point.x, point.y, b.x, b.y, left.x, left.y) <= radius ||
        pointToSegmentDistance(point.x, point.y, b.x, b.y, right.x, right.y) <= radius
      );
    }
    case "rect": {
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      const insideExpanded =
        point.x >= x1 - radius &&
        point.x <= x2 + radius &&
        point.y >= y1 - radius &&
        point.y <= y2 + radius;
      const insideShrunk =
        point.x > x1 + radius &&
        point.x < x2 - radius &&
        point.y > y1 + radius &&
        point.y < y2 - radius;
      return insideExpanded && !insideShrunk;
    }
    case "ellipse": {
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      if (rx < 1 || ry < 1) {
        return pointToSegmentDistance(point.x, point.y, a.x, a.y, b.x, b.y) <= radius;
      }
      const outline = ellipseOutline(a, b);
      for (let i = 0; i < outline.length; i++) {
        const p1 = outline[i];
        const p2 = outline[(i + 1) % outline.length];
        if (pointToSegmentDistance(point.x, point.y, p1.x, p1.y, p2.x, p2.y) <= radius) {
          return true;
        }
      }
      return false;
    }
    default:
      return false;
  }
}
