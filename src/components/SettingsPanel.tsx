import { type CSSProperties, useRef, useState } from "react";
import { version } from "../../package.json";
import {
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  PAGE_HEIGHT,
  PAGE_PATTERNS,
  PAGE_WIDTH,
  type PagePattern,
} from "../model/page";
import { pickElements } from "../model/selection";
import { SHAPE_KINDS, type ShapeKind } from "../model/stroke";
import { exportNotebookPng, exportPagePng, exportSelectionPng } from "../persistence/exportImage";
import { exportNotebookPdf, exportSelectionPdf } from "../persistence/exportPdf";
import { exportNotebookSvg, exportPageSvg, exportSelectionSvg } from "../persistence/exportSvg";
import { importPdfIntoNotebook, reRasterizePdfBase } from "../persistence/importPdf";
import { insertImageFile } from "../persistence/insertImage";
import { COLORS, PAPER_COLORS, SIZES, useBoardStore } from "../store/useBoardStore";
import { ColorField } from "./ColorField";
import {
  AddPageIcon,
  DeletePageIcon,
  ImageIcon,
  ImportPdfIcon,
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
  const pageWidth = useBoardStore((state) => state.pages[state.viewPageIndex]?.width ?? PAGE_WIDTH);
  const pageHeight = useBoardStore(
    (state) => state.pages[state.viewPageIndex]?.height ?? PAGE_HEIGHT,
  );
  const canClear = useBoardStore((state) => {
    const page = state.pages[state.viewPageIndex];
    return (page?.strokes.length ?? 0) > 0 || (page?.images.some((i) => !i.locked) ?? false);
  });
  const canDeletePage = useBoardStore((state) => state.pages.length > 1);
  const canPaste = useBoardStore(
    (state) => state.clipboard.strokes.length > 0 || state.clipboard.images.length > 0,
  );
  const sidebarOpen = useBoardStore((state) => state.sidebarOpen);
  const presentation = useBoardStore((state) => state.presentation);
  const pdfImporting = useBoardStore((state) =>
    state.notebookId ? (state.pdfImports[state.notebookId] ?? null) : null,
  );
  const hasSelection = useBoardStore((state) => state.selection !== null);
  const exporting = useBoardStore((state) => state.exporting);
  const [exportRange, setExportRange] = useState<"selection" | "page" | "notebook">("page");
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

  const doExport = async (format: "pdf" | "svg" | "png") => {
    const state = useBoardStore.getState();
    const title = state.notebookTitle || "vas notebook";
    state.setExporting(true);
    try {
      if (exportRange === "selection") {
        const selection = state.selection;
        const page = selection
          ? state.pages.find((candidate) => candidate.id === selection.pageId)
          : undefined;
        if (!selection || !page) return;
        const { strokes, images } = pickElements(page, selection.strokeIds, selection.imageIds);
        if (format === "pdf") await exportSelectionPdf(title, page, strokes, images);
        else if (format === "svg") await exportSelectionSvg(title, page, strokes, images);
        else await exportSelectionPng(title, strokes, images);
      } else if (exportRange === "page") {
        const page = state.pages[state.viewPageIndex];
        if (!page) return;
        if (format === "pdf") await exportNotebookPdf(title, [page]);
        else if (format === "svg") await exportPageSvg(title, state.viewPageIndex, page);
        else await exportPagePng(title, state.viewPageIndex, page);
      } else {
        if (format === "pdf") await exportNotebookPdf(title, state.pages);
        else if (format === "svg") await exportNotebookSvg(title, state.pages);
        else await exportNotebookPng(title, state.pages);
      }
    } catch (error) {
      console.error(`${format.toUpperCase()} export failed`, error);
      window.alert(`${format.toUpperCase()} export failed.`);
    } finally {
      useBoardStore.getState().setExporting(false);
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
    const notebookId = useBoardStore.getState().notebookId;
    if (!file || !notebookId) return;
    const { setPdfImport } = useBoardStore.getState();
    setPdfImport(notebookId, { done: 0, total: 0 });
    try {
      await importPdfIntoNotebook(notebookId, file, (done, total) =>
        setPdfImport(notebookId, { done, total }),
      );
    } catch (error) {
      console.error("PDF import failed", error);
      window.alert(error instanceof Error ? error.message : "PDF import failed");
    } finally {
      setPdfImport(notebookId, null);
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
              title={`Ink ${c}`}
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
        <div className="settings-label">Page size</div>
        <div className="settings-row">
          <PageSizeField
            key={currentPageId ?? "page"}
            width={pageWidth}
            height={pageHeight}
            disabled={exporting}
          />
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">Actions</div>
        <div className="settings-row">
          <button type="button" title="Undo" disabled={!canUndo || exporting} onClick={undo}>
            <UndoIcon />
          </button>
          <button type="button" title="Redo" disabled={!canRedo || exporting} onClick={redo}>
            <RedoIcon />
          </button>
          <button
            type="button"
            title="Clear page"
            disabled={!canClear || exporting}
            onClick={confirmClear}
          >
            <TrashIcon />
          </button>
          <button type="button" title="Add page" disabled={exporting} onClick={addPage}>
            <AddPageIcon />
          </button>
          <button
            type="button"
            title="Delete page"
            disabled={!canDeletePage || exporting}
            onClick={confirmDelete}
          >
            <DeletePageIcon />
          </button>
          <button
            type="button"
            title="Paste"
            disabled={!canPaste || exporting}
            onClick={pasteClipboard}
          >
            <PasteIcon />
          </button>
          <button
            type="button"
            title="Insert image"
            disabled={exporting}
            onClick={() => imageInputRef.current?.click()}
          >
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
          <button
            type="button"
            title="Import PDF"
            disabled={exporting || pdfImporting !== null}
            onClick={() => pdfInputRef.current?.click()}
          >
            <ImportPdfIcon />
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
            title="Present"
            aria-pressed={presentation}
            className={presentation ? "active" : ""}
            onClick={() => setPresentation(!presentation)}
          >
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
      {pdfImporting && (
        <div className="settings-progress" role="status">
          <span>
            {pdfImporting.total > 0
              ? `Importing PDF… ${pdfImporting.done}/${pdfImporting.total}`
              : "Importing PDF…"}
          </span>
          {pdfImporting.total > 0 && (
            <div className="settings-progress-track">
              <div
                className="settings-progress-fill"
                style={{ width: `${(pdfImporting.done / pdfImporting.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
      <section className="settings-section">
        <div className="settings-label">Export</div>
        <div className="settings-row">
          <button
            type="button"
            className={`text-option${exportRange === "selection" ? " active" : ""}`}
            aria-pressed={exportRange === "selection"}
            disabled={!hasSelection}
            title={hasSelection ? "Export only the selected elements" : "Select elements first"}
            onClick={() => setExportRange("selection")}
          >
            Selection
          </button>
          <button
            type="button"
            className={`text-option${exportRange === "page" ? " active" : ""}`}
            aria-pressed={exportRange === "page"}
            onClick={() => setExportRange("page")}
          >
            This page
          </button>
          <button
            type="button"
            className={`text-option${exportRange === "notebook" ? " active" : ""}`}
            aria-pressed={exportRange === "notebook"}
            onClick={() => setExportRange("notebook")}
          >
            Notebook
          </button>
        </div>
        <div className="settings-row">
          {(["pdf", "svg", "png"] as const).map((format) => (
            <button
              key={format}
              type="button"
              className="text-option"
              disabled={exporting || (exportRange === "selection" && !hasSelection)}
              onClick={() => void doExport(format)}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </section>
      <div className="settings-version">vas v{version}</div>
    </div>
  );
}

function PageSizeField({
  width,
  height,
  disabled,
}: {
  width: number;
  height: number;
  disabled: boolean;
}) {
  const [draftWidth, setDraftWidth] = useState(String(width));
  const [draftHeight, setDraftHeight] = useState(String(height));
  const parsedWidth = Number(draftWidth);
  const parsedHeight = Number(draftHeight);
  const valid =
    Number.isFinite(parsedWidth) &&
    Number.isFinite(parsedHeight) &&
    parsedWidth >= MIN_PAGE_SIZE &&
    parsedWidth <= MAX_PAGE_SIZE &&
    parsedHeight >= MIN_PAGE_SIZE &&
    parsedHeight <= MAX_PAGE_SIZE;
  const changed = Math.round(parsedWidth) !== width || Math.round(parsedHeight) !== height;

  const apply = (nextWidth: number, nextHeight: number) => {
    const state = useBoardStore.getState();
    const page = state.pages[state.viewPageIndex];
    if (!page) return;
    state.setPageSize({ width: nextWidth, height: nextHeight });
    if (page.pdfSource) void reRasterizePdfBase(page.id);
  };

  const commitDraft = () => {
    if (valid && changed) apply(parsedWidth, parsedHeight);
  };

  const resetToA4 = () => {
    setDraftWidth(String(PAGE_WIDTH));
    setDraftHeight(String(PAGE_HEIGHT));
    apply(PAGE_WIDTH, PAGE_HEIGHT);
  };

  return (
    <>
      <input
        className="page-size-input"
        type="number"
        min={MIN_PAGE_SIZE}
        max={MAX_PAGE_SIZE}
        value={draftWidth}
        aria-label="Page width"
        disabled={disabled}
        onChange={(e) => setDraftWidth(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitDraft();
        }}
      />
      <span className="page-size-sep">×</span>
      <input
        className="page-size-input"
        type="number"
        min={MIN_PAGE_SIZE}
        max={MAX_PAGE_SIZE}
        value={draftHeight}
        aria-label="Page height"
        disabled={disabled}
        onChange={(e) => setDraftHeight(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitDraft();
        }}
      />
      <button
        type="button"
        className="text-option"
        disabled={disabled || !valid || !changed}
        onClick={commitDraft}
      >
        Apply
      </button>
      <button
        type="button"
        className="text-option"
        title="Reset to A4"
        disabled={disabled || (width === PAGE_WIDTH && height === PAGE_HEIGHT)}
        onClick={resetToA4}
      >
        A4
      </button>
    </>
  );
}
