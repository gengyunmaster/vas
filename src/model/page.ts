import type { ImageItem } from "./image";
import type { Stroke } from "./stroke";
import { newId } from "./stroke";

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const PAGE_GAP = 24;
export const PAGE_TOP_MARGIN = 24;
export const PLACEMENT_MARGIN = 40;

export const PAGE_PATTERNS = ["blank", "lined", "grid", "dots", "rice"] as const;

export type PagePattern = (typeof PAGE_PATTERNS)[number];

export interface Page {
  id: string;
  strokes: Stroke[];
  images: ImageItem[];
  paperColor: string;
  pattern: PagePattern;
}

export interface PageHit {
  index: number;
  x: number;
  y: number;
}

export function createPage(paperColor: string, pattern: PagePattern = "blank"): Page {
  return { id: newId(), strokes: [], images: [], paperColor, pattern };
}

export function pageTopY(index: number): number {
  return PAGE_TOP_MARGIN + index * (PAGE_HEIGHT + PAGE_GAP);
}

export function contentHeight(pageCount: number): number {
  if (pageCount <= 0) return PAGE_TOP_MARGIN;
  return PAGE_TOP_MARGIN + pageCount * PAGE_HEIGHT + (pageCount - 1) * PAGE_GAP + PAGE_GAP;
}

export function pageIndexAtY(worldY: number, pageCount: number): number {
  const raw = Math.floor((worldY - PAGE_TOP_MARGIN) / (PAGE_HEIGHT + PAGE_GAP));
  return Math.min(pageCount - 1, Math.max(0, raw));
}

export function pageAt(worldX: number, worldY: number, pageCount: number): PageHit | null {
  if (worldX < 0 || worldX > PAGE_WIDTH) return null;
  const rel = worldY - PAGE_TOP_MARGIN;
  if (rel < 0) return null;
  const index = Math.floor(rel / (PAGE_HEIGHT + PAGE_GAP));
  if (index >= pageCount) return null;
  const y = rel - index * (PAGE_HEIGHT + PAGE_GAP);
  if (y > PAGE_HEIGHT) return null;
  return { index, x: worldX, y };
}

export function clampToPage(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(PAGE_WIDTH, Math.max(0, x)),
    y: Math.min(PAGE_HEIGHT, Math.max(0, y)),
  };
}

export function trimTrailingBlankPages(pages: Page[]): Page[] {
  let end = pages.length;
  while (end > 1 && pages[end - 1].strokes.length === 0 && pages[end - 1].images.length === 0) {
    end--;
  }
  return pages.slice(0, end);
}

export function clonePageWithNewIds(page: Page): Page {
  return {
    id: newId(),
    paperColor: page.paperColor,
    pattern: page.pattern,
    strokes: page.strokes.map((stroke) => ({
      ...stroke,
      id: newId(),
      points: stroke.points.map((point) => ({ ...point })),
    })),
    images: page.images.map((image) => ({ ...image, id: newId() })),
  };
}
