import { beforeEach, describe, expect, it } from "vitest";
import type { ImageItem } from "../model/image";
import { createPage } from "../model/page";
import type { Stroke } from "../model/stroke";
import { useBoardStore } from "./useBoardStore";

function sampleStroke(id: string): Stroke {
  return {
    id,
    pen: "pen",
    color: "#1a1a1a",
    size: 5,
    simulatePressure: false,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 12, y: 8, pressure: 0.6 },
    ],
  };
}

function sampleImage(id: string): ImageItem {
  return { id, imageId: "blob-1", x: 100, y: 100, width: 200, height: 100 };
}

function reset(): void {
  useBoardStore.setState({
    pages: [createPage("#ffffff")],
    past: [],
    future: [],
    viewPageIndex: 0,
    pendingScrollToPage: null,
    paperColor: "#ffffff",
    selection: null,
    selectionAnchor: null,
    clipboard: { strokes: [], images: [] },
  });
}

beforeEach(reset);

describe("board store", () => {
  it("starts with a single blank page", () => {
    const state = useBoardStore.getState();
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0].strokes).toHaveLength(0);
  });

  it("appends a stroke to the target page", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    expect(useBoardStore.getState().pages[0].strokes.map((s) => s.id)).toEqual(["s1"]);
  });

  it("auto-appends a blank page when writing on the last page", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    expect(useBoardStore.getState().pages).toHaveLength(2);
    expect(useBoardStore.getState().pages[1].strokes).toHaveLength(0);
  });

  it("does not auto-append when writing on an earlier page", () => {
    const firstId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(firstId, sampleStroke("s1"));
    useBoardStore.getState().addStroke(firstId, sampleStroke("s2"));
    expect(useBoardStore.getState().pages).toHaveLength(2);
  });

  it("addPage inserts right after the current page", () => {
    const firstId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(firstId, sampleStroke("s1"));
    useBoardStore.getState().setViewPageIndex(0);
    useBoardStore.getState().addPage();
    const pages = useBoardStore.getState().pages;
    expect(pages).toHaveLength(3);
    expect(pages[1].strokes).toHaveLength(0);
    expect(pages[1].paperColor).toBe(useBoardStore.getState().paperColor);
    expect(useBoardStore.getState().pendingScrollToPage).toBe(1);
  });

  it("undo removes the last stroke and redo restores it", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].strokes).toHaveLength(0);
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().pages[0].strokes.map((s) => s.id)).toEqual(["s1"]);
  });

  it("clearPage empties the page and undo restores it", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().clearPage(pageId);
    expect(useBoardStore.getState().pages[0].strokes).toHaveLength(0);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].strokes.map((s) => s.id)).toEqual(["s1"]);
  });

  it("clearPage on an empty page is a no-op", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().clearPage(pageId);
    expect(useBoardStore.getState().past).toHaveLength(0);
  });

  it("a new edit clears the redo stack", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().undo();
    useBoardStore.getState().addStroke(pageId, sampleStroke("s2"));
    expect(useBoardStore.getState().future).toHaveLength(0);
  });

  it("undo and redo on empty stacks are no-ops", () => {
    useBoardStore.getState().undo();
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().pages[0].strokes).toHaveLength(0);
  });

  it("setPaperColor recolors only the current page", () => {
    useBoardStore.getState().addPage();
    useBoardStore.getState().setPaperColor("#003423");
    const pages = useBoardStore.getState().pages;
    expect(pages[0].paperColor).toBe("#003423");
    expect(pages[1].paperColor).toBe("#ffffff");
  });

  it("setPaperColor on another page keeps earlier pages untouched", () => {
    useBoardStore.getState().addPage();
    useBoardStore.getState().setViewPageIndex(1);
    useBoardStore.getState().setPaperColor("#003423");
    const pages = useBoardStore.getState().pages;
    expect(pages[0].paperColor).toBe("#ffffff");
    expect(pages[1].paperColor).toBe("#003423");
  });

  it("a manually added page copies the current page's paper color", () => {
    useBoardStore.setState({ pages: [createPage("#003423")], paperColor: "#ffffff" });
    useBoardStore.getState().addPage();
    expect(useBoardStore.getState().pages[1].paperColor).toBe("#003423");
  });

  it("an auto-appended page copies the last page's paper color", () => {
    useBoardStore.setState({ pages: [createPage("#b98a5f")], paperColor: "#ffffff" });
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    const pages = useBoardStore.getState().pages;
    expect(pages).toHaveLength(2);
    expect(pages[1].paperColor).toBe("#b98a5f");
  });

  it("loadDocument hydrates the notebook and clears history", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().loadDocument({
      id: "nb-1",
      title: "Loaded",
      pages: [createPage("#fbf3db")],
    });
    const state = useBoardStore.getState();
    expect(state.notebookId).toBe("nb-1");
    expect(state.notebookTitle).toBe("Loaded");
    expect(state.pages[0].paperColor).toBe("#fbf3db");
    expect(state.past).toHaveLength(0);
    expect(state.viewPageIndex).toBe(0);
  });

  it("unloadDocument returns to a blank notebook", () => {
    useBoardStore.getState().loadDocument({
      id: "nb-1",
      title: "Loaded",
      pages: [createPage("#fbf3db")],
    });
    useBoardStore.getState().unloadDocument();
    const state = useBoardStore.getState();
    expect(state.notebookId).toBeNull();
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0].strokes).toHaveLength(0);
  });

  it("clearPage leaves other pages untouched", () => {
    const firstId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(firstId, sampleStroke("s1"));
    const secondId = useBoardStore.getState().pages[1].id;
    useBoardStore.getState().addStroke(secondId, sampleStroke("s2"));
    useBoardStore.getState().clearPage(firstId);
    const pages = useBoardStore.getState().pages;
    expect(pages[0].strokes).toHaveLength(0);
    expect(pages[1].strokes.map((s) => s.id)).toEqual(["s2"]);
  });

  it("clearPage keeps locked images and undo restores the removed content", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.setState({
      pages: [
        {
          ...useBoardStore.getState().pages[0],
          strokes: [sampleStroke("s1")],
          images: [sampleImage("i1"), { ...sampleImage("i2"), locked: true }],
        },
      ],
    });
    useBoardStore.getState().clearPage(pageId);
    let state = useBoardStore.getState();
    expect(state.pages[0].strokes).toHaveLength(0);
    expect(state.pages[0].images.map((i) => i.id)).toEqual(["i2"]);
    useBoardStore.getState().undo();
    state = useBoardStore.getState();
    expect(state.pages[0].strokes.map((s) => s.id)).toEqual(["s1"]);
    expect(state.pages[0].images.map((i) => i.id)).toEqual(["i1", "i2"]);
  });

  it("clearPage is a no-op on a page with only locked images", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.setState({
      pages: [
        {
          ...useBoardStore.getState().pages[0],
          images: [{ ...sampleImage("i1"), locked: true }],
        },
      ],
    });
    useBoardStore.getState().clearPage(pageId);
    expect(useBoardStore.getState().pages[0].images).toHaveLength(1);
    expect(useBoardStore.getState().past).toHaveLength(0);
  });

  it("deletePage removes the page and resets history", () => {
    const firstId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(firstId, sampleStroke("s1"));
    const secondId = useBoardStore.getState().pages[1].id;
    useBoardStore.getState().deletePage(firstId);
    const state = useBoardStore.getState();
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0].id).toBe(secondId);
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
  });

  it("deletePage is a no-op on the last remaining page", () => {
    const onlyId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().deletePage(onlyId);
    expect(useBoardStore.getState().pages).toHaveLength(1);
  });

  it("deletePage clamps the view page index", () => {
    useBoardStore.getState().addPage();
    useBoardStore.getState().setViewPageIndex(1);
    const secondId = useBoardStore.getState().pages[1].id;
    useBoardStore.getState().deletePage(secondId);
    expect(useBoardStore.getState().viewPageIndex).toBe(0);
  });

  it("removeStroke erases the stroke and undo restores it at its original index", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().addStroke(pageId, sampleStroke("s2"));
    useBoardStore.getState().removeStroke(pageId, "s1");
    expect(useBoardStore.getState().pages[0].strokes.map((s) => s.id)).toEqual(["s2"]);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].strokes.map((s) => s.id)).toEqual(["s1", "s2"]);
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().pages[0].strokes.map((s) => s.id)).toEqual(["s2"]);
  });

  it("removeStroke with an unknown id is a no-op", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().removeStroke(pageId, "missing");
    expect(useBoardStore.getState().past).toHaveLength(0);
  });

  it("setPattern applies to the current page only", () => {
    useBoardStore.getState().addPage();
    useBoardStore.getState().setPattern("grid");
    const pages = useBoardStore.getState().pages;
    expect(pages[0].pattern).toBe("grid");
    expect(pages[1].pattern).toBe("blank");
  });

  it("a manually added page copies the current page's pattern", () => {
    useBoardStore.getState().setPattern("lined");
    useBoardStore.getState().addPage();
    expect(useBoardStore.getState().pages[1].pattern).toBe("lined");
  });

  it("an auto-appended page copies the last page's pattern", () => {
    useBoardStore.getState().setPattern("dots");
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    expect(useBoardStore.getState().pages[1].pattern).toBe("dots");
  });

  it("setTool remembers the last pen kind across the eraser", () => {
    useBoardStore.getState().setTool("highlighter");
    useBoardStore.getState().setTool("eraser");
    expect(useBoardStore.getState().lastPenKind).toBe("highlighter");
    useBoardStore.getState().setTool(useBoardStore.getState().lastPenKind);
    expect(useBoardStore.getState().tool).toBe("highlighter");
  });

  it("setTool keeps the pen kind when switching to the laser", () => {
    useBoardStore.getState().setTool("highlighter");
    useBoardStore.getState().setTool("laser");
    expect(useBoardStore.getState().lastPenKind).toBe("highlighter");
  });

  it("addStroke with an unknown page id is a no-op", () => {
    useBoardStore.getState().addStroke("missing-page", sampleStroke("s1"));
    const state = useBoardStore.getState();
    expect(state.pages[0].strokes).toHaveLength(0);
    expect(state.past).toHaveLength(0);
  });
});

