import { placeImageCentered } from "./image";
import { type Page, type PagePattern, type PageSize, pageIndexAtY } from "./page";
import { newId } from "./stroke";
import type { ViewState } from "./viewState";

export interface PdfPageImage {
  imageId: string;
  naturalWidth: number;
  naturalHeight: number;
  // 0-based index into the source PDF; defaults to the array position when absent.
  pageIndex?: number;
}

export interface PageRange {
  from: number;
  to: number;
}

export function normalizePageRange(
  first: number,
  last: number,
  numPages: number,
): PageRange | null {
  if (!Number.isInteger(first) || !Number.isInteger(last)) return null;
  if (!Number.isInteger(numPages) || numPages < 1) return null;
  const from = Math.min(first, last);
  const to = Math.max(first, last);
  if (from < 1 || to > numPages) return null;
  return { from, to };
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
      ...(docId ? { pdfSource: { docId, pageIndex: pdfPage.pageIndex ?? index } } : {}),
    };
  });
}

export function pdfInsertIndex(viewState: ViewState | undefined, pages: Page[]): number {
  if (pages.length <= 0) return 0;
  if (!viewState || !Number.isFinite(viewState.y)) return pages.length;
  return pageIndexAtY(pages, viewState.y) + 1;
}
