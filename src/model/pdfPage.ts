import { placeImageCentered } from "./image";
import { type Page, type PagePattern, type PageSize, pageIndexAtY } from "./page";
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
  sizeFor: (pdfPage: PdfPageImage) => PageSize,
  docId?: string,
): Page[] {
  return pdfPages.map((pdfPage, index) => {
    const size = sizeFor(pdfPage);
    return {
      id: newId(),
      width: size.width,
      height: size.height,
      strokes: [],
      images: [
        {
          id: newId(),
          imageId: pdfPage.imageId,
          ...placeImageCentered(
            pdfPage.naturalWidth,
            pdfPage.naturalHeight,
            size.width,
            size.height,
          ),
          locked: true,
        },
      ],
      paperColor,
      pattern,
      ...(docId ? { pdfSource: { docId, pageIndex: index } } : {}),
    };
  });
}

export function pdfInsertIndex(viewState: ViewState | undefined, pages: Page[]): number {
  if (pages.length <= 0) return 0;
  if (!viewState || !Number.isFinite(viewState.y)) return pages.length;
  return pageIndexAtY(pages, viewState.y) + 1;
}
