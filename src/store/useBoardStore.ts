import { create } from "zustand";
import { createImageItem, type ImageItem, placeImageCentered } from "../model/image";
import { createPage, type Page, type PagePattern, PLACEMENT_MARGIN } from "../model/page";
import { newId, type PenKind, type Stroke, type ToolKind } from "../model/stroke";
import {
  imagesBounds,
  strokesBounds,
  translateImage,
  translateStroke,
  unionBounds,
} from "../model/transform";
import type { ViewState } from "../model/viewState";

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
  | { kind: "clear-page"; pageId: string; strokes: Stroke[]; images: ImageItem[] }
  | { kind: "add-elements"; pageId: string; strokes: Stroke[]; images: ImageItem[] }
  | {
      kind: "remove-elements";
      pageId: string;
      strokes: { index: number; stroke: Stroke }[];
      images: { index: number; image: ImageItem }[];
    }
  | {
      kind: "replace-elements";
      pageId: string;
      strokesBefore: Stroke[];
      strokesAfter: Stroke[];
      imagesBefore: ImageItem[];
      imagesAfter: ImageItem[];
    };

export interface SelectionTarget {
  pageId: string;
  strokeIds: string[];
  imageIds: string[];
}

export interface ClipboardContent {
  strokes: Stroke[];
  images: ImageItem[];
}

