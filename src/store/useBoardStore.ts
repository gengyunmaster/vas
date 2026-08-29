import { create } from "zustand";
import { createImageItem, type ImageItem } from "../model/image";
import {
  createPage,
  type Page,
  type PagePattern,
  type PageSize,
  type PdfSource,
  PLACEMENT_MARGIN,
} from "../model/page";
import { resizePage } from "../model/pageSize";
import { buildPdfPages, type PdfPageImage } from "../model/pdfPage";
import { newId, type PenKind, type Stroke, type ToolKind } from "../model/stroke";
import { createTextItem, DEFAULT_TEXT_FONT_SIZE, type TextItem } from "../model/textItem";
import {
  centerDelta,
  elementsBounds,
  imagesBounds,
  scaleImage,
  scaleStroke,
  scaleTextUniform,
  strokesBounds,
  textBounds,
  translateImage,
  translateStroke,
  translateText,
  unionBounds,
} from "../model/transform";
import type { ViewState } from "../model/viewState";
import { textItemHeight } from "../text/textHeight";
import type { ThemePreference } from "../theme";

export const COLORS = ["#1a1a1a", "#d64541", "#2f6fdd", "#2e9e5b", "#f2b134", "#ffffff"] as const;
export const PAPER_COLORS = [
  "#ffffff",
  "#fbf3db",
  "#eef1f4",
  "#26262a",
  "#003423",
  "#b98a5f",
] as const;
export const SIZES = [1.5, 2.5, 4.5] as const;

export type Edit =
  | { kind: "add-stroke"; pageId: string; stroke: Stroke }
  | { kind: "remove-stroke"; pageId: string; index: number; stroke: Stroke }
  | {
      kind: "clear-page";
      pageId: string;
      strokes: Stroke[];
      images: ImageItem[];
      texts: TextItem[];
    }
  | {
      kind: "add-elements";
      pageId: string;
      strokes: Stroke[];
      images: ImageItem[];
      texts: TextItem[];
    }
  | {
      kind: "remove-elements";
      pageId: string;
      strokes: { index: number; stroke: Stroke }[];
      images: { index: number; image: ImageItem }[];
      texts: { index: number; text: TextItem }[];
    }
  | {
      kind: "replace-elements";
      pageId: string;
      strokesBefore: Stroke[];
      strokesAfter: Stroke[];
      imagesBefore: ImageItem[];
      imagesAfter: ImageItem[];
      textsBefore: TextItem[];
      textsAfter: TextItem[];
    };

export interface SelectionTarget {
  pageId: string;
  strokeIds: string[];
  imageIds: string[];
  textIds: string[];
}

export interface ClipboardContent {
  strokes: Stroke[];
  images: ImageItem[];
  texts: TextItem[];
}

interface ElementEntries {
  pageId: string;
  strokes: { index: number; stroke: Stroke }[];
  images: { index: number; image: ImageItem }[];
  texts: { index: number; text: TextItem }[];
}

