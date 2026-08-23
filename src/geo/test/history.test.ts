import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  HISTORY_LIMIT,
  pushHistory,
  redo,
  undo,
} from "../history/history";
import { createDocument } from "../model";

describe("history", () => {
  it("caps the past stack at HISTORY_LIMIT", () => {
    let history = createHistory(createDocument());
    for (let i = 0; i < HISTORY_LIMIT + 50; i += 1) {
      history = pushHistory(history, { ...createDocument() });
    }
    expect(history.past.length).toBe(HISTORY_LIMIT);
    let current = history;
    while (canUndo(current)) current = undo(current);
    expect(current.past.length).toBe(0);
  });

  it("undoes and redoes in order", () => {
    const a = createDocument();
    const b = { ...createDocument() };
    const c = { ...createDocument() };
    let history = createHistory(a);
    history = pushHistory(history, b);
    history = pushHistory(history, c);
    history = undo(history);
    expect(history.present).toBe(b);
    expect(canRedo(history)).toBe(true);
    history = redo(history);
    expect(history.present).toBe(c);
  });

  it("ignores pushing the identical snapshot", () => {
    const a = createDocument();
    const history = pushHistory(createHistory(a), a);
    expect(history.past.length).toBe(0);
  });
});
