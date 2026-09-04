import type { Page } from "../model/page";
import { toast } from "../store/toasts";
import { useBoardStore } from "../store/useBoardStore";
import { replacePages, savePage } from "./notebooks";

let saveErrorReported = false;

export function startAutosave(): () => void {
  return useBoardStore.subscribe((state, prev) => {
    const notebookId = state.notebookId;
    if (!notebookId || state.pages === prev.pages) return;
    if (state.pages.length < prev.pages.length) {
      void replacePages(notebookId, state.pages).catch(reportSaveError);
      return;
    }
    for (const { index, page } of changedPages(prev.pages, state.pages)) {
      void savePage(notebookId, index, page).catch(reportSaveError);
    }
  });
}

function reportSaveError(error: unknown): void {
  console.error("Failed to save page", error);
  if (saveErrorReported) return;
  saveErrorReported = true;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    toast("Local storage is full. Export your notebooks and free up space.");
    return;
  }
  toast("Saving failed. Your latest changes may not be stored.");
}

function changedPages(prev: Page[], next: Page[]): { index: number; page: Page }[] {
  const changed: { index: number; page: Page }[] = [];
  for (const [index, page] of next.entries()) {
    if (prev[index] !== page) changed.push({ index, page });
  }
  return changed;
}