interface BoardState {
  notebookId: string | null;
  notebookTitle: string;
  pages: Page[];
  past: Edit[];
  future: Edit[];
  viewPageIndex: number;
  pendingScrollToPage: number | null;
  tool: ToolKind;
  lastPenKind: PenKind;
  presentation: boolean;
  sidebarOpen: boolean;
  pdfImports: Record<string, { done: number; total: number }>;
  pdfRangeRequest: { numPages: number; mode: "range" | "single" } | null;
  exporting: boolean;
  geometryEditor: { mode: "insert" } | { mode: "edit"; pageId: string; itemId: string } | null;
  color: string;
  size: number;
  paperColor: string;
  pattern: PagePattern;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  selection: SelectionTarget | null;
  selectionAnchor: { x: number; y: number } | null;
  clipboard: ClipboardContent;
  editingText: { pageId: string; itemId: string } | null;
  textEditOrigin: TextItem | null;
  viewState: ViewState | null;
  loadDocument: (doc: { id: string; title: string; pages: Page[]; viewState?: ViewState }) => void;
  unloadDocument: () => void;
  addStroke: (pageId: string, stroke: Stroke) => void;
  removeStroke: (pageId: string, strokeId: string) => void;
  addPage: () => void;
  deletePage: (pageId: string) => void;
  clearPage: (pageId: string) => void;
  clearPendingScroll: () => void;
  undo: () => void;
  redo: () => void;
  setViewPageIndex: (index: number) => void;
  setTool: (tool: ToolKind) => void;
  setPresentation: (on: boolean) => void;
  toggleSidebar: () => void;
  requestScrollToPage: (index: number) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  setPaperColor: (color: string) => void;
  setPattern: (pattern: PagePattern) => void;
  setPageSize: (size: PageSize) => void;
  replacePdfBaseImage: (pageId: string, imageId: string) => void;
  movePage: (from: number, to: number) => void;
  setSelection: (selection: SelectionTarget | null) => void;
  setSelectionAnchor: (anchor: { x: number; y: number } | null) => void;
  transformSelection: (
    before: { strokes: Stroke[]; images: ImageItem[]; texts: TextItem[] },
    after: { strokes: Stroke[]; images: ImageItem[]; texts: TextItem[] },
  ) => void;
  centerSelection: (axis: "horizontal" | "vertical") => void;
  recolorSelection: (color: string) => void;
  deleteSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
  addTextItem: (pageId: string, x: number, y: number) => string;
  updateTextItem: (
    pageId: string,
    itemId: string,
    patch: Partial<Pick<TextItem, "markdown" | "color" | "fontSize" | "width" | "x" | "y">>,
  ) => void;
  removeTextItem: (pageId: string, itemId: string) => void;
  commitTextHistory: (pageId: string, before: TextItem, after: TextItem) => void;
  textFontSize: number;
  setTextFontSize: (size: number) => void;
  setEditingText: (editing: { pageId: string; itemId: string } | null) => void;
  insertImage: (
    imageId: string,
    naturalWidth: number,
    naturalHeight: number,
    extra?: { geometryId?: string; pdfSource?: PdfSource },
  ) => void;
  insertPdfPages: (pdfPages: PdfPageImage[], pdfSource?: { docId: string }) => void;
  setPdfImport: (notebookId: string, progress: { done: number; total: number } | null) => void;
  setPdfRangeRequest: (request: { numPages: number; mode: "range" | "single" } | null) => void;
  setExporting: (exporting: boolean) => void;
  openGeometry: () => void;
  editGeometry: (pageId: string, itemId: string) => void;
  closeGeometry: () => void;
  replaceGeometryImage: (
    pageId: string,
    itemId: string,
    patch: {
      imageId: string;
      geometryId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    },
  ) => void;
}

function withStroke(pages: Page[], pageId: string, stroke: Stroke): Page[] {
  return pages.map((p) => (p.id === pageId ? { ...p, strokes: [...p.strokes, stroke] } : p));
}

function withoutStroke(pages: Page[], pageId: string, strokeId: string): Page[] {
  return pages.map((p) =>
    p.id === pageId ? { ...p, strokes: p.strokes.filter((s) => s.id !== strokeId) } : p,
  );
}

function withoutElements(
  pages: Page[],
  pageId: string,
  strokeIds: Set<string>,
  imageIds: Set<string>,
  textIds: Set<string> = new Set(),
): Page[] {
  return pages.map((p) =>
    p.id === pageId
      ? {
          ...p,
          strokes: p.strokes.filter((s) => !strokeIds.has(s.id)),
          images: p.images.filter((i) => !imageIds.has(i.id)),
          texts: p.texts.filter((t) => !textIds.has(t.id)),
        }
      : p,
  );
}

function withInsertedStroke(pages: Page[], pageId: string, index: number, stroke: Stroke): Page[] {
  return pages.map((p) => {
    if (p.id !== pageId) return p;
    const strokes = [...p.strokes];
    strokes.splice(Math.min(index, strokes.length), 0, stroke);
    return { ...p, strokes };
  });
}

function withContinuationPage(pages: Page[], pageId: string): Page[] {
  const lastPage = pages[pages.length - 1];
  if (!lastPage || lastPage.id !== pageId) return pages;
  return [
    ...pages,
    createPage(lastPage.paperColor, lastPage.pattern, {
      width: lastPage.width,
      height: lastPage.height,
    }),
  ];
}

function replaceById<T extends { id: string }>(items: T[], before: T[], after: T[]): T[] {
  const byId = new Map(before.map((item, i) => [item.id, after[i]]));
  return items.map((item) => byId.get(item.id) ?? item);
}

function textItemDiffers(a: TextItem, b: TextItem): boolean {
  return (
    a.markdown !== b.markdown ||
    a.color !== b.color ||
    a.fontSize !== b.fontSize ||
    a.width !== b.width ||
    a.x !== b.x ||
    a.y !== b.y
  );
}