interface ElementEntries {
  pageId: string;
  strokes: { index: number; stroke: Stroke }[];
  images: { index: number; image: ImageItem }[];
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
  color: string;
  size: number;
  paperColor: string;
  pattern: PagePattern;
  selection: SelectionTarget | null;
  selectionAnchor: { x: number; y: number } | null;
  clipboard: ClipboardContent;
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
  movePage: (from: number, to: number) => void;
  setSelection: (selection: SelectionTarget | null) => void;
  setSelectionAnchor: (anchor: { x: number; y: number } | null) => void;
  transformSelection: (
    before: { strokes: Stroke[]; images: ImageItem[] },
    after: { strokes: Stroke[]; images: ImageItem[] },
  ) => void;
  recolorSelection: (color: string) => void;
  deleteSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
  insertImage: (imageId: string, naturalWidth: number, naturalHeight: number) => void;
  insertPdfPages: (
    pdfPages: { imageId: string; naturalWidth: number; naturalHeight: number }[],
    pdfSource?: { docId: string },
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
): Page[] {
  return pages.map((p) =>
    p.id === pageId
      ? {
          ...p,
          strokes: p.strokes.filter((s) => !strokeIds.has(s.id)),
          images: p.images.filter((i) => !imageIds.has(i.id)),
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

function replaceById<T extends { id: string }>(items: T[], before: T[], after: T[]): T[] {
  const byId = new Map(before.map((item, i) => [item.id, after[i]]));
  return items.map((item) => byId.get(item.id) ?? item);
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
            ? { ...p, strokes: [], images: p.images.filter((i) => i.locked) }
            : { ...p, strokes: edit.strokes, images: edit.images }
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
              }
            : p,
        );
      }
      return withoutElements(
        pages,
        edit.pageId,
        new Set(edit.strokes.map((s) => s.id)),
        new Set(edit.images.map((i) => i.id)),
      );
    }
    case "remove-elements": {
      if (direction === "do") {
        return withoutElements(
          pages,
          edit.pageId,
          new Set(edit.strokes.map((e) => e.stroke.id)),
          new Set(edit.images.map((e) => e.image.id)),
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
        return { ...p, strokes, images };
      });
    }
    case "replace-elements": {
      const strokesBefore = direction === "do" ? edit.strokesBefore : edit.strokesAfter;
      const strokesAfter = direction === "do" ? edit.strokesAfter : edit.strokesBefore;
      const imagesBefore = direction === "do" ? edit.imagesBefore : edit.imagesAfter;
      const imagesAfter = direction === "do" ? edit.imagesAfter : edit.imagesBefore;
      return pages.map((p) =>
        p.id === edit.pageId
          ? {
              ...p,
              strokes: replaceById(p.strokes, strokesBefore, strokesAfter),
              images: replaceById(p.images, imagesBefore, imagesAfter),
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
  const strokes: { index: number; stroke: Stroke }[] = [];
  const images: { index: number; image: ImageItem }[] = [];
  page.strokes.forEach((stroke, index) => {
    if (strokeIds.has(stroke.id)) strokes.push({ index, stroke });
  });
  page.images.forEach((image, index) => {
    if (imageIds.has(image.id)) images.push({ index, image });
  });
  if (strokes.length === 0 && images.length === 0) return null;
  return { pageId: page.id, strokes, images };
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
  color: COLORS[0],
  size: SIZES[1],
  paperColor: PAPER_COLORS[0],
  pattern: "blank",
  selection: null,
  selectionAnchor: null,
  clipboard: { strokes: [], images: [] },
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
      viewState: null,
    }),
  addStroke: (pageId, stroke) =>
    set((state) => {
      if (!state.pages.some((p) => p.id === pageId)) return state;
      let pages = withStroke(state.pages, pageId, stroke);
      const lastPage = state.pages[state.pages.length - 1];
      if (lastPage && lastPage.id === pageId) {
        pages = [...pages, createPage(lastPage.paperColor, lastPage.pattern)];
      }
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
        createPage(current?.paperColor ?? state.paperColor, current?.pattern ?? state.pattern),
      );
      return { pages, pendingScrollToPage: insertIndex };
    }),
  deletePage: (pageId) =>
    set((state) => {
      if (state.pages.length <= 1) return state;
      const pages = state.pages.filter((p) => p.id !== pageId);
      if (pages.length === state.pages.length) return state;
      return {
        pages,
        past: [],
        future: [],
        viewPageIndex: Math.min(state.viewPageIndex, pages.length - 1),
        ...(state.selection?.pageId === pageId ? { selection: null, selectionAnchor: null } : {}),
      };
    }),
  clearPage: (pageId) =>
    set((state) => {
      const page = state.pages.find((p) => p.id === pageId);
      const hasUnlockedContent =
        page && (page.strokes.length > 0 || page.images.some((i) => !i.locked));
      if (!page || !hasUnlockedContent) return state;
      return {
        pages: state.pages.map((p) =>
          p.id === pageId ? { ...p, strokes: [], images: p.images.filter((i) => i.locked) } : p,
        ),
        past: [
          ...state.past,
          { kind: "clear-page", pageId, strokes: page.strokes, images: page.images },
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
  setTool: (tool) =>
    set((state) => ({
      tool,
      lastPenKind: tool === "pen" || tool === "highlighter" ? tool : state.lastPenKind,
    })),
  setPresentation: (on) =>
    set(
      on ? { presentation: true, selection: null, selectionAnchor: null } : { presentation: false },
    ),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  requestScrollToPage: (index) => set({ pendingScrollToPage: index }),
  setColor: (color) => set({ color }),
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
  movePage: (from, to) =>
    set((state) => {
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
        (before.strokes.length === 0 && before.images.length === 0)
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
          },
        ],
        future: [],
      };
    }),
  recolorSelection: (color) =>
    set((state) => {
      const selected = selectedElements(state);
      if (!selected || selected.strokes.length === 0) return state;
      const before = selected.strokes.map((e) => e.stroke);
      if (before.every((s) => s.color === color)) return state;
      const after = before.map((s) => ({ ...s, color }));
      return {
        pages: state.pages.map((p) =>
          p.id === selected.pageId ? { ...p, strokes: replaceById(p.strokes, before, after) } : p,
        ),
        past: [
          ...state.past,
          {
            kind: "replace-elements",
            pageId: selected.pageId,
            strokesBefore: before,
            strokesAfter: after,
            imagesBefore: [],
            imagesAfter: [],
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
        ),
        past: [
          ...state.past,
          {
            kind: "remove-elements",
            pageId: selected.pageId,
            strokes: selected.strokes,
            images: selected.images,
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
        },
        pages: withoutElements(
          state.pages,
          selected.pageId,
          new Set(selected.strokes.map((e) => e.stroke.id)),
          new Set(selected.images.map((e) => e.image.id)),
        ),
        past: [
          ...state.past,
          {
            kind: "remove-elements",
            pageId: selected.pageId,
            strokes: selected.strokes,
            images: selected.images,
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
      if (clip.strokes.length === 0 && clip.images.length === 0) return state;
      const page = state.pages[state.viewPageIndex] ?? state.pages[0];
      if (!page) return state;
      const strokes = clip.strokes.map((s) => ({ ...structuredClone(s), id: newId() }));
      const images = clip.images.map((i) => ({ ...structuredClone(i), id: newId() }));
      const bounds = unionBounds(strokesBounds(strokes), imagesBounds(images));
      if (!bounds) return state;
      const dx = PLACEMENT_MARGIN - bounds.minX;
      const dy = PLACEMENT_MARGIN - bounds.minY;
      const placedStrokes = strokes.map((s) => translateStroke(s, dx, dy));
      const placedImages = images.map((i) => translateImage(i, dx, dy));
      let pages = state.pages.map((p) =>
        p.id === page.id
          ? {
              ...p,
              strokes: [...p.strokes, ...placedStrokes],
              images: [...p.images, ...placedImages],
            }
          : p,
      );
      const lastPage = state.pages[state.pages.length - 1];
      if (lastPage && lastPage.id === page.id) {
        pages = [...pages, createPage(lastPage.paperColor, lastPage.pattern)];
      }
      return {
        pages,
        past: [
          ...state.past,
          { kind: "add-elements", pageId: page.id, strokes: placedStrokes, images: placedImages },
        ],
        future: [],
        selection: {
          pageId: page.id,
          strokeIds: placedStrokes.map((s) => s.id),
          imageIds: placedImages.map((i) => i.id),
        },
        tool: "select",
      };
    }),
  insertImage: (imageId, naturalWidth, naturalHeight) =>
    set((state) => {
      const page = state.pages[state.viewPageIndex] ?? state.pages[0];
      if (!page) return state;
      const image = createImageItem(imageId, naturalWidth, naturalHeight);
      let pages = state.pages.map((p) =>
        p.id === page.id ? { ...p, images: [...p.images, image] } : p,
      );
      const lastPage = state.pages[state.pages.length - 1];
      if (lastPage && lastPage.id === page.id) {
        pages = [...pages, createPage(lastPage.paperColor, lastPage.pattern)];
      }
      return {
        pages,
        past: [
          ...state.past,
          { kind: "add-elements", pageId: page.id, strokes: [], images: [image] },
        ],
        future: [],
        selection: { pageId: page.id, strokeIds: [], imageIds: [image.id] },
        tool: "select",
      };
    }),
  insertPdfPages: (pdfPages, pdfSource) =>
    set((state) => {
      if (pdfPages.length === 0) return state;
      const current = state.pages[state.viewPageIndex];
      if (!current) return state;
      const insertIndex = state.viewPageIndex + 1;
      const inserted: Page[] = pdfPages.map((pdfPage, index) => ({
        id: newId(),
        strokes: [],
        images: [
          {
            id: newId(),
            imageId: pdfPage.imageId,
            ...placeImageCentered(pdfPage.naturalWidth, pdfPage.naturalHeight),
            locked: true,
          },
        ],
        paperColor: current.paperColor,
        pattern: current.pattern,
        ...(pdfSource ? { pdfSource: { docId: pdfSource.docId, pageIndex: index } } : {}),
      }));
      const pages = [...state.pages];
      pages.splice(insertIndex, 0, ...inserted);
      return { pages, pendingScrollToPage: insertIndex };
    }),
}));