describe("selection and clipboard", () => {
  function setupSelection(ids: string[] = ["s1", "s2"]): string {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().addStroke(pageId, sampleStroke("s2"));
    useBoardStore.getState().setSelection({ pageId, strokeIds: ids, imageIds: [] });
    return pageId;
  }

  it("transformSelection replaces the strokes as a single undoable edit", () => {
    setupSelection();
    const before = useBoardStore.getState().pages[0].strokes;
    const after = before.map((s) => ({
      ...s,
      points: s.points.map((p) => ({ ...p, x: p.x + 100 })),
    }));
    useBoardStore
      .getState()
      .transformSelection({ strokes: [...before], images: [] }, { strokes: after, images: [] });
    expect(useBoardStore.getState().pages[0].strokes[0].points[0].x).toBe(100);
    expect(useBoardStore.getState().past).toHaveLength(3);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].strokes[0].points[0].x).toBe(0);
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().pages[0].strokes[0].points[0].x).toBe(100);
  });

  it("transformSelection without a selection is a no-op", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    const before = useBoardStore.getState().past.length;
    useBoardStore
      .getState()
      .transformSelection({ strokes: [], images: [] }, { strokes: [], images: [] });
    expect(useBoardStore.getState().past).toHaveLength(before);
  });

  it("recolorSelection recolors only the selected strokes", () => {
    setupSelection(["s1"]);
    useBoardStore.getState().recolorSelection("#d64541");
    const strokes = useBoardStore.getState().pages[0].strokes;
    expect(strokes[0].color).toBe("#d64541");
    expect(strokes[1].color).toBe("#1a1a1a");
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].strokes[0].color).toBe("#1a1a1a");
  });

  it("recolorSelection with the same color is a no-op", () => {
    setupSelection(["s1"]);
    const past = useBoardStore.getState().past.length;
    useBoardStore.getState().recolorSelection("#1a1a1a");
    expect(useBoardStore.getState().past).toHaveLength(past);
  });

  it("deleteSelection removes the strokes and undo restores their order", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().addStroke(pageId, sampleStroke("s2"));
    useBoardStore.getState().addStroke(pageId, sampleStroke("s3"));
    useBoardStore.getState().setSelection({ pageId, strokeIds: ["s1", "s3"], imageIds: [] });
    useBoardStore.getState().deleteSelection();
    let state = useBoardStore.getState();
    expect(state.pages[0].strokes.map((s) => s.id)).toEqual(["s2"]);
    expect(state.selection).toBeNull();
    useBoardStore.getState().undo();
    state = useBoardStore.getState();
    expect(state.pages[0].strokes.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("copySelection keeps the strokes and snapshots the clipboard", () => {
    setupSelection(["s1"]);
    useBoardStore.getState().copySelection();
    const state = useBoardStore.getState();
    expect(state.pages[0].strokes).toHaveLength(2);
    expect(state.clipboard.strokes.map((s) => s.id)).toEqual(["s1"]);
    state.clipboard.strokes[0].points[0].x = 9999;
    expect(useBoardStore.getState().pages[0].strokes[0].points[0].x).toBe(0);
  });

  it("cutSelection removes the strokes and fills the clipboard", () => {
    setupSelection(["s2"]);
    useBoardStore.getState().cutSelection();
    const state = useBoardStore.getState();
    expect(state.pages[0].strokes.map((s) => s.id)).toEqual(["s1"]);
    expect(state.clipboard.strokes.map((s) => s.id)).toEqual(["s2"]);
    expect(state.selection).toBeNull();
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].strokes).toHaveLength(2);
  });

  it("pasteClipboard pastes at the top-left margin with fresh ids and selects the result", () => {
    setupSelection(["s1"]);
    useBoardStore.getState().copySelection();
    useBoardStore.getState().setSelection(null);
    useBoardStore.getState().pasteClipboard();
    const state = useBoardStore.getState();
    expect(state.pages[0].strokes).toHaveLength(3);
    const pasted = state.pages[0].strokes[2];
    expect(pasted.id).not.toBe("s1");
    expect(pasted.points[0].x).toBe(42.5);
    expect(pasted.points[0].y).toBe(42.5);
    expect(state.selection?.strokeIds).toEqual([pasted.id]);
    expect(state.tool).toBe("select");
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].strokes).toHaveLength(2);
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().pages[0].strokes).toHaveLength(3);
  });

  it("pasting twice yields distinct stroke ids", () => {
    setupSelection(["s1"]);
    useBoardStore.getState().copySelection();
    useBoardStore.getState().pasteClipboard();
    useBoardStore.getState().pasteClipboard();
    const ids = useBoardStore.getState().pages[0].strokes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pasteClipboard with an empty clipboard is a no-op", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    const past = useBoardStore.getState().past.length;
    useBoardStore.getState().pasteClipboard();
    expect(useBoardStore.getState().past).toHaveLength(past);
  });

  it("cut then paste on another page moves the content across pages", () => {
    const firstId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(firstId, sampleStroke("s1"));
    useBoardStore.getState().setSelection({ pageId: firstId, strokeIds: ["s1"], imageIds: [] });
    useBoardStore.getState().cutSelection();
    useBoardStore.getState().setViewPageIndex(1);
    useBoardStore.getState().pasteClipboard();
    const state = useBoardStore.getState();
    expect(state.pages[0].strokes).toHaveLength(0);
    expect(state.pages[1].strokes).toHaveLength(1);
    expect(state.selection?.pageId).toBe(state.pages[1].id);
  });

  it("setSelection(null) clears the anchor as well", () => {
    setupSelection(["s1"]);
    useBoardStore.getState().setSelectionAnchor({ x: 10, y: 20 });
    useBoardStore.getState().setSelection(null);
    expect(useBoardStore.getState().selectionAnchor).toBeNull();
  });

  it("entering presentation mode clears the selection", () => {
    setupSelection(["s1"]);
    useBoardStore.getState().setPresentation(true);
    expect(useBoardStore.getState().selection).toBeNull();
    useBoardStore.getState().setPresentation(false);
    expect(useBoardStore.getState().presentation).toBe(false);
  });

  it("pasteClipboard on the last page auto-appends a blank page", () => {
    useBoardStore.setState({ pages: [createPage("#b98a5f")], viewPageIndex: 0 });
    const firstId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(firstId, sampleStroke("s1"));
    useBoardStore.getState().setSelection({ pageId: firstId, strokeIds: ["s1"], imageIds: [] });
    useBoardStore.getState().copySelection();
    useBoardStore.getState().setViewPageIndex(1);
    useBoardStore.getState().pasteClipboard();
    const pages = useBoardStore.getState().pages;
    expect(pages).toHaveLength(3);
    expect(pages[2].strokes).toHaveLength(0);
    expect(pages[2].paperColor).toBe("#b98a5f");
  });

  it("pasteClipboard on an earlier page does not append a page", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().setSelection({ pageId, strokeIds: ["s1"], imageIds: [] });
    useBoardStore.getState().copySelection();
    useBoardStore.getState().setViewPageIndex(0);
    useBoardStore.getState().pasteClipboard();
    expect(useBoardStore.getState().pages).toHaveLength(2);
  });

  it("insertImage places the image, selects it, and undo removes it", () => {
    useBoardStore.getState().insertImage("blob-1", 200, 100);
    const state = useBoardStore.getState();
    expect(state.pages[0].images).toHaveLength(1);
    expect(state.pages[0].images[0].imageId).toBe("blob-1");
    expect(state.pages[0].images[0].x).toBe(40);
    expect(state.pages[0].images[0].y).toBe(40);
    expect(state.selection?.imageIds).toEqual([state.pages[0].images[0].id]);
    expect(state.tool).toBe("select");
    expect(state.pages).toHaveLength(2);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].images).toHaveLength(0);
  });

  it("insertImage on an earlier page does not append a page", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.getState().addStroke(pageId, sampleStroke("s1"));
    useBoardStore.getState().setViewPageIndex(0);
    useBoardStore.getState().insertImage("blob-1", 100, 100);
    expect(useBoardStore.getState().pages).toHaveLength(2);
  });

  it("clearPage also clears images and undo restores them", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.setState({
      pages: [{ ...useBoardStore.getState().pages[0], images: [sampleImage("i1")] }],
    });
    useBoardStore.getState().clearPage(pageId);
    expect(useBoardStore.getState().pages[0].images).toHaveLength(0);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].images.map((i) => i.id)).toEqual(["i1"]);
  });

  it("deleteSelection removes strokes and images as a single edit", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.setState({
      pages: [
        {
          ...useBoardStore.getState().pages[0],
          strokes: [sampleStroke("s1")],
          images: [sampleImage("i1")],
        },
      ],
    });
    useBoardStore.getState().setSelection({ pageId, strokeIds: ["s1"], imageIds: ["i1"] });
    useBoardStore.getState().deleteSelection();
    let state = useBoardStore.getState();
    expect(state.pages[0].strokes).toHaveLength(0);
    expect(state.pages[0].images).toHaveLength(0);
    expect(state.past).toHaveLength(1);
    useBoardStore.getState().undo();
    state = useBoardStore.getState();
    expect(state.pages[0].strokes.map((s) => s.id)).toEqual(["s1"]);
    expect(state.pages[0].images.map((i) => i.id)).toEqual(["i1"]);
  });

  it("copy and paste duplicates images with fresh item ids sharing the blob", () => {
    const pageId = useBoardStore.getState().pages[0].id;
    useBoardStore.setState({
      pages: [
        {
          ...useBoardStore.getState().pages[0],
          strokes: [sampleStroke("s1")],
          images: [sampleImage("i1")],
        },
      ],
    });
    useBoardStore.getState().setSelection({ pageId, strokeIds: ["s1"], imageIds: ["i1"] });
    useBoardStore.getState().copySelection();
    expect(useBoardStore.getState().clipboard.images[0].imageId).toBe("blob-1");
    useBoardStore.getState().pasteClipboard();
    const state = useBoardStore.getState();
    expect(state.pages[0].images).toHaveLength(2);
    const pasted = state.pages[0].images[1];
    expect(pasted.id).not.toBe("i1");
    expect(pasted.imageId).toBe("blob-1");
    expect(pasted.x).toBe(142.5);
    expect(pasted.y).toBe(142.5);
    expect(state.selection?.imageIds).toEqual([pasted.id]);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].images).toHaveLength(1);
  });
});

