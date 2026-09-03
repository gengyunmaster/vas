import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Board } from "../engine/board";
import { clearImageCache } from "../engine/imageCache";
import type { ToolKind } from "../model/stroke";
import { startAutosave } from "../persistence/autosave";
import { scheduleViewStateSave } from "../persistence/session";
import { useBoardStore } from "../store/useBoardStore";
import { textItemHeight } from "../text/textHeight";
import { MediaOverlay } from "./MediaOverlay";
import { TextOverlay } from "./TextOverlay";

function cursorForTool(tool: ToolKind): string {
  // The eraser hides the native cursor; the engine draws a size ring instead.
  if (tool === "eraser") return "none";
  if (tool === "laser") return "none";
  if (tool === "select") return "default";
  if (tool === "text") return "text";
  return "crosshair";
}

// Per-line boxes via getClientRects: a wrapped link's union bounding rect would
// also cover the non-link text between its segments.
function linkUrlAt(clientX: number, clientY: number): string | null {
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(".text-layer a[href]")) {
    for (const rect of anchor.getClientRects()) {
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return anchor.href;
      }
    }
  }
  return null;
}

const LINK_TAP_SLOP = 6;

export function BoardCanvas() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const sidebarOpen = useBoardStore((state) => state.sidebarOpen);
  const presentation = useBoardStore((state) => state.presentation);
  const linkPress = useRef<{ url: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!container) return;
    const board = new Board(container, {
      getTool: () => {
        const { tool, color, size, dash, pressureCurve, exporting } = useBoardStore.getState();
        return { tool, color, size, dash, pressureCurve, exporting };
      },
      onCommitStroke: (pageId, stroke) => useBoardStore.getState().addStroke(pageId, stroke),
      onEraseStroke: (pageId, strokeId) => useBoardStore.getState().removeStroke(pageId, strokeId),
      onUndo: () => useBoardStore.getState().undo(),
      onRedo: () => useBoardStore.getState().redo(),
      onViewChange: (index) => {
        if (useBoardStore.getState().viewPageIndex !== index) {
          useBoardStore.getState().setViewPageIndex(index);
        }
      },
      onSelectionChange: (selection) => useBoardStore.getState().setSelection(selection),
      onSelectionAnchor: (anchor) => useBoardStore.getState().setSelectionAnchor(anchor),
      onTransformSelection: (before, after) =>
        useBoardStore.getState().transformSelection(before, after),
      onTextTap: (pageId, x, y) => {
        const state = useBoardStore.getState();
        const page = state.pages.find((p) => p.id === pageId);
        if (!page) return;
        const existing = [...page.texts].reverse().find((t) => {
          const height = textItemHeight(t);
          return x >= t.x - 6 && x <= t.x + t.width + 6 && y >= t.y - 6 && y <= t.y + height + 6;
        });
        if (existing) {
          state.setEditingText({ pageId, itemId: existing.id });
          return;
        }
        const itemId = state.addTextItem(pageId, x, y);
        state.setEditingText({ pageId, itemId });
      },
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
        board.notifyToolChanged();
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
      clearImageCache();
    };
  }, [container]);

  const className = [
    "board",
    sidebarOpen ? "board-shifted" : "",
    presentation ? "board-presenting" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // The overlays must sit between the base and active canvases (media below
  // text); portaling them into the board container shares one stacking context.
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: pointer-only link shortcut on the canvas surface; links stay real keyboard-focusable anchors in the overlay
    <div
      ref={setContainer}
      className={className}
      onPointerDownCapture={(event) => {
        linkPress.current = null;
        if (useBoardStore.getState().tool !== "select") return;
        if (!event.isPrimary) return;
        const url = linkUrlAt(event.clientX, event.clientY);
        if (!url) return;
        // Swallow the press so the engine never starts an (empty) lasso and a
        // live selection survives the click.
        event.stopPropagation();
        linkPress.current = { url, x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        const press = linkPress.current;
        linkPress.current = null;
        if (!press) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > LINK_TAP_SLOP) return;
        window.open(press.url, "_blank", "noopener,noreferrer");
      }}
    >
      {container ? createPortal(<MediaOverlay />, container) : null}
      {container ? createPortal(<TextOverlay />, container) : null}
    </div>
  );
}
