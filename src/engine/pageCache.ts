import type { ImageItem } from "../model/image";
import { PAGE_HEIGHT, PAGE_WIDTH, type Page } from "../model/page";
import { get2dContext } from "./canvas";
import { paintPage } from "./renderPage";
import { drawStroke } from "./renderStroke";

const MAX_CACHE_PIXELS = 16_000_000;
export const MAX_CACHE_RENDER_SCALE = Math.sqrt(MAX_CACHE_PIXELS / (PAGE_WIDTH * PAGE_HEIGHT));

interface CacheEntry {
  canvas: HTMLCanvasElement;
  renderScale: number;
  page: Page;
  renderedCount: number;
}

export class PageCache {
  private entries = new Map<string, CacheEntry>();

  sync(page: Page, renderScale: number): HTMLCanvasElement {
    renderScale = Math.min(renderScale, MAX_CACHE_RENDER_SCALE);
    const entry = this.entries.get(page.id);
    if (
      entry &&
      entry.renderScale === renderScale &&
      entry.page.paperColor === page.paperColor &&
      entry.page.pattern === page.pattern
    ) {
      if (entry.page === page) return entry.canvas;
      if (canAppendToCache(entry, page)) {
        const ctx = get2dContext(entry.canvas);
        for (const stroke of page.strokes.slice(entry.renderedCount)) drawStroke(ctx, stroke);
        entry.renderedCount = page.strokes.length;
        entry.page = page;
        return entry.canvas;
      }
    }
    return this.render(page, renderScale);
  }

  peek(pageId: string): HTMLCanvasElement | undefined {
    return this.entries.get(pageId)?.canvas;
  }

  drop(pageId: string): void {
    this.entries.delete(pageId);
  }

  prune(keepIds: Set<string>): void {
    for (const id of this.entries.keys()) {
      if (!keepIds.has(id)) this.entries.delete(id);
    }
  }

  private render(page: Page, renderScale: number): HTMLCanvasElement {
    let entry = this.entries.get(page.id);
    if (!entry) {
      entry = { canvas: document.createElement("canvas"), renderScale, page, renderedCount: 0 };
      this.entries.set(page.id, entry);
    }
    paintPage(entry.canvas, page, renderScale);
    entry.renderScale = renderScale;
    entry.page = page;
    entry.renderedCount = page.strokes.length;
    return entry.canvas;
  }
}

export function canAppendToCache(
  cached: { page: Page; renderedCount: number },
  next: Page,
): boolean {
  if (cached.renderedCount > next.strokes.length) return false;
  if (!sameImages(cached.page.images, next.images)) return false;
  for (let i = 0; i < cached.renderedCount; i++) {
    if (cached.page.strokes[i] !== next.strokes[i]) return false;
  }
  return true;
}

function sameImages(a: ImageItem[], b: ImageItem[]): boolean {
  return a.length === b.length && a.every((image, index) => image === b[index]);
}
