import { useEffect, useRef } from "react";
import { Board } from "../engine/board";
import type { ToolKind } from "../model/stroke";
import { startAutosave } from "../persistence/autosave";
import { scheduleViewStateSave } from "../persistence/session";
import { useBoardStore } from "../store/useBoardStore";

function cursorForTool(tool: ToolKind): string {
  if (tool === "eraser") return "cell";
  if (tool === "laser") return "none";
  if (tool === "select") return "default";
  return "crosshair";
}

export function BoardCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = useBoardStore((state) => state.sidebarOpen);
  const presentation = useBoardStore((state) => state.presentation);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const board = new Board(container, {
      getTool: () => {
        const { tool, color, size } = useBoardStore.getState();
        return { tool, color, size };
      },
      onCommitStroke: (pageId, stroke) => useBoardStore.getState().addStroke(pageId, stroke),
      onEraseStroke: (pageId, strokeId) => useBoardStore.getState().removeStroke(pageId, strokeId),
      onViewChange: (index) => {
        if (useBoardStore.getState().viewPageIndex !== index) {
          useBoardStore.getState().setViewPageIndex(index);
        }
      },
      onSelectionChange: (selection) => useBoardStore.getState().setSelection(selection),
      onSelectionAnchor: (anchor) => useBoardStore.getState().setSelectionAnchor(anchor),
      onTransformSelection: (before, after) =>
        useBoardStore.getState().transformSelection(before, after),
      onViewportChange: (viewState) => {
        const { notebookId } = useBoardStore.getState();
        if (notebookId) scheduleViewStateSave(notebookId, viewState);
      },
    });
    board.syncPages(useBoardStore.getState().pages);
    const viewState = useBoardStore.getState().viewState;
    if (viewState) board.restoreViewState(viewState);
    container.style.cursor = cursorForTool(useBoardStore.getState().tool);
    const stopAutosave = startAutosave();
    const unsubscribe = useBoardStore.subscribe((state, prev) => {
      if (state.pages !== prev.pages) board.syncPages(state.pages);
      if (state.selection !== prev.selection) board.syncSelection(state.selection);
      if (state.presentation !== prev.presentation) board.setPresentation(state.presentation);
      if (state.tool !== prev.tool) {
        container.style.cursor = cursorForTool(state.tool);
        if (state.tool !== "select" && state.selection) {
          useBoardStore.getState().setSelection(null);
        }
      }
      if (
        state.pendingScrollToPage !== null &&
        state.pendingScrollToPage !== prev.pendingScrollToPage
      ) {
        board.scrollToPage(state.pendingScrollToPage);
        useBoardStore.getState().clearPendingScroll();
      }
    });
    return () => {
      stopAutosave();
      unsubscribe();
      board.destroy();
    };
  }, []);

  const className = [
    "board",
    sidebarOpen ? "board-shifted" : "",
    presentation ? "board-presenting" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <div ref={containerRef} className={className} />;
}
