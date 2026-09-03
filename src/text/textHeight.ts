import type { TextItem } from "../model/textItem";

// Text height derives from layout, which is async (MathJax). Sync consumers
// (lasso, selection bounds, paste fitting) read this cache; the overlay and
// the export layout engine populate it after every real layout. A miss falls
// back to a rough estimate that only affects hit-test boxes briefly.
// Insertion-order LRU: keys embed the full markdown, so every keystroke adds
// an entry — without a cap the map grows for the whole session.
const HEIGHT_CACHE_LIMIT = 500;
const cache = new Map<string, number>();

function keyOf(item: Pick<TextItem, "markdown" | "width" | "fontSize">): string {
  return `${item.fontSize}|${item.width}|${item.markdown}`;
}

export function clearTextHeightCache(): void {
  cache.clear();
}

// Measurements taken before the webfonts swap in are wrong; drop them so
// post-swap layouts replace the fallback-metric entries instead of sticking.
if (typeof document !== "undefined" && document.fonts) {
  void document.fonts.ready.then(() => clearTextHeightCache());
}

export function noteTextItemHeight(
  item: Pick<TextItem, "markdown" | "width" | "fontSize">,
  height: number,
): void {
  if (!Number.isFinite(height) || height <= 0) return;
  const key = keyOf(item);
  // The DOM (KaTeX) and the export layout engine pad tall math differently;
  // keep the larger measurement so bounds never clip content.
  const merged = Math.max(cache.get(key) ?? 0, height);
  cache.delete(key);
  cache.set(key, merged);
  while (cache.size > HEIGHT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function estimatedTextItemHeight(
  item: Pick<TextItem, "markdown" | "width" | "fontSize">,
): number {
  const charsPerLine = Math.max(1, Math.floor(item.width / (item.fontSize * 0.55)));
  let lines = 0;
  for (const line of item.markdown.split("\n")) {
    lines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  return lines * item.fontSize * 1.5 + item.fontSize * 0.5;
}

export function textItemHeight(item: Pick<TextItem, "markdown" | "width" | "fontSize">): number {
  return cache.get(keyOf(item)) ?? estimatedTextItemHeight(item);
}
