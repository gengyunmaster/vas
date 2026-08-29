import { type Bounds, strokeBounds } from "./hitTest";
import type { ImageItem } from "./image";
import type { Point } from "./shapeGeometry";
import { effectiveStrokeSize, type Stroke } from "./stroke";
import { MIN_TEXT_WIDTH, type TextItem } from "./textItem";

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

// Text boxes need their laid-out height for bounds; callers resolve it from
// the text height cache and pass it along.
export function textBounds(text: TextItem, height: number): Bounds {
  return { minX: text.x, minY: text.y, maxX: text.x + text.width, maxY: text.y + height };
}

export function translateText(text: TextItem, dx: number, dy: number): TextItem {
  return { ...text, x: text.x + dx, y: text.y + dy };
}

// Selection scaling reflows text: the position follows the gesture fully, the
// width follows horizontally, and the font size stays put so glyphs are never
// stretched. Vertical-only drags therefore move the box without reshaping it.
export function scaleTextReflow(text: TextItem, anchor: Point, sx: number, sy: number): TextItem {
  return {
    ...text,
    x: anchor.x + (text.x - anchor.x) * sx,
    y: anchor.y + (text.y - anchor.y) * sy,
    width: Math.max(MIN_TEXT_WIDTH, text.width * sx),
  };
}

// Uniform scaling for whole-content shrink-to-fit (page resize, paste fit).
export function scaleTextUniform(text: TextItem, anchor: Point, scale: number): TextItem {
  return {
    ...text,
    x: anchor.x + (text.x - anchor.x) * scale,
    y: anchor.y + (text.y - anchor.y) * scale,
    width: Math.max(MIN_TEXT_WIDTH, text.width * scale),
    fontSize: Math.min(200, Math.max(6, text.fontSize * scale)),
  };
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

export function elementsBounds(
  strokes: Stroke[],
  images: ImageItem[],
  texts: { item: TextItem; height: number }[] = [],
): Bounds | null {
  let bounds = unionBounds(strokesBounds(strokes), imagesBounds(images));
  for (const { item, height } of texts) bounds = unionBounds(bounds, textBounds(item, height));
  return bounds;
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

export function clampMoveDelta(
  bounds: Bounds,
  dx: number,
  dy: number,
  pageWidth: number,
  pageHeight: number,
): { dx: number; dy: number } {
  return {
    dx: clamp(dx, -bounds.minX, pageWidth - bounds.maxX),
    dy: clamp(dy, -bounds.minY, pageHeight - bounds.maxY),
  };
}

// Centering clamps only the centered axis: oversized content flushes to an
// edge instead of overflowing, and the other axis stays untouched.
export function centerDelta(
  bounds: Bounds,
  pageWidth: number,
  pageHeight: number,
  axis: "horizontal" | "vertical",
): { dx: number; dy: number } {
  if (axis === "horizontal") {
    const dx = (pageWidth - (bounds.maxX - bounds.minX)) / 2 - bounds.minX;
    return { dx: clamp(dx, -bounds.minX, pageWidth - bounds.maxX), dy: 0 };
  }
  const dy = (pageHeight - (bounds.maxY - bounds.minY)) / 2 - bounds.minY;
  return { dx: 0, dy: clamp(dy, -bounds.minY, pageHeight - bounds.maxY) };
}

export function clampScaleToPage(
  bounds: Bounds,
  anchor: Point,
  sx: number,
  sy: number,
  pageWidth: number,
  pageHeight: number,
): { sx: number; sy: number } {
  return {
    sx: Math.min(sx, maxScale(bounds.minX, bounds.maxX, anchor.x, pageWidth)),
    sy: Math.min(sy, maxScale(bounds.minY, bounds.maxY, anchor.y, pageHeight)),
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
