import { ensureImageLoaded } from "../engine/imageCache";
import { paintElements, paintPage } from "../engine/renderPage";
import type { ImageItem } from "../model/image";
import { type Page, trimTrailingBlankPages } from "../model/page";
import type { Stroke } from "../model/stroke";
import { elementsBounds } from "../model/transform";
import { downloadZip } from "./exportZip";
import { cappedRenderScale } from "./rasterize";
import { downloadBlob, sanitizeFileName } from "./transfer";

const PNG_SCALE = 2;

export async function exportPagePng(title: string, pageIndex: number, page: Page): Promise<void> {
  const canvas = await renderPageCanvas(page);
  downloadBlob(await canvasToPng(canvas), `${title}-page-${pageIndex + 1}.png`);
}

export async function exportNotebookPng(title: string, pages: Page[]): Promise<void> {
  const kept = trimTrailingBlankPages(pages);
  if (kept.length === 1 && kept[0]) {
    await exportPagePng(title, 0, kept[0]);
    return;
  }
  const entries: { name: string; data: Uint8Array }[] = [];
  for (const [index, page] of kept.entries()) {
    const canvas = await renderPageCanvas(page);
    const blob = await canvasToPng(canvas);
    entries.push({
      name: `${sanitizeFileName(title)}-page-${index + 1}.png`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  downloadZip(title, entries);
}

export async function exportSelectionPng(
  title: string,
  strokes: Stroke[],
  images: ImageItem[],
): Promise<void> {
  const bounds = elementsBounds(strokes, images);
  if (!bounds) return;
  await Promise.all(images.map((image) => ensureImageLoaded(image.imageId)));
  const canvas = document.createElement("canvas");
  paintElements(
    canvas,
    strokes,
    images,
    bounds,
    cappedRenderScale(PNG_SCALE, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
  );
  downloadBlob(await canvasToPng(canvas), `${title}-selection.png`);
}

async function renderPageCanvas(page: Page): Promise<HTMLCanvasElement> {
  await Promise.all(page.images.map((image) => ensureImageLoaded(image.imageId)));
  const canvas = document.createElement("canvas");
  paintPage(canvas, page, cappedRenderScale(PNG_SCALE, page.width, page.height));
  return canvas;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))),
      "image/png",
    ),
  );
}
