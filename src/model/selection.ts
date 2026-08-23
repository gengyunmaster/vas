import { ERASER_TOLERANCE, hitTestStroke } from "./hitTest";
import type { ImageItem } from "./image";
import type { Page } from "./page";
import { arrowHead, ellipseOutline, type Point } from "./shapeGeometry";
import { effectiveStrokeSize, type Stroke } from "./stroke";

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(b1, b2, a1)) return true;
  if (d2 === 0 && onSegment(b1, b2, a2)) return true;
  if (d3 === 0 && onSegment(a1, a2, b1)) return true;
  if (d4 === 0 && onSegment(a1, a2, b2)) return true;
  return false;
}

export function strokeInLasso(stroke: Stroke, lasso: Point[]): boolean {
  if (lasso.length < 2) return false;
  const segments = strokeSegments(stroke);
  const vertices = stroke.shape ? segments.flat() : (stroke.points as Point[]);
  const radius = effectiveStrokeSize(stroke) / 2 + ERASER_TOLERANCE;
  const region = lassoBounds(lasso);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  if (
    maxX + radius < region.minX ||
    minX - radius > region.maxX ||
    maxY + radius < region.minY ||
    minY - radius > region.maxY
  ) {
    return false;
  }
  for (const vertex of vertices) {
    if (pointInPolygon(vertex, lasso)) return true;
  }
  const edges = polygonEdges(lasso);
  for (const [p1, p2] of segments) {
    for (const [q1, q2] of edges) {
      if (segmentsIntersect(p1, p2, q1, q2)) return true;
    }
  }
  for (const vertex of lasso) {
    if (hitTestStroke(vertex, stroke, ERASER_TOLERANCE)) return true;
  }
  return false;
}

export function strokesInLasso(strokes: Stroke[], lasso: Point[]): Stroke[] {
  if (lasso.length < 2) return [];
  return strokes.filter((stroke) => strokeInLasso(stroke, lasso));
}

export function imageInLasso(image: ImageItem, lasso: Point[]): boolean {
  if (lasso.length < 2) return false;
  const region = lassoBounds(lasso);
  if (
    image.x > region.maxX ||
    image.x + image.width < region.minX ||
    image.y > region.maxY ||
    image.y + image.height < region.minY
  ) {
    return false;
  }
  const corners = [
    { x: image.x, y: image.y },
    { x: image.x + image.width, y: image.y },
    { x: image.x + image.width, y: image.y + image.height },
    { x: image.x, y: image.y + image.height },
  ];
  for (const corner of corners) {
    if (pointInPolygon(corner, lasso)) return true;
  }
  const lassoEdges = polygonEdges(lasso);
  for (let i = 0; i < corners.length; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    for (const [q1, q2] of lassoEdges) {
      if (segmentsIntersect(p1, p2, q1, q2)) return true;
    }
  }
  for (const vertex of lasso) {
    if (
      vertex.x >= image.x &&
      vertex.x <= image.x + image.width &&
      vertex.y >= image.y &&
      vertex.y <= image.y + image.height
    ) {
      return true;
    }
  }
  return false;
}

export function imagesInLasso(images: ImageItem[], lasso: Point[]): ImageItem[] {
  if (lasso.length < 2) return [];
  return images.filter((image) => !image.locked && imageInLasso(image, lasso));
}

export function pickElements(
  page: Page,
  strokeIds: string[],
  imageIds: string[],
): { strokes: Stroke[]; images: ImageItem[] } {
  const strokeIdSet = new Set(strokeIds);
  const imageIdSet = new Set(imageIds);
  return {
    strokes: page.strokes.filter((stroke) => strokeIdSet.has(stroke.id)),
    images: page.images.filter((image) => imageIdSet.has(image.id)),
  };
}

function polygonEdges(polygon: Point[]): [Point, Point][] {
  const edges: [Point, Point][] = [];
  for (let i = 0; i < polygon.length; i++) {
    edges.push([polygon[i], polygon[(i + 1) % polygon.length]]);
  }
  return edges;
}

function strokeSegments(stroke: Stroke): [Point, Point][] {
  if (!stroke.shape) {
    const segments: [Point, Point][] = [];
    const points = stroke.points;
    for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
    return segments;
  }
  const [a, b] = stroke.points;
  if (!a || !b) return [];
  switch (stroke.shape) {
    case "line":
      return [[a, b]];
    case "arrow": {
      const [left, right] = arrowHead(a, b, stroke.size);
      return [
        [a, b],
        [b, left],
        [b, right],
      ];
    }
    case "rect": {
      const tl = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
      const br = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
      const tr = { x: br.x, y: tl.y };
      const bl = { x: tl.x, y: br.y };
      return [
        [tl, tr],
        [tr, br],
        [br, bl],
        [bl, tl],
      ];
    }
    case "ellipse": {
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      if (rx < 1 || ry < 1) return [[a, b]];
      const outline = ellipseOutline(a, b);
      return outline.map((point, i) => [point, outline[(i + 1) % outline.length]]);
    }
  }
}

function lassoBounds(lasso: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of lasso) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}
