import { placeImageCentered } from "./image";
import {
  clampPageSize,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  type Page,
  type PageSize,
} from "./page";
import { scaleImage, scaleStroke } from "./transform";

// PDF points are 1/72in, world units are 96dpi px; A4 PDF maps exactly to 794x1123
export const PDF_PAGE_SCALE = 4 / 3;

export function pdfPageSize(pdfWidth: number, pdfHeight: number): PageSize {
  if (
    !Number.isFinite(pdfWidth) ||
    !Number.isFinite(pdfHeight) ||
    pdfWidth <= 0 ||
    pdfHeight <= 0
  ) {
    return DEFAULT_PAGE_SIZE;
  }
  const width = pdfWidth * PDF_PAGE_SCALE;
  const height = pdfHeight * PDF_PAGE_SCALE;
  const shrink = Math.min(1, MAX_PAGE_SIZE / width, MAX_PAGE_SIZE / height);
  const grow = Math.max(1, MIN_PAGE_SIZE / (width * shrink), MIN_PAGE_SIZE / (height * shrink));
  return clampPageSize({ width: width * shrink * grow, height: height * shrink * grow });
}

export function resizePage(page: Page, size: PageSize): Page {
  const next = clampPageSize(size);
  if (next.width === page.width && next.height === page.height) return page;
  const scale = Math.min(next.width / page.width, next.height / page.height, 1);
  const anchor = { x: 0, y: 0 };
  return {
    ...page,
    width: next.width,
    height: next.height,
    strokes:
      scale === 1
        ? page.strokes
        : page.strokes.map((stroke) => scaleStroke(stroke, anchor, scale, scale)),
    images: page.images.map((image) =>
      image.locked
        ? { ...image, ...placeImageCentered(image.width, image.height, next.width, next.height) }
        : scale === 1
          ? image
          : scaleImage(image, anchor, scale, scale),
    ),
  };
}
