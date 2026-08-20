import { placeImageCentered } from "./image";
import { type Page, type PagePattern, pageIndexAtY } from "./page";
import { newId } from "./stroke";
import type { ViewState } from "./viewState";

export interface PdfPageImage {
  imageId: string;
  naturalWidth: number;
  naturalHeight: number;
}

export function buildPdfPages(
  pdfPages: PdfPageImage[],
  paperColor: string,
  pattern: PagePattern,
  docId?: string,
): Page[] {
  return pdfPages.map((pdfPage, index) => ({
    id: newId(),
    strokes: [],
    images: [
      {
        id: newId(),
        imageId: pdfPage.imageId,
        ...placeImageCentered(pdfPage.naturalWidth, pdfPage.naturalHeight),
        locked: true,
      },
    ],
    paperColor,
    pattern,
    ...(docId ? { pdfSource: { docId, pageIndex: index } } : {}),
  }));
}

export function pdfInsertIndex(viewState: ViewState | undefined, pageCount: number): number {
  if (pageCount <= 0) return 0;
  if (!viewState || !Number.isFinite(viewState.y)) return pageCount;
  return pageIndexAtY(viewState.y, pageCount) + 1;
}
