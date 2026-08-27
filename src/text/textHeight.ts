import type { TextItem } from "../model/textItem";

// Text height derives from layout, which is async (MathJax). Sync consumers
// (lasso, selection bounds, paste fitting) read this cache; the overlay and
// the export layout engine populate it after every real layout. A miss falls
// back to a rough estimate that only affects hit-test boxes briefly.
const cache = new Map<string, number>();

function keyOf(item: Pick<TextItem, "markdown" | "width" | "fontSize">): string {
  return `${item.fontSize}|${item.width}|${item.markdown}`;
}

export function noteTextItemHeight(
  item: Pick<TextItem, "markdown" | "width" | "fontSize">,
  height: number,
): void {
  if (Number.isFinite(height) && height > 0) cache.set(keyOf(item), height);
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
