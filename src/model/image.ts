import { PLACEMENT_MARGIN } from "./page";
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
