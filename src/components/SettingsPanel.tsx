import { type CSSProperties, useRef, useState } from "react";
import { version } from "../../package.json";
import { PAGE_PATTERNS, type PagePattern } from "../model/page";
import { SHAPE_KINDS, type ShapeKind } from "../model/stroke";
import { exportPagePng } from "../persistence/exportImage";
import { exportNotebookPdf } from "../persistence/exportPdf";
import { rasterizePdf, saveRasterizedImages } from "../persistence/importPdf";
import { insertImageFile } from "../persistence/insertImage";
import { COLORS, PAPER_COLORS, SIZES, useBoardStore } from "../store/useBoardStore";
import { ColorField } from "./ColorField";
import {
  AddPageIcon,
  DeletePageIcon,
  ImageIcon,
  PasteIcon,
  PresentIcon,
  RedoIcon,
  SidebarIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";

const PATTERN_LABELS: Record<PagePattern, string> = {
  blank: "Blank",
  lined: "Lines",
  grid: "Grid",
  dots: "Dots",
  rice: "Rice",
};

const SHAPE_LABELS: Record<ShapeKind, string> = {
  line: "Line",
  arrow: "Arrow",
  rect: "Rect",
  ellipse: "Ellipse",
};

export function SettingsPanel() {
  const tool = useBoardStore((state) => state.tool);
  const inkColor = useBoardStore((state) => state.color);
  const size = useBoardStore((state) => state.size);
  const paperColor = useBoardStore(
    (state) => state.pages[state.viewPageIndex]?.paperColor ?? state.paperColor,
  );
  const pattern = useBoardStore(
    (state) => state.pages[state.viewPageIndex]?.pattern ?? state.pattern,
  );
  const canUndo = useBoardStore((state) => state.past.length > 0);
  const canRedo = useBoardStore((state) => state.future.length > 0);
  const currentPageId = useBoardStore((state) => state.pages[state.viewPageIndex]?.id);
  const canClear = useBoardStore((state) => {
    const page = state.pages[state.viewPageIndex];
    return (page?.strokes.length ?? 0) > 0 || (page?.images.some((i) => !i.locked) ?? false);
  });
  const canDeletePage = useBoardStore((state) => state.pages.length > 1);
  const canPaste = useBoardStore(
    (state) => state.clipboard.strokes.length > 0 || state.clipboard.images.length > 0,
  );
  const sidebarOpen = useBoardStore((state) => state.sidebarOpen);
  const [exporting, setExporting] = useState(false);
  const [pdfImporting, setPdfImporting] = useState<{ done: number; total: number } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const {
    setTool,
    setColor,
    setSize,
    setPaperColor,
    setPattern,
    setPresentation,
    toggleSidebar,
    undo,
    redo,
    clearPage,
    addPage,
    deletePage,
    pasteClipboard,
  } = useBoardStore.getState();

  const confirmClear = () => {
    if (currentPageId && window.confirm("Clear this page?")) clearPage(currentPageId);
  };

  const confirmDelete = () => {
    if (currentPageId && window.confirm("Delete this page and everything on it?")) {
      deletePage(currentPageId);
    }
  };

  const exportPdf = async () => {
    const { notebookTitle: title, pages } = useBoardStore.getState();
    setExporting(true);
    try {
      await exportNotebookPdf(title || "vas notebook", pages);
    } catch (error) {
      console.error("PDF export failed", error);
      window.alert("PDF export failed.");
    } finally {
      setExporting(false);
    }
  };

  const exportPng = async () => {
    const { notebookTitle: title, pages, viewPageIndex } = useBoardStore.getState();
    const page = pages[viewPageIndex];
    if (!page) return;
    try {
      await exportPagePng(title || "vas notebook", viewPageIndex, page);
    } catch (error) {
      console.error("PNG export failed", error);
      window.alert("PNG export failed.");
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      await insertImageFile(file);
    } catch (error) {
      console.error("Failed to insert image", error);
      window.alert("Failed to insert image.");
    }
  };

  const importPdf = async (file: File | undefined) => {
    if (!file) return;
    setPdfImporting({ done: 0, total: 0 });
    try {
      const rasterized = await rasterizePdf(file, (done, total) =>
        setPdfImporting({ done, total }),
      );
      await saveRasterizedImages(rasterized);
      useBoardStore.getState().insertPdfPages(rasterized);
    } catch (error) {
      console.error("PDF import failed", error);
      window.alert(error instanceof Error ? error.message : "PDF import failed");
    } finally {
      setPdfImporting(null);
    }
  };

  return (
    <div className="settings-panel">
      <section className="settings-section">
        <div className="settings-label">Tool</div>
        <div className="settings-row">
          <button
            type="button"
            aria-pressed={tool === "pen"}
            className={tool === "pen" ? "text-option active" : "text-option"}
            onClick={() => setTool("pen")}
          >
            Pen
          </button>
          <button
            type="button"
            aria-pressed={tool === "highlighter"}
            className={tool === "highlighter" ? "text-option active" : "text-option"}
            onClick={() => setTool("highlighter")}
          >
            Highlighter
          </button>
          <button
            type="button"
            aria-pressed={tool === "laser"}
            className={tool === "laser" ? "text-option active" : "text-option"}
            onClick={() => setTool("laser")}
          >
            Laser
          </button>
          <button
            type="button"
            aria-pressed={tool === "select"}
            className={tool === "select" ? "text-option active" : "text-option"}
            onClick={() => setTool("select")}
          >
            Select
          </button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">Shape</div>
        <div className="settings-row">
          {SHAPE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={tool === kind}
              className={tool === kind ? "text-option active" : "text-option"}
              onClick={() => setTool(kind)}
            >
              {SHAPE_LABELS[kind]}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">Ink</div>
        <div className="settings-row">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={`Color ${c}`}
              aria-pressed={inkColor === c}
              className={inkColor === c ? "swatch active" : "swatch"}
              style={{ "--swatch": c } as CSSProperties}
              onClick={() => setColor(c)}
            >
              <span />
            </button>
          ))}
          <ColorField value={inkColor} onChange={setColor} />
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">Size</div>
        <div className="settings-row">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              title={`Size ${s}`}
              aria-pressed={size === s}
              className={size === s ? "size-option active" : "size-option"}
              onClick={() => setSize(s)}
            >
              <span
                style={{
                  width: Math.round(3 + s * 1.6),
                  height: Math.round(3 + s * 1.6),
                }}
              />
            </button>
          ))}
          <input
            type="range"
            className="size-slider"
            min={0.5}
            max={12}
            step={0.5}
            value={size}
            aria-label="Stroke size"
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <span className="size-value">{size}</span>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">Paper</div>
        <div className="settings-row">
          {PAPER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={`Paper ${c}`}
              aria-pressed={paperColor === c}
              className={paperColor === c ? "swatch active" : "swatch"}
              style={{ "--swatch": c } as CSSProperties}
              onClick={() => setPaperColor(c)}
            >
              <span />
            </button>
          ))}
          <ColorField value={paperColor} onChange={setPaperColor} />
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">Template</div>
        <div className="settings-row">
          {PAGE_PATTERNS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={pattern === p}
              className={pattern === p ? "text-option active" : "text-option"}
              onClick={() => setPattern(p)}
            >
              {PATTERN_LABELS[p]}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">Actions</div>
        <div className="settings-row">
          <button type="button" title="Undo" disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button type="button" title="Redo" disabled={!canRedo} onClick={redo}>
            <RedoIcon />
          </button>
          <button type="button" title="Clear page" disabled={!canClear} onClick={confirmClear}>
            <TrashIcon />
          </button>
          <button type="button" title="Add page" onClick={addPage}>
            <AddPageIcon />
          </button>
          <button
            type="button"
            title="Delete page"
            disabled={!canDeletePage}
            onClick={confirmDelete}
          >
            <DeletePageIcon />
          </button>
          <button type="button" title="Paste" disabled={!canPaste} onClick={pasteClipboard}>
            <PasteIcon />
          </button>
          <button type="button" title="Insert image" onClick={() => imageInputRef.current?.click()}>
            <ImageIcon />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pickImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" title="Present" onClick={() => setPresentation(true)}>
            <PresentIcon />
          </button>
          <button
            type="button"
            title="Pages panel"
            aria-pressed={sidebarOpen}
            className={sidebarOpen ? "active" : ""}
            onClick={toggleSidebar}
          >
            <SidebarIcon />
          </button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">File</div>
        <div className="settings-row">
          <button
            type="button"
            className="text-option"
            disabled={pdfImporting !== null}
            onClick={() => pdfInputRef.current?.click()}
          >
            {pdfImporting
              ? pdfImporting.total > 0
                ? `Importing… ${pdfImporting.done}/${pdfImporting.total}`
                : "Importing…"
              : "Import PDF"}
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => {
              void importPdf(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="text-option"
            disabled={exporting}
            onClick={() => void exportPdf()}
          >
            {exporting ? "Exporting…" : "PDF (vector)"}
          </button>
          <button type="button" className="text-option" onClick={() => void exportPng()}>
            PNG (this page)
          </button>
        </div>
      </section>
      <div className="settings-version">vas v{version}</div>
    </div>
  );
}