function applyEdit(pages: Page[], edit: Edit, direction: "do" | "undo"): Page[] {
  switch (edit.kind) {
    case "add-stroke":
      return direction === "do"
        ? withStroke(pages, edit.pageId, edit.stroke)
        : withoutStroke(pages, edit.pageId, edit.stroke.id);
    case "remove-stroke":
      return direction === "do"
        ? withoutStroke(pages, edit.pageId, edit.stroke.id)
        : withInsertedStroke(pages, edit.pageId, edit.index, edit.stroke);
    case "clear-page":
      return pages.map((p) =>
        p.id === edit.pageId
          ? direction === "do"
            ? { ...p, strokes: [], images: p.images.filter((i) => i.locked), texts: [] }
            : { ...p, strokes: edit.strokes, images: edit.images, texts: edit.texts }
          : p,
      );
    case "add-elements": {
      if (direction === "do") {
        return pages.map((p) =>
          p.id === edit.pageId
            ? {
                ...p,
                strokes: [...p.strokes, ...edit.strokes],
                images: [...p.images, ...edit.images],
                texts: [...p.texts, ...edit.texts],
              }
            : p,
        );
      }
      return withoutElements(
        pages,
        edit.pageId,
        new Set(edit.strokes.map((s) => s.id)),
        new Set(edit.images.map((i) => i.id)),
        new Set(edit.texts.map((t) => t.id)),
      );
    }
    case "remove-elements": {
      if (direction === "do") {
        return withoutElements(
          pages,
          edit.pageId,
          new Set(edit.strokes.map((e) => e.stroke.id)),
          new Set(edit.images.map((e) => e.image.id)),
          new Set(edit.texts.map((e) => e.text.id)),
        );
      }
      return pages.map((p) => {
        if (p.id !== edit.pageId) return p;
        const strokes = [...p.strokes];
        for (const entry of [...edit.strokes].sort((a, b) => a.index - b.index)) {
          strokes.splice(Math.min(entry.index, strokes.length), 0, entry.stroke);
        }
        const images = [...p.images];
        for (const entry of [...edit.images].sort((a, b) => a.index - b.index)) {
          images.splice(Math.min(entry.index, images.length), 0, entry.image);
        }
        const texts = [...p.texts];
        for (const entry of [...edit.texts].sort((a, b) => a.index - b.index)) {
          texts.splice(Math.min(entry.index, texts.length), 0, entry.text);
        }
        return { ...p, strokes, images, texts };
      });
    }
    case "replace-elements": {
      const strokesBefore = direction === "do" ? edit.strokesBefore : edit.strokesAfter;
      const strokesAfter = direction === "do" ? edit.strokesAfter : edit.strokesBefore;
      const imagesBefore = direction === "do" ? edit.imagesBefore : edit.imagesAfter;
      const imagesAfter = direction === "do" ? edit.imagesAfter : edit.imagesBefore;
      const textsBefore = direction === "do" ? edit.textsBefore : edit.textsAfter;
      const textsAfter = direction === "do" ? edit.textsAfter : edit.textsBefore;
      return pages.map((p) =>
        p.id === edit.pageId
          ? {
              ...p,
              strokes: replaceById(p.strokes, strokesBefore, strokesAfter),
              images: replaceById(p.images, imagesBefore, imagesAfter),
              texts: replaceById(p.texts, textsBefore, textsAfter),
            }
          : p,
      );
    }
  }
}

function selectedElements(state: BoardState): ElementEntries | null {
  const selection = state.selection;
  if (!selection) return null;
  const page = state.pages.find((p) => p.id === selection.pageId);
  if (!page) return null;
  const strokeIds = new Set(selection.strokeIds);
  const imageIds = new Set(selection.imageIds);
  const textIds = new Set(selection.textIds);
  const strokes: { index: number; stroke: Stroke }[] = [];
  const images: { index: number; image: ImageItem }[] = [];
  const texts: { index: number; text: TextItem }[] = [];
  page.strokes.forEach((stroke, index) => {
    if (strokeIds.has(stroke.id)) strokes.push({ index, stroke });
  });
  page.images.forEach((image, index) => {
    if (imageIds.has(image.id)) images.push({ index, image });
  });
  page.texts.forEach((text, index) => {
    if (textIds.has(text.id)) texts.push({ index, text });
  });
  if (strokes.length === 0 && images.length === 0 && texts.length === 0) return null;
  return { pageId: page.id, strokes, images, texts };
}

