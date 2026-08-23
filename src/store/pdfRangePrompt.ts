import type { PageRange } from "../model/pdfPage";
import { useBoardStore } from "./useBoardStore";

let resolver: ((range: PageRange | null) => void) | null = null;

export function askPageRange(numPages: number): Promise<PageRange | null> {
  if (resolver) return Promise.resolve(null);
  return new Promise((resolve) => {
    resolver = resolve;
    useBoardStore.getState().setPdfRangeRequest({ numPages });
  });
}

export function settlePageRange(range: PageRange | null): void {
  const resolve = resolver;
  resolver = null;
  useBoardStore.getState().setPdfRangeRequest(null);
  resolve?.(range);
}
