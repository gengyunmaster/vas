import type { PageRange } from "../model/pdfPage";
import { useBoardStore } from "./useBoardStore";

let resolver: ((range: PageRange | null) => void) | null = null;

// A "single" prompt picks exactly one page; it is returned as { from: n, to: n }.
export function askPageRange(
  numPages: number,
  mode: "range" | "single" = "range",
): Promise<PageRange | null> {
  if (resolver) return Promise.resolve(null);
  return new Promise((resolve) => {
    resolver = resolve;
    useBoardStore.getState().setPdfRangeRequest({ numPages, mode });
  });
}

export function settlePageRange(range: PageRange | null): void {
  const resolve = resolver;
  resolver = null;
  useBoardStore.getState().setPdfRangeRequest(null);
  resolve?.(range);
}
