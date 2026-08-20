import type { Bounds } from "../model/hitTest";
import type { ImageItem } from "../model/image";
import { PAGE_HEIGHT, PAGE_WIDTH, type Page } from "../model/page";
import type { Stroke } from "../model/stroke";
import { get2dContext } from "./canvas";
import { getImageBitmap } from "./imageCache";
import { drawPagePattern } from "./patterns";
import { drawStroke } from "./renderStroke";

export function paintPage(canvas: HTMLCanvasElement, page: Page, renderScale: number): void {
  canvas.width = Math.max(1, Math.round(PAGE_WIDTH * renderScale));
  canvas.height = Math.max(1, Math.round(PAGE_HEIGHT * renderScale));
  const ctx = get2dContext(canvas);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.fillStyle = page.paperColor;
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  drawPagePattern(ctx, page.pattern, page.paperColor);
  for (const image of page.images) {
    const bitmap = getImageBitmap(image.imageId);
    if (bitmap) ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
  }
  for (const stroke of page.strokes) drawStroke(ctx, stroke);
}

export function paintElements(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  images: ImageItem[],
  bounds: Bounds,
  renderScale: number,
): void {
  canvas.width = Math.max(1, Math.round((bounds.maxX - bounds.minX) * renderScale));
  canvas.height = Math.max(1, Math.round((bounds.maxY - bounds.minY) * renderScale));
  const ctx = get2dContext(canvas);
  ctx.setTransform(
    renderScale,
    0,
    0,
    renderScale,
    -bounds.minX * renderScale,
    -bounds.minY * renderScale,
  );
  for (const image of images) {
    const bitmap = getImageBitmap(image.imageId);
    if (bitmap) ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
  }
  for (const stroke of strokes) drawStroke(ctx, stroke);
}
