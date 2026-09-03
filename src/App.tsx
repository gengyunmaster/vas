import { useEffect, useState } from "react";
import { BoardCanvas } from "./components/BoardCanvas";
import { ConfirmDialog, PromptDialog } from "./components/Dialogs";
import { ErrorBanner } from "./components/ErrorBanner";
import { GeometryOverlay } from "./components/GeometryOverlay";
import { Home } from "./components/Home";
import { PageIndicator } from "./components/PageIndicator";
import { PageRangeDialog } from "./components/PageRangeDialog";
import { PageSidebar } from "./components/PageSidebar";
import { SelectionBar } from "./components/SelectionBar";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { TextEditor } from "./components/TextEditor";
import { Toasts } from "./components/Toasts";
import { Toolbar } from "./components/Toolbar";
import { UpdateBanner } from "./components/UpdateBanner";
import { parseClipboardPayload } from "./model/clipboard";
import { insertFile, isInsertableFile } from "./persistence/insertFile";
import { createNotebook, listNotebooks } from "./persistence/notebooks";
import { pastePlainText } from "./persistence/pasteText";
import { loadToolPrefs, startPrefsSync } from "./persistence/prefs";
import { flushViewStateSave, openNotebook, readLastNotebookId } from "./persistence/session";
import { COMBOS, matchCombo } from "./shortcuts";
import { useDialogStore } from "./store/dialogs";
import { useShortcutsStore } from "./store/shortcuts";
import { toast } from "./store/toasts";
import { useBoardStore } from "./store/useBoardStore";
import { startThemeSync } from "./theme";

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
    startThemeSync();
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
        toast("Local storage is unavailable. Your notes will not be saved in this session.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useBoardStore.getState().geometryEditor) return;
      if (useBoardStore.getState().pdfRangeRequest) return;
      const dialogs = useDialogStore.getState();
      if (dialogs.confirm || dialogs.prompt) return;
      if (useShortcutsStore.getState().open) return;
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
      if (matchCombo(event, COMBOS.shortcuts) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        useShortcutsStore.getState().setOpen(true);
        return;
      }
      if (useBoardStore.getState().exporting) return;
      if (matchCombo(event, COMBOS.deleteSelection)) {
        const state = useBoardStore.getState();
        if (state.selection) {
          event.preventDefault();
          state.deleteSelection();
        }
        return;
      }
      const state = useBoardStore.getState();
      if (matchCombo(event, COMBOS.undo)) {
        event.preventDefault();
        state.undo();
      } else if (COMBOS.redo.some((combo) => matchCombo(event, combo))) {
        event.preventDefault();
        state.redo();
      } else if (matchCombo(event, COMBOS.cut) && state.selection) {
        event.preventDefault();
        state.cutSelection();
      } else if (matchCombo(event, COMBOS.copy) && state.selection) {
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
      if (!state.notebookId || state.exporting || state.geometryEditor || state.pdfRangeRequest) {
        return;
      }
      const data = event.clipboardData;
      if (!data) return;
      const text = data.getData("text/plain");
      // vas data first: copy/cut mirrors the selection to the system clipboard.
      if (text) {
        let payload: ReturnType<typeof parseClipboardPayload>;
        try {
          payload = parseClipboardPayload(text);
        } catch {
          event.preventDefault();
          toast("Clipboard data is not valid.");
          return;
        }
        if (payload) {
          event.preventDefault();
          state.pasteClipboard(payload);
          return;
        }
      }
      // Files beat plain text: OS file copies may also expose a name as text.
      const files = [...data.files];
      if (files.length > 0) {
        event.preventDefault();
        const file = files.find(isInsertableFile);
        if (!file) {
          toast("Unsupported file type.");
          return;
        }
        void insertFile(file).catch((error: unknown) => {
          if (error instanceof Error && error.message.startsWith("Import cancelled")) return;
          console.error("Failed to paste file", error);
          toast(error instanceof Error ? error.message : "Failed to paste file.");
        });
        return;
      }
      if (text.trim()) {
        event.preventDefault();
        void pastePlainText(text).catch((error: unknown) => {
          console.error("Failed to paste text", error);
          toast("Failed to paste text.");
        });
        return;
      }
      if (
        state.clipboard.strokes.length > 0 ||
        state.clipboard.images.length > 0 ||
        state.clipboard.texts.length > 0 ||
        state.clipboard.audios.length > 0
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
    if (!ready) return;
    const splash = document.getElementById("splash");
    if (!splash) return;
    splash.classList.add("done");
    const remove = () => splash.remove();
    splash.addEventListener("transitionend", remove, { once: true });
    // transitionend never fires in a hidden tab; remove regardless.
    window.setTimeout(remove, 600);
  }, [ready]);

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
          <SelectionBar />
          {!presentation && <PageIndicator />}
          <TextEditor />
          <GeometryOverlay />
        </>
      ) : (
        <Home
          onOpen={(id) => {
            void openNotebook(id).catch((error: unknown) => {
              console.error("Failed to open notebook", error);
              toast("Failed to open this notebook.");
            });
          }}
        />
      )}
      <PageRangeDialog />
      <ConfirmDialog />
      <PromptDialog />
      <ShortcutsDialog />
      <Toasts />
      <ErrorBanner />
      <UpdateBanner />
    </>
  );
}
