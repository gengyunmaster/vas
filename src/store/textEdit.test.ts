import { beforeEach, describe, expect, it } from "vitest";
import { createPage } from "../model/page";
import { useBoardStore } from "./useBoardStore";

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
    clipboard: { strokes: [], images: [], texts: [], audios: [] },
    editingText: null,
    textEditOrigin: null,
  });
}

beforeEach(reset);

describe("text editing lifecycle", () => {
  it("creates silently, commits one add-elements entry on close", () => {
    const state = useBoardStore.getState();
    const pageId = state.pages[0].id;
    const itemId = state.addTextItem(pageId, 100, 100);
    expect(useBoardStore.getState().past).toHaveLength(0);

    state.setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "hello **world**" });
    useBoardStore.getState().setEditingText(null);

    const after = useBoardStore.getState();
    expect(after.editingText).toBeNull();
    expect(after.pages[0].texts).toHaveLength(1);
    expect(after.pages[0].texts[0].markdown).toBe("hello **world**");
    expect(after.past).toHaveLength(1);
    expect(after.past[0].kind).toBe("add-elements");
  });

  it("undo removes a freshly created text, redo restores it", () => {
    const state = useBoardStore.getState();
    const pageId = state.pages[0].id;
    const itemId = state.addTextItem(pageId, 100, 100);
    state.setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "note" });
    useBoardStore.getState().setEditingText(null);

    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].texts).toHaveLength(0);
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().pages[0].texts).toHaveLength(1);
  });

  it("discards an item closed while still empty, without history", () => {
    const state = useBoardStore.getState();
    const pageId = state.pages[0].id;
    const itemId = state.addTextItem(pageId, 100, 100);
    state.setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "   " });
    useBoardStore.getState().setEditingText(null);
    expect(useBoardStore.getState().pages[0].texts).toHaveLength(0);
    expect(useBoardStore.getState().past).toHaveLength(0);
  });

  it("editing an existing item commits a replace-elements entry", () => {
    const state = useBoardStore.getState();
    const pageId = state.pages[0].id;
    const itemId = state.addTextItem(pageId, 100, 100);
    state.setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "v1" });
    useBoardStore.getState().setEditingText(null);

    useBoardStore.getState().setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "v2" });
    useBoardStore.getState().setEditingText(null);

    const after = useBoardStore.getState();
    expect(after.past).toHaveLength(2);
    expect(after.past[1].kind).toBe("replace-elements");
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().pages[0].texts[0].markdown).toBe("v1");
  });

  it("closing without changes adds no history", () => {
    const state = useBoardStore.getState();
    const pageId = state.pages[0].id;
    const itemId = state.addTextItem(pageId, 100, 100);
    state.setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "v1" });
    useBoardStore.getState().setEditingText(null);

    useBoardStore.getState().setEditingText({ pageId, itemId });
    useBoardStore.getState().setEditingText(null);
    expect(useBoardStore.getState().past).toHaveLength(1);
  });

  it("switching tools finalizes the edit", () => {
    const state = useBoardStore.getState();
    const pageId = state.pages[0].id;
    useBoardStore.getState().setTool("text");
    const itemId = useBoardStore.getState().addTextItem(pageId, 100, 100);
    useBoardStore.getState().setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "typed" });
    useBoardStore.getState().setTool("pen");
    const after = useBoardStore.getState();
    expect(after.editingText).toBeNull();
    expect(after.pages[0].texts).toHaveLength(1);
    expect(after.past).toHaveLength(1);
  });
});

describe("text clipboard", () => {
  it("copy/paste duplicates a text item with a new id and inherits continuation", () => {
    const state = useBoardStore.getState();
    const pageId = state.pages[0].id;
    const itemId = state.addTextItem(pageId, 100, 100);
    state.setEditingText({ pageId, itemId });
    useBoardStore.getState().updateTextItem(pageId, itemId, { markdown: "copy me" });
    useBoardStore.getState().setEditingText(null);

    useBoardStore
      .getState()
      .setSelection({ pageId, strokeIds: [], imageIds: [], textIds: [itemId], audioIds: [] });
    useBoardStore.getState().copySelection();
    useBoardStore.getState().setSelection(null);
    useBoardStore.getState().pasteClipboard();

    const after = useBoardStore.getState();
    expect(after.pages[0].texts).toHaveLength(2);
    const copy = after.pages[0].texts.find((t) => t.id !== itemId);
    expect(copy?.markdown).toBe("copy me");
    // pasting on the last page triggers auto-continuation, like strokes do
    expect(after.pages.length).toBe(2);
  });
});