describe("insertPdfPages", () => {
  it("inserts locked pages after the current page inheriting its style", () => {
    useBoardStore.setState({
      pages: [createPage("#003423", "grid"), createPage("#ffffff")],
      viewPageIndex: 0,
    });
    useBoardStore.getState().insertPdfPages([
      { imageId: "blob-1", naturalWidth: 200, naturalHeight: 100 },
      { imageId: "blob-2", naturalWidth: 100, naturalHeight: 100 },
    ]);
    const state = useBoardStore.getState();
    expect(state.pages).toHaveLength(4);
    const inserted = state.pages[1];
    expect(inserted.paperColor).toBe("#003423");
    expect(inserted.pattern).toBe("grid");
    expect(inserted.images).toHaveLength(1);
    expect(inserted.images[0].locked).toBe(true);
    expect(inserted.images[0].imageId).toBe("blob-1");
    expect(inserted.images[0].x).toBeCloseTo(0);
    expect(inserted.images[0].width).toBeCloseTo(794);
    expect(state.pages[2].images[0].imageId).toBe("blob-2");
    expect(state.pendingScrollToPage).toBe(1);
    expect(state.past).toHaveLength(0);
  });

  it("insertPdfPages with an empty list is a no-op", () => {
    useBoardStore.getState().insertPdfPages([]);
    expect(useBoardStore.getState().pages).toHaveLength(1);
    expect(useBoardStore.getState().pendingScrollToPage).toBeNull();
  });
});

