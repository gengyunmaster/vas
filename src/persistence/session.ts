import type { ViewState } from "../model/viewState";
import { useBoardStore } from "../store/useBoardStore";
import { gcUnreferencedImages } from "./images";
import { loadNotebook, saveViewState } from "./notebooks";

const LAST_NOTEBOOK_KEY = "vas.lastNotebookId";
const VIEW_STATE_SAVE_DELAY_MS = 400;

let pendingViewState: { id: string; viewState: ViewState } | null = null;
let viewStateTimer: number | undefined;

export function scheduleViewStateSave(id: string, viewState: ViewState): void {
  pendingViewState = { id, viewState };
  window.clearTimeout(viewStateTimer);
  viewStateTimer = window.setTimeout(() => void flushViewStateSave(), VIEW_STATE_SAVE_DELAY_MS);
}

export async function flushViewStateSave(): Promise<void> {
  window.clearTimeout(viewStateTimer);
  viewStateTimer = undefined;
  const pending = pendingViewState;
  pendingViewState = null;
  if (!pending) return;
  try {
    await saveViewState(pending.id, pending.viewState);
  } catch (error) {
    console.error("Failed to save view state", error);
  }
}

export async function openNotebook(id: string): Promise<void> {
  await flushViewStateSave();
  const { meta, pages } = await loadNotebook(id);
  useBoardStore
    .getState()
    .loadDocument({ id: meta.id, title: meta.title, pages, viewState: meta.viewState });
  void gcUnreferencedImages().catch((error) => console.error("Image GC failed", error));
  try {
    localStorage.setItem(LAST_NOTEBOOK_KEY, id);
  } catch {
    // storage may be unavailable
  }
}

export async function closeNotebook(): Promise<void> {
  await flushViewStateSave();
  useBoardStore.getState().unloadDocument();
  try {
    localStorage.removeItem(LAST_NOTEBOOK_KEY);
  } catch {
    // storage may be unavailable
  }
}

export function readLastNotebookId(): string | null {
  try {
    return localStorage.getItem(LAST_NOTEBOOK_KEY);
  } catch {
    return null;
  }
}
