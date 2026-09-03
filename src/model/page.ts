import type { AudioItem } from "./audioItem";
import type { ImageItem } from "./image";
import type { Stroke } from "./stroke";
import { newId } from "./stroke";
import type { TextItem } from "./textItem";

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const MIN_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 5000;
export const PAGE_GAP = 24;
export const PAGE_TOP_MARGIN = 24;
export const PLACEMENT_MARGIN = 40;

export const PAGE_PATTERNS = ["blank", "lined", "grid", "dots", "rice"] as const;

export type PagePattern = (typeof PAGE_PATTERNS)[number];

export interface PageSize {
  width: number;
  height: number;
}

export const DEFAULT_PAGE_SIZE: PageSize = { width: PAGE_WIDTH, height: PAGE_HEIGHT };

export interface PdfSource {
  docId: string;
  pageIndex: number;
  // Import-time choice: paint an opaque white backdrop under the page content.
  // Absent on legacy records: base pages behaved white, PDF images transparent.
  whiteBackground?: boolean;
}

export interface Page {
  id: string;
  width: number;
  height: number;
  strokes: Stroke[];
  images: ImageItem[];
  texts: TextItem[];
  audios: AudioItem[];
  paperColor: string;
  pattern: PagePattern;
  pdfSource?: PdfSource;
}

export interface PageHit {
  index: number;
  x: number;
  y: number;
}

export function createPage(
  paperColor: string,
  pattern: PagePattern = "blank",
  size: PageSize = DEFAULT_PAGE_SIZE,
): Page {
  return {
    id: newId(),
    width: size.width,
    height: size.height,
    strokes: [],
    images: [],
    texts: [],
    audios: [],
    paperColor,
    pattern,
  };
}

export function clampPageSize(size: PageSize): PageSize {
  return {
    width: clamp(Math.round(size.width), MIN_PAGE_SIZE, MAX_PAGE_SIZE),
    height: clamp(Math.round(size.height), MIN_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

export function boardWidth(pages: readonly Page[]): number {
  let width = pages.length === 0 ? PAGE_WIDTH : 0;
  for (const page of pages) width = Math.max(width, page.width);
  return width;
}

export function pageLeftX(board: number, page: Page): number {
  return (board - page.width) / 2;
}

export function pageTops(pages: readonly Page[]): number[] {
  const tops: number[] = [];
  let top = PAGE_TOP_MARGIN;
  for (const page of pages) {
    tops.push(top);
    top += page.height + PAGE_GAP;
  }
  return tops;
}

export function pageTopY(pages: readonly Page[], index: number): number {
  let top = PAGE_TOP_MARGIN;
  for (let i = 0; i < index && i < pages.length; i++) top += pages[i].height + PAGE_GAP;
  return top;
}

export function contentHeight(pages: readonly Page[]): number {
  if (pages.length === 0) return PAGE_TOP_MARGIN;
  let height = PAGE_TOP_MARGIN;
  for (const page of pages) height += page.height;
  return height + (pages.length - 1) * PAGE_GAP + PAGE_GAP;
}

export function pageIndexAtY(pages: readonly Page[], worldY: number): number {
  let top = PAGE_TOP_MARGIN;
  for (let i = 0; i < pages.length; i++) {
    top += pages[i].height + PAGE_GAP;
    if (worldY < top) return i;
  }
  return Math.max(0, pages.length - 1);
}

export function pageAt(pages: readonly Page[], worldX: number, worldY: number): PageHit | null {
  const board = boardWidth(pages);
  let top = PAGE_TOP_MARGIN;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (worldY < top) return null;
    if (worldY <= top + page.height) {
      const left = pageLeftX(board, page);
      if (worldX < left || worldX > left + page.width) return null;
      return { index: i, x: worldX - left, y: worldY - top };
    }
    top += page.height + PAGE_GAP;
  }
  return null;
}

export function clampToPage(page: Page, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(page.width, Math.max(0, x)),
    y: Math.min(page.height, Math.max(0, y)),
  };
}

export function trimTrailingBlankPages(pages: Page[]): Page[] {
  let end = pages.length;
  while (
    end > 1 &&
    pages[end - 1].strokes.length === 0 &&
    pages[end - 1].images.length === 0 &&
    pages[end - 1].texts.length === 0 &&
    pages[end - 1].audios.length === 0
  ) {
    end--;
  }
  return pages.slice(0, end);
}

export function clonePageWithNewIds(page: Page): Page {
  return {
    id: newId(),
    width: page.width,
    height: page.height,
    paperColor: page.paperColor,
    pattern: page.pattern,
    strokes: page.strokes.map((stroke) => ({
      ...stroke,
      id: newId(),
      points: stroke.points.map((point) => ({ ...point })),
    })),
    images: page.images.map((image) => ({ ...image, id: newId() })),
    texts: page.texts.map((text) => ({ ...text, id: newId() })),
    audios: page.audios.map((audio) => ({ ...audio, id: newId() })),
    ...(page.pdfSource ? { pdfSource: { ...page.pdfSource } } : {}),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
