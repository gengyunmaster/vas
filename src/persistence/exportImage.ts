import { ensureImageLoaded } from "../engine/imageCache";
import { paintPage } from "../engine/renderPage";
import type { Page } from "../model/page";
import { downloadBlob } from "./transfer";

const PNG_SCALE = 2;

export async function exportPagePng(title: string, pageIndex: number, page: Page): Promise<void> {
  await Promise.all(page.images.map((image) => ensureImageLoaded(image.imageId)));
  const canvas = document.createElement("canvas");
  paintPage(canvas, page, PNG_SCALE);
  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, `${title}-page-${pageIndex + 1}.png`);
    } else {
      window.alert("PNG export failed.");
    }
  }, "image/png");
}