describe("movePage", () => {
  it("reorders pages and keeps the view on the same page", () => {
    useBoardStore.setState({
      pages: [createPage("#ffffff"), createPage("#ffffff"), createPage("#ffffff")],
      viewPageIndex: 2,
    });
    const [a, b, c] = useBoardStore.getState().pages.map((p) => p.id);
    useBoardStore.getState().movePage(2, 0);
    const state = useBoardStore.getState();
    expect(state.pages.map((p) => p.id)).toEqual([c, a, b]);
    expect(state.viewPageIndex).toBe(0);
  });

  it("keeps the view page when an earlier page moves after it", () => {
    useBoardStore.setState({
      pages: [createPage("#ffffff"), createPage("#ffffff"), createPage("#ffffff")],
      viewPageIndex: 2,
    });
    const [a, b, c] = useBoardStore.getState().pages.map((p) => p.id);
    useBoardStore.getState().movePage(0, 2);
    const state = useBoardStore.getState();
    expect(state.pages.map((p) => p.id)).toEqual([b, c, a]);
    expect(state.viewPageIndex).toBe(1);
  });

  it("is a no-op for invalid indices", () => {
    const before = useBoardStore.getState().pages;
    useBoardStore.getState().movePage(0, 0);
    useBoardStore.getState().movePage(-1, 0);
    useBoardStore.getState().movePage(0, 5);
    expect(useBoardStore.getState().pages).toBe(before);
  });
});
