import { acquireFirstFrames, ensureImageLoaded } from "../engine/imageCache";
import { paintElements, paintPageForExport } from "../engine/renderPage";
import type { AudioItem } from "../model/audioItem";
import type { ImageItem } from "../model/image";
import { type Page, trimTrailingBlankPages } from "../model/page";
import type { Stroke } from "../model/stroke";
import { type TextItem, textImageRefs } from "../model/textItem";
import { elementsBounds } from "../model/transform";
import { textItemHeight } from "../text/textHeight";
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
  texts: TextItem[] = [],
  audios: AudioItem[] = [],
  paperColor = "#ffffff",
): Promise<void> {
  const bounds = elementsBounds(
    strokes,
    images,
    texts.map((item) => ({ item, height: textItemHeight(item) })),
    audios,
  );
  if (!bounds) return;
  const ids = imageIdsInScope(images, texts);
  await Promise.all(ids.map((id) => ensureImageLoaded(id)));
  const release = await acquireFirstFrames(ids);
  try {
    const canvas = document.createElement("canvas");
    await paintElements(
      canvas,
      strokes,
      images,
      bounds,
      cappedRenderScale(PNG_SCALE, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
      texts,
      audios,
      paperColor,
    );
    downloadBlob(await canvasToPng(canvas), `${title}-selection.png`);
  } finally {
    release();
  }
}

async function renderPageCanvas(page: Page): Promise<HTMLCanvasElement> {
  const ids = imageIdsInScope(page.images, page.texts);
  await Promise.all(ids.map((id) => ensureImageLoaded(id)));
  const release = await acquireFirstFrames(ids);
  try {
    const canvas = document.createElement("canvas");
    await paintPageForExport(canvas, page, cappedRenderScale(PNG_SCALE, page.width, page.height));
    return canvas;
  } finally {
    release();
  }
}

function imageIdsInScope(images: ImageItem[], texts: TextItem[]): string[] {
  const ids = new Set(images.map((image) => image.imageId));
  for (const text of texts) for (const id of textImageRefs(text.markdown)) ids.add(id);
  return [...ids];
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))),
      "image/png",
    ),
  );
}
