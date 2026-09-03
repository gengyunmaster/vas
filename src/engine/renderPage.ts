import type { AudioItem } from "../model/audioItem";
import { isDarkColor } from "../model/color";
import type { Bounds } from "../model/hitTest";
import type { ImageItem } from "../model/image";
import { paintBadge } from "../model/mediaBadge";
import type { Page } from "../model/page";
import type { Stroke } from "../model/stroke";
import type { TextItem } from "../model/textItem";
import { paintTextItems } from "../text/paintTexts";
import { get2dContext } from "./canvas";
import { getImageBitmap } from "./imageCache";
import { drawPagePattern } from "./patterns";
import { drawStroke } from "./renderStroke";

export function paintPage(canvas: HTMLCanvasElement, page: Page, renderScale: number): void {
  canvas.width = Math.max(1, Math.round(page.width * renderScale));
  canvas.height = Math.max(1, Math.round(page.height * renderScale));
  const ctx = get2dContext(canvas);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.fillStyle = page.paperColor;
  ctx.fillRect(0, 0, page.width, page.height);
  drawPagePattern(ctx, page.pattern, page.paperColor, page.width, page.height);
  for (const image of page.images) {
    const bitmap = getImageBitmap(image.imageId);
    if (bitmap) ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
  }
  for (const stroke of page.strokes) drawStroke(ctx, stroke);
}

// Export-only variant: texts and audio badges stay in DOM overlays on screen,
// so the hot cache path above stays synchronous; here they join the bitmap
// between the image layer and the ink layer.
export async function paintPageForExport(
  canvas: HTMLCanvasElement,
  page: Page,
  renderScale: number,
): Promise<void> {
  canvas.width = Math.max(1, Math.round(page.width * renderScale));
  canvas.height = Math.max(1, Math.round(page.height * renderScale));
  const ctx = get2dContext(canvas);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.fillStyle = page.paperColor;
  ctx.fillRect(0, 0, page.width, page.height);
  drawPagePattern(ctx, page.pattern, page.paperColor, page.width, page.height);
  for (const image of page.images) {
    const bitmap = getImageBitmap(image.imageId);
    if (bitmap) ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
  }
  for (const audio of page.audios) paintBadge(ctx, audio, page.paperColor);
  await paintTextItems(ctx, page.texts, isDarkColor(page.paperColor));
  for (const stroke of page.strokes) drawStroke(ctx, stroke);
}

export async function paintElements(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  images: ImageItem[],
  bounds: Bounds,
  renderScale: number,
  texts: TextItem[] = [],
  audios: AudioItem[] = [],
  paperColor = "#ffffff",
): Promise<void> {
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
  for (const audio of audios) paintBadge(ctx, audio, paperColor);
  await paintTextItems(ctx, texts);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}
