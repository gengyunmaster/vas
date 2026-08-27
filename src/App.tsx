import { useEffect, useState } from "react";
import { BoardCanvas } from "./components/BoardCanvas";
import { GeometryOverlay } from "./components/GeometryOverlay";
import { Home } from "./components/Home";
import { PageIndicator } from "./components/PageIndicator";
import { PageRangeDialog } from "./components/PageRangeDialog";
import { PageSidebar } from "./components/PageSidebar";
import { SelectionBar } from "./components/SelectionBar";
import { TextEditor } from "./components/TextEditor";
import { Toolbar } from "./components/Toolbar";
import { insertImageFile } from "./persistence/insertImage";
import { createNotebook, listNotebooks } from "./persistence/notebooks";
import { loadToolPrefs, startPrefsSync } from "./persistence/prefs";
import { flushViewStateSave, openNotebook, readLastNotebookId } from "./persistence/session";
import { useBoardStore } from "./store/useBoardStore";

// StrictMode mounts effects twice in dev; the module-level guard keeps app init idempotent.
let initStarted = false;

export default function App() {
  const notebookId = useBoardStore((state) => state.notebookId);
  const presentation = useBoardStore((state) => state.presentation);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (initStarted) return;
    initStarted = true;
    startPrefsSync();
    void (async () => {
      try {
        useBoardStore.setState(loadToolPrefs());
        const notebooks = await listNotebooks();
        if (notebooks.length === 0) {
          const meta = await createNotebook("My Notebook");
          await openNotebook(meta.id);
        } else {
          const last = notebooks.find((n) => n.id === readLastNotebookId());
          if (last) await openNotebook(last.id);
        }
      } catch (error) {
        console.error("Failed to initialize vas storage", error);
        window.alert("Local storage is unavailable. Your notes will not be saved in this session.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useBoardStore.getState().geometryEditor) return;
      if (useBoardStore.getState().pdfRangeRequest) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        const state = useBoardStore.getState();
        if (state.editingText) {
          state.setEditingText(null);
        } else if (state.presentation) {
          state.setPresentation(false);
        } else if (!typing && state.selection) {
          state.setSelection(null);
        }
        return;
      }
      if (typing) return;
      if (useBoardStore.getState().exporting) return;
      if (event.key === "Delete") {
        const state = useBoardStore.getState();
        if (state.selection) {
          event.preventDefault();
          state.deleteSelection();
        }
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const state = useBoardStore.getState();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        state.redo();
      } else if (key === "z") {
        event.preventDefault();
        state.undo();
      } else if (key === "y") {
        event.preventDefault();
        state.redo();
      } else if (key === "x" && state.selection) {
        event.preventDefault();
        state.cutSelection();
      } else if (key === "c" && state.selection) {
        event.preventDefault();
        state.copySelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const state = useBoardStore.getState();
      if (!state.notebookId || state.exporting || state.geometryEditor) return;
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        event.preventDefault();
        void insertImageFile(file).catch((error: unknown) => {
          console.error("Failed to paste image", error);
          window.alert("Failed to paste image.");
        });
        return;
      }
      if (
        state.clipboard.strokes.length > 0 ||
        state.clipboard.images.length > 0 ||
        state.clipboard.texts.length > 0
      ) {
        event.preventDefault();
        state.pasteClipboard();
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    const onPageHide = () => void flushViewStateSave();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    if (!presentation) return;
    let cancelled = false;
    const root = document.documentElement;
    if (root.requestFullscreen) {
      root
        .requestFullscreen()
        .then(() => {
          if (cancelled) void document.exitFullscreen().catch(() => {});
        })
        .catch(() => {});
    }
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) useBoardStore.getState().setPresentation(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      cancelled = true;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [presentation]);

  if (!ready) return null;

  return (
    <>
      {notebookId ? (
        <>
          <BoardCanvas />
          <PageSidebar />
          <Toolbar />
          {!presentation && <SelectionBar />}
          {!presentation && <PageIndicator />}
          <TextEditor />
          <GeometryOverlay />
        </>
      ) : (
        <Home
          onOpen={(id) => {
            void openNotebook(id).catch((error: unknown) => {
              console.error("Failed to open notebook", error);
              window.alert("Failed to open this notebook.");
            });
          }}
        />
      )}
      <PageRangeDialog />
    </>
  );
}