export const useBoardStore = create<BoardState>()((set) => ({
  notebookId: null,
  notebookTitle: "",
  pages: [createPage(PAPER_COLORS[0])],
  past: [],
  future: [],
  viewPageIndex: 0,
  pendingScrollToPage: null,
  tool: "pen",
  lastPenKind: "pen",
  presentation: false,
  sidebarOpen: false,
  pdfImports: {},
  pdfRangeRequest: null,
  exporting: false,
  geometryEditor: null,
  color: COLORS[0],
  size: SIZES[1],
  paperColor: PAPER_COLORS[0],
  pattern: "blank",
  theme: "system",
  selection: null,
  selectionAnchor: null,
  clipboard: { strokes: [], images: [], texts: [] },
  editingText: null,
  textEditOrigin: null,
  viewState: null,
  loadDocument: (doc) =>
    set({
      notebookId: doc.id,
      notebookTitle: doc.title,
      pages: doc.pages,
      past: [],
      future: [],
      viewPageIndex: 0,
      pendingScrollToPage: null,
      selection: null,
      selectionAnchor: null,
      editingText: null,
      textEditOrigin: null,
      viewState: doc.viewState ?? null,
    }),
  unloadDocument: () =>
    set({
      notebookId: null,
      notebookTitle: "",
      pages: [createPage(PAPER_COLORS[0])],
      past: [],
      future: [],
      viewPageIndex: 0,
      pendingScrollToPage: null,
      selection: null,
      selectionAnchor: null,
      editingText: null,
      textEditOrigin: null,
      viewState: null,
      presentation: false,
    }),
  addStroke: (pageId, stroke) =>
    set((state) => {
      if (!state.pages.some((p) => p.id === pageId)) return state;
      const pages = withContinuationPage(withStroke(state.pages, pageId, stroke), pageId);
      return {
        pages,
        past: [...state.past, { kind: "add-stroke", pageId, stroke }],
        future: [],
      };
    }),
  removeStroke: (pageId, strokeId) =>
    set((state) => {
      const page = state.pages.find((p) => p.id === pageId);
      if (!page) return state;
      const index = page.strokes.findIndex((s) => s.id === strokeId);
      if (index < 0) return state;
      return {
        pages: withoutStroke(state.pages, pageId, strokeId),
        past: [
          ...state.past,
          { kind: "remove-stroke", pageId, index, stroke: page.strokes[index] },
        ],
        future: [],
      };
    }),
  addPage: () =>
    set((state) => {
      const current = state.pages[state.viewPageIndex];
      const insertIndex = state.viewPageIndex + 1;
      const pages = [...state.pages];
      pages.splice(
        insertIndex,
        0,
        createPage(
          current?.paperColor ?? state.paperColor,
          current?.pattern ?? state.pattern,
          current,
        ),
      );
      return { pages, pendingScrollToPage: insertIndex };
    }),
  deletePage: (pageId) =>
    set((state) => {
      if (state.pages.length <= 1) return state;
      const pages = state.pages.filter((p) => p.id !== pageId);
      if (pages.length === state.pages.length) return state;
      const viewId = state.pages[state.viewPageIndex]?.id;
      const followIndex = pages.findIndex((p) => p.id === viewId);
      return {
        pages,
        past: [],
        future: [],
        viewPageIndex:
          followIndex >= 0 ? followIndex : Math.min(state.viewPageIndex, pages.length - 1),
        ...(state.selection?.pageId === pageId ? { selection: null, selectionAnchor: null } : {}),
        ...(state.editingText?.pageId === pageId
          ? { editingText: null, textEditOrigin: null }
          : {}),
      };
    }),
  clearPage: (pageId) =>
    set((state) => {
      const page = state.pages.find((p) => p.id === pageId);
      const hasUnlockedContent =
        page &&
        (page.strokes.length > 0 || page.images.some((i) => !i.locked) || page.texts.length > 0);
      if (!page || !hasUnlockedContent) return state;
      return {
        pages: state.pages.map((p) =>
          p.id === pageId
            ? { ...p, strokes: [], images: p.images.filter((i) => i.locked), texts: [] }
            : p,
        ),
        past: [
          ...state.past,
          {
            kind: "clear-page",
            pageId,
            strokes: page.strokes,
            images: page.images,
            texts: page.texts,
          },
        ],
        future: [],
        ...(state.selection?.pageId === pageId ? { selection: null, selectionAnchor: null } : {}),
      };
    }),
  clearPendingScroll: () => set({ pendingScrollToPage: null }),
  undo: () =>
    set((state) => {
      const edit = state.past[state.past.length - 1];
      if (!edit) return state;
      return {
        pages: applyEdit(state.pages, edit, "undo"),
        past: state.past.slice(0, -1),
        future: [...state.future, edit],
      };
    }),
  redo: () =>
    set((state) => {
      const edit = state.future[state.future.length - 1];
      if (!edit) return state;
      return {
        pages: applyEdit(state.pages, edit, "do"),
        past: [...state.past, edit],
        future: state.future.slice(0, -1),
      };
    }),
  setViewPageIndex: (index) => set({ viewPageIndex: index }),
  setTool: (tool) => {
    if (tool !== "text" && useBoardStore.getState().editingText) {
      useBoardStore.getState().setEditingText(null);
    }
    set((state) => ({
      tool,
      lastPenKind: tool === "pen" || tool === "highlighter" ? tool : state.lastPenKind,
    }));
  },
  setEditingText: (editing) => {
    const state = useBoardStore.getState();
    if (editing) {
      if (state.editingText) state.setEditingText(null);
      const page = useBoardStore.getState().pages.find((p) => p.id === editing.pageId);
      const item = page?.texts.find((t) => t.id === editing.itemId);
      if (!item) return;
      set({ editingText: editing, textEditOrigin: { ...item } });
      return;
    }
    const current = state.editingText;
    const origin = state.textEditOrigin;
    if (!current) return;
    set({ editingText: null, textEditOrigin: null });
    const page = useBoardStore.getState().pages.find((p) => p.id === current.pageId);
    const item = page?.texts.find((t) => t.id === current.itemId);
    if (!page || !item) return;
    if (!item.markdown.trim()) {
      useBoardStore.getState().removeTextItem(current.pageId, item.id);
      return;
    }
    if (!origin) return;
    if (!origin.markdown.trim()) {
      set((s) => ({
        past: [
          ...s.past,
          { kind: "add-elements", pageId: page.id, strokes: [], images: [], texts: [item] },
        ],
        future: [],
      }));
      return;
    }
    if (textItemDiffers(origin, item)) {
      useBoardStore.getState().commitTextHistory(page.id, origin, item);
    }
  },
  setPresentation: (on) =>
    set(
      on ? { presentation: true, selection: null, selectionAnchor: null } : { presentation: false },
    ),
  setPdfImport: (notebookId, progress) =>
    set((state) => {
      const pdfImports = { ...state.pdfImports };
      if (progress) pdfImports[notebookId] = progress;
      else delete pdfImports[notebookId];
      return { pdfImports };
    }),
  setPdfRangeRequest: (pdfRangeRequest) => set({ pdfRangeRequest }),
  setExporting: (exporting) => set({ exporting }),
  openGeometry: () => set({ geometryEditor: { mode: "insert" }, selection: null }),
  editGeometry: (pageId, itemId) => set({ geometryEditor: { mode: "edit", pageId, itemId } }),
  closeGeometry: () => set({ geometryEditor: null }),
  replaceGeometryImage: (pageId, itemId, patch) =>
    set((state) => {
      const page = state.pages.find((p) => p.id === pageId);
      const before = page?.images.find((image) => image.id === itemId);
      if (!page || !before) return state;
      const after: ImageItem = { ...before, ...patch };
      return {
        pages: state.pages.map((p) =>
          p.id === pageId
            ? { ...p, images: p.images.map((image) => (image.id === itemId ? after : image)) }
            : p,
        ),
        past: [
          ...state.past,
          {
            kind: "replace-elements",
            pageId,
            strokesBefore: [],
            strokesAfter: [],
            imagesBefore: [before],
            imagesAfter: [after],
            textsBefore: [],
            textsAfter: [],
          },
        ],
        future: [],
      };
    }),
  textFontSize: DEFAULT_TEXT_FONT_SIZE,
  setTextFontSize: (size) => set({ textFontSize: size }),
  addTextItem: (pageId, x, y) => {
    const state = useBoardStore.getState();
    const page = state.pages.find((p) => p.id === pageId);
    const item = createTextItem(
      x,
      y,
      state.textFontSize,
      state.color,
      page?.width ?? 0,
      page?.height ?? 0,
    );
    set((current) => {
      if (!current.pages.some((p) => p.id === pageId)) return current;
      return {
        pages: current.pages.map((p) =>
          p.id === pageId ? { ...p, texts: [...p.texts, item] } : p,
        ),
      };
    });
    return item.id;
  },
  updateTextItem: (pageId, itemId, patch) =>
    set((state) => ({
      pages: state.pages.map((p) =>
        p.id === pageId
          ? { ...p, texts: p.texts.map((t) => (t.id === itemId ? { ...t, ...patch } : t)) }
          : p,
      ),
    })),
  removeTextItem: (pageId, itemId) =>
    set((state) => ({
      pages: state.pages.map((p) =>
        p.id === pageId ? { ...p, texts: p.texts.filter((t) => t.id !== itemId) } : p,
      ),
    })),
  commitTextHistory: (pageId, before, after) =>
    set((state) => {
      if (!state.pages.some((p) => p.id === pageId)) return state;
      return {
        past: [
          ...state.past,
          {
            kind: "replace-elements",
            pageId,
            strokesBefore: [],
            strokesAfter: [],
            imagesBefore: [],
            imagesAfter: [],
            textsBefore: [before],
            textsAfter: [after],
          },
        ],
        future: [],
      };
    }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  requestScrollToPage: (index) => set({ pendingScrollToPage: index }),
  setColor: (color) => set({ color }),
  setTheme: (theme) => set({ theme }),
  setSize: (size) => set({ size }),
  setPaperColor: (paperColor) =>
    set((state) => ({
      paperColor,
      pages: state.pages.map((p, i) => (i === state.viewPageIndex ? { ...p, paperColor } : p)),
    })),
  setPattern: (pattern) =>
    set((state) => ({
      pattern,
      pages: state.pages.map((p, i) => (i === state.viewPageIndex ? { ...p, pattern } : p)),
    })),
  setPageSize: (size) =>
    set((state) => {
      const page = state.pages[state.viewPageIndex];
      if (!page) return state;
      const next = resizePage(page, size);
      if (next === page) return state;
      return {
        pages: state.pages.map((p, i) => (i === state.viewPageIndex ? next : p)),
        past: [],
        future: [],
        selection: null,
        selectionAnchor: null,
      };
    }),
  replacePdfBaseImage: (pageId, imageId) =>
    set((state) => ({
      pages: state.pages.map((p) =>
        p.id === pageId
          ? { ...p, images: p.images.map((img) => (img.locked ? { ...img, imageId } : img)) }
          : p,
      ),
    })),
  movePage: (from, to) =>
    set((state) => {
      if (state.exporting) return state;
      const count = state.pages.length;
      if (from === to || from < 0 || to < 0 || from >= count || to >= count) return state;
      const viewId = state.pages[state.viewPageIndex]?.id;
      const pages = [...state.pages];
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      return {
        pages,
        viewPageIndex: Math.max(
          0,
          pages.findIndex((p) => p.id === viewId),
        ),
      };
    }),
  setSelection: (selection) =>
    set((state) => {
      if (!selection && !state.selection) return state;
      return selection ? { selection } : { selection: null, selectionAnchor: null };
    }),
  setSelectionAnchor: (anchor) =>
    set((state) => {
      if (!anchor && !state.selectionAnchor) return state;
      if (
        anchor &&
        state.selectionAnchor &&
        Math.round(anchor.x) === Math.round(state.selectionAnchor.x) &&
        Math.round(anchor.y) === Math.round(state.selectionAnchor.y)
      ) {
        return state;
      }
      return { selectionAnchor: anchor };
    }),
  transformSelection: (before, after) =>
    set((state) => {
      const selection = state.selection;
      if (!selection) return state;
      if (
        before.strokes.length !== after.strokes.length ||
        before.images.length !== after.images.length ||
        before.texts.length !== after.texts.length ||
        (before.strokes.length === 0 && before.images.length === 0 && before.texts.length === 0)
      ) {
        return state;
      }
      if (!state.pages.some((p) => p.id === selection.pageId)) return state;
      return {
        pages: state.pages.map((p) =>
          p.id === selection.pageId
            ? {
                ...p,
                strokes: replaceById(p.strokes, before.strokes, after.strokes),
                images: replaceById(p.images, before.images, after.images),
                texts: replaceById(p.texts, before.texts, after.texts),
              }
            : p,
        ),
        past: [
          ...state.past,
          {
            kind: "replace-elements",
            pageId: selection.pageId,
            strokesBefore: before.strokes,
            strokesAfter: after.strokes,
            imagesBefore: before.images,
            imagesAfter: after.images,
            textsBefore: before.texts,
            textsAfter: after.texts,
          },
        ],
        future: [],
      };
    }),
  centerSelection: (axis) =>
    set((state) => {
      const selected = selectedElements(state);
      if (!selected) return state;
      const page = state.pages.find((p) => p.id === selected.pageId);
      if (!page) return state;
      const strokesBefore = selected.strokes.map((e) => e.stroke);
      const imagesBefore = selected.images.map((e) => e.image);
      const textsBefore = selected.texts.map((e) => e.text);
      const bounds = elementsBounds(
        strokesBefore,
        imagesBefore,
        textsBefore.map((t) => ({ item: t, height: textItemHeight(t) })),
      );
      if (!bounds) return state;
      const { dx, dy } = centerDelta(bounds, page.width, page.height, axis);
      if (dx === 0 && dy === 0) return state;
      const strokesAfter = strokesBefore.map((s) => translateStroke(s, dx, dy));
      const imagesAfter = imagesBefore.map((i) => translateImage(i, dx, dy));
      const textsAfter = textsBefore.map((t) => translateText(t, dx, dy));
      return {
        pages: state.pages.map((p) =>
          p.id === selected.pageId
            ? {
                ...p,
                strokes: replaceById(p.strokes, strokesBefore, strokesAfter),
                images: replaceById(p.images, imagesBefore, imagesAfter),
                texts: replaceById(p.texts, textsBefore, textsAfter),
              }
            : p,
        ),
        past: [
          ...state.past,
          {
            kind: "replace-elements",
            pageId: selected.pageId,
            strokesBefore,
            strokesAfter,
            imagesBefore,
            imagesAfter,
            textsBefore,
            textsAfter,
          },
        ],
        future: [],
      };
    }),
  recolorSelection: (color) =>
    set((state) => {
      const selected = selectedElements(state);
      if (!selected || (selected.strokes.length === 0 && selected.texts.length === 0)) {
        return state;
      }
      const strokesBefore = selected.strokes.map((e) => e.stroke);
      const textsBefore = selected.texts.map((e) => e.text);
      if (
        strokesBefore.every((s) => s.color === color) &&
        textsBefore.every((t) => t.color === color)
      ) {
        return state;
      }
      const strokesAfter = strokesBefore.map((s) => ({ ...s, color }));
      const textsAfter = textsBefore.map((t) => ({ ...t, color }));
      return {
        pages: state.pages.map((p) =>
          p.id === selected.pageId
            ? {
                ...p,
                strokes: replaceById(p.strokes, strokesBefore, strokesAfter),
                texts: replaceById(p.texts, textsBefore, textsAfter),
              }
            : p,
        ),
        past: [
          ...state.past,
          {
            kind: "replace-elements",
            pageId: selected.pageId,
            strokesBefore,
            strokesAfter,
            imagesBefore: [],
            imagesAfter: [],
            textsBefore,
            textsAfter,
          },
        ],
        future: [],
      };
    }),
  deleteSelection: () =>
    set((state) => {
      const selected = selectedElements(state);
      if (!selected) return state;
      return {
        pages: withoutElements(
          state.pages,
          selected.pageId,
          new Set(selected.strokes.map((e) => e.stroke.id)),
          new Set(selected.images.map((e) => e.image.id)),
          new Set(selected.texts.map((e) => e.text.id)),
        ),
        past: [
          ...state.past,
          {
            kind: "remove-elements",
            pageId: selected.pageId,
            strokes: selected.strokes,
            images: selected.images,
            texts: selected.texts,
          },
        ],
        future: [],
        selection: null,
        selectionAnchor: null,
      };
    }),
  copySelection: () =>
    set((state) => {
      const selected = selectedElements(state);
      if (!selected) return state;
      return {
        clipboard: {
          strokes: structuredClone(selected.strokes.map((e) => e.stroke)),
          images: structuredClone(selected.images.map((e) => e.image)),
          texts: structuredClone(selected.texts.map((e) => e.text)),
        },
      };
    }),
  cutSelection: () =>
    set((state) => {
      const selected = selectedElements(state);
      if (!selected) return state;
      return {
        clipboard: {
          strokes: structuredClone(selected.strokes.map((e) => e.stroke)),
          images: structuredClone(selected.images.map((e) => e.image)),
          texts: structuredClone(selected.texts.map((e) => e.text)),
        },
        pages: withoutElements(
          state.pages,
          selected.pageId,
          new Set(selected.strokes.map((e) => e.stroke.id)),
          new Set(selected.images.map((e) => e.image.id)),
          new Set(selected.texts.map((e) => e.text.id)),
        ),
        past: [
          ...state.past,
          {
            kind: "remove-elements",
            pageId: selected.pageId,
            strokes: selected.strokes,
            images: selected.images,
            texts: selected.texts,
          },
        ],
        future: [],
        selection: null,
        selectionAnchor: null,
      };
    }),
  pasteClipboard: () =>
    set((state) => {
      const clip = state.clipboard;
      if (clip.strokes.length === 0 && clip.images.length === 0 && clip.texts.length === 0) {
        return state;
      }
      const page = state.pages[state.viewPageIndex] ?? state.pages[0];
      if (!page) return state;
      const strokes = clip.strokes.map((s) => ({ ...structuredClone(s), id: newId() }));
      const images = clip.images.map((i) => ({ ...structuredClone(i), id: newId() }));
      const texts = clip.texts.map((t) => ({ ...structuredClone(t), id: newId() }));
      const bounds = unionBounds(
        unionBounds(strokesBounds(strokes), imagesBounds(images)),
        texts.reduce<ReturnType<typeof imagesBounds>>(
          (acc, t) => unionBounds(acc, textBounds(t, textItemHeight(t))),
          null,
        ),
      );
      if (!bounds) return state;
      const fit = Math.min(
        1,
        (page.width - PLACEMENT_MARGIN * 2) / (bounds.maxX - bounds.minX),
        (page.height - PLACEMENT_MARGIN * 2) / (bounds.maxY - bounds.minY),
      );
      const origin = { x: 0, y: 0 };
      const scaledStrokes =
        fit === 1 ? strokes : strokes.map((s) => scaleStroke(s, origin, fit, fit));
      const scaledImages = fit === 1 ? images : images.map((i) => scaleImage(i, origin, fit, fit));
      const scaledTexts = fit === 1 ? texts : texts.map((t) => scaleTextUniform(t, origin, fit));
      const dx = PLACEMENT_MARGIN - bounds.minX * fit;
      const dy = PLACEMENT_MARGIN - bounds.minY * fit;
      const placedStrokes = scaledStrokes.map((s) => translateStroke(s, dx, dy));
      const placedImages = scaledImages.map((i) => translateImage(i, dx, dy));
      const placedTexts = scaledTexts.map((t) => translateText(t, dx, dy));
      const pages = withContinuationPage(
        state.pages.map((p) =>
          p.id === page.id
            ? {
                ...p,
                strokes: [...p.strokes, ...placedStrokes],
                images: [...p.images, ...placedImages],
                texts: [...p.texts, ...placedTexts],
              }
            : p,
        ),
        page.id,
      );
      return {
        pages,
        past: [
          ...state.past,
          {
            kind: "add-elements",
            pageId: page.id,
            strokes: placedStrokes,
            images: placedImages,
            texts: placedTexts,
          },
        ],
        future: [],
        selection: {
          pageId: page.id,
          strokeIds: placedStrokes.map((s) => s.id),
          imageIds: placedImages.map((i) => i.id),
          textIds: placedTexts.map((t) => t.id),
        },
        tool: "select",
      };
    }),
  insertImage: (imageId, naturalWidth, naturalHeight, extra) =>
    set((state) => {
      const page = state.pages[state.viewPageIndex] ?? state.pages[0];
      if (!page) return state;
      const image = createImageItem(imageId, naturalWidth, naturalHeight, page.width, page.height);
      if (extra?.geometryId) image.geometryId = extra.geometryId;
      if (extra?.pdfSource) image.pdfSource = extra.pdfSource;
      const pages = withContinuationPage(
        state.pages.map((p) => (p.id === page.id ? { ...p, images: [...p.images, image] } : p)),
        page.id,
      );
      return {
        pages,
        past: [
          ...state.past,
          {
            kind: "add-elements",
            pageId: page.id,
            strokes: [],
            images: [image],
            texts: [],
          },
        ],
        future: [],
        selection: { pageId: page.id, strokeIds: [], imageIds: [image.id], textIds: [] },
        tool: "select",
      };
    }),
  insertPdfPages: (pdfPages, pdfSource) =>
    set((state) => {
      if (pdfPages.length === 0) return state;
      const current = state.pages[state.viewPageIndex];
      if (!current) return state;
      const insertIndex = state.viewPageIndex + 1;
      const inserted = buildPdfPages(
        pdfPages,
        current.paperColor,
        current.pattern,
        () => ({ width: current.width, height: current.height }),
        pdfSource?.docId,
      );
      const pages = [...state.pages];
      pages.splice(insertIndex, 0, ...inserted);
      return { pages, pendingScrollToPage: insertIndex };
    }),
}));
