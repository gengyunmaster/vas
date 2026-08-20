import { type Bounds, strokeBounds } from "./hitTest";
import type { ImageItem } from "./image";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./page";
import type { Point } from "./shapeGeometry";
import { effectiveStrokeSize, type Stroke } from "./stroke";

export function strokesBounds(strokes: Stroke[]): Bounds | null {
  if (strokes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    const bounds = strokeBounds(stroke, inkMargin(stroke));
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  return { minX, minY, maxX, maxY };
}

export function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  };
}

export function translateImage(image: ImageItem, dx: number, dy: number): ImageItem {
  return { ...image, x: image.x + dx, y: image.y + dy };
}

export function scaleImage(image: ImageItem, anchor: Point, sx: number, sy: number): ImageItem {
  return {
    ...image,
    x: anchor.x + (image.x - anchor.x) * sx,
    y: anchor.y + (image.y - anchor.y) * sy,
    width: image.width * sx,
    height: image.height * sy,
  };
}

export function imagesBounds(images: ImageItem[]): Bounds | null {
  if (images.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const image of images) {
    minX = Math.min(minX, image.x);
    minY = Math.min(minY, image.y);
    maxX = Math.max(maxX, image.x + image.width);
    maxY = Math.max(maxY, image.y + image.height);
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function elementsBounds(strokes: Stroke[], images: ImageItem[]): Bounds | null {
  return unionBounds(strokesBounds(strokes), imagesBounds(images));
}

export function scaleStroke(stroke: Stroke, anchor: Point, sx: number, sy: number): Stroke {
  return {
    ...stroke,
    size: stroke.size * Math.sqrt(Math.abs(sx * sy)),
    points: stroke.points.map((p) => ({
      ...p,
      x: anchor.x + (p.x - anchor.x) * sx,
      y: anchor.y + (p.y - anchor.y) * sy,
    })),
  };
}

export function translateBounds(bounds: Bounds, dx: number, dy: number): Bounds {
  return {
    minX: bounds.minX + dx,
    minY: bounds.minY + dy,
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy,
  };
}

export function scaleBounds(bounds: Bounds, anchor: Point, sx: number, sy: number): Bounds {
  const xs = [bounds.minX, bounds.maxX].map((x) => anchor.x + (x - anchor.x) * sx);
  const ys = [bounds.minY, bounds.maxY].map((y) => anchor.y + (y - anchor.y) * sy);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function clampMoveDelta(bounds: Bounds, dx: number, dy: number): { dx: number; dy: number } {
  return {
    dx: clamp(dx, -bounds.minX, PAGE_WIDTH - bounds.maxX),
    dy: clamp(dy, -bounds.minY, PAGE_HEIGHT - bounds.maxY),
  };
}

export function clampScaleToPage(
  bounds: Bounds,
  anchor: Point,
  sx: number,
  sy: number,
): { sx: number; sy: number } {
  return {
    sx: Math.min(sx, maxScale(bounds.minX, bounds.maxX, anchor.x, PAGE_WIDTH)),
    sy: Math.min(sy, maxScale(bounds.minY, bounds.maxY, anchor.y, PAGE_HEIGHT)),
  };
}

function maxScale(min: number, max: number, anchor: number, extent: number): number {
  let limit = Infinity;
  if (min < anchor) limit = Math.min(limit, anchor / (anchor - min));
  if (max > anchor) limit = Math.min(limit, (extent - anchor) / (max - anchor));
  return limit;
}

function inkMargin(stroke: Stroke): number {
  return effectiveStrokeSize(stroke) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
