import { type PdfSource, PLACEMENT_MARGIN } from "./page";
import { newId } from "./stroke";

export interface ImageItem {
  id: string;
  imageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;
  // Geometry figures keep their editable source document in the geometry table.
  geometryId?: string;
  // PDF page inserted as an image: imageId holds the raster preview while
  // pdfSource points at the original document for vector PDF export.
  pdfSource?: PdfSource;
}

export function placeImageSize(
  naturalWidth: number,
  naturalHeight: number,
  pageWidth: number,
  pageHeight: number,
): { width: number; height: number } {
  const safeWidth = naturalWidth > 0 && Number.isFinite(naturalWidth) ? naturalWidth : 300;
  const safeHeight = naturalHeight > 0 && Number.isFinite(naturalHeight) ? naturalHeight : 150;
  const maxWidth = pageWidth - PLACEMENT_MARGIN * 2;
  const maxHeight = pageHeight - PLACEMENT_MARGIN * 2;
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);
  return { width: safeWidth * scale, height: safeHeight * scale };
}

export function placeImageCentered(
  naturalWidth: number,
  naturalHeight: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const safeWidth = naturalWidth > 0 && Number.isFinite(naturalWidth) ? naturalWidth : 300;
  const safeHeight = naturalHeight > 0 && Number.isFinite(naturalHeight) ? naturalHeight : 150;
  const scale = Math.min(pageWidth / safeWidth, pageHeight / safeHeight);
  const width = safeWidth * scale;
  const height = safeHeight * scale;
  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

export function rescaledImageRect(
  item: Pick<ImageItem, "x" | "y" | "width" | "height">,
  oldNatural: { width: number; height: number } | null,
  newNatural: { width: number; height: number },
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  let width: number | null = null;
  let height: number | null = null;
  if (
    oldNatural !== null &&
    oldNatural.width > 0 &&
    Number.isFinite(oldNatural.width) &&
    oldNatural.height > 0 &&
    Number.isFinite(oldNatural.height) &&
    item.width > 0 &&
    Number.isFinite(item.width) &&
    item.height > 0 &&
    Number.isFinite(item.height) &&
    newNatural.width > 0 &&
    Number.isFinite(newNatural.width) &&
    newNatural.height > 0 &&
    Number.isFinite(newNatural.height)
  ) {
    width = (newNatural.width * item.width) / oldNatural.width;
    height = (newNatural.height * item.height) / oldNatural.height;
  }
  if (width === null || height === null) {
    const placed = placeImageSize(newNatural.width, newNatural.height, pageWidth, pageHeight);
    width = placed.width;
    height = placed.height;
  }
  // Fit against page bounds rather than placement margins so an unchanged figure keeps its rect.
  const fit = Math.min(1, pageWidth / width, pageHeight / height);
  width *= fit;
  height *= fit;
  const x = Math.min(Math.max(item.x, 0), Math.max(0, pageWidth - width));
  const y = Math.min(Math.max(item.y, 0), Math.max(0, pageHeight - height));
  return { x, y, width, height };
}

export function createImageItem(
  imageId: string,
  naturalWidth: number,
  naturalHeight: number,
  pageWidth: number,
  pageHeight: number,
): ImageItem {
  const { width, height } = placeImageSize(naturalWidth, naturalHeight, pageWidth, pageHeight);
  return { id: newId(), imageId, x: PLACEMENT_MARGIN, y: PLACEMENT_MARGIN, width, height };
}

export function imageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}
