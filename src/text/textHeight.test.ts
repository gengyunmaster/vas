import { describe, expect, it } from "vitest";
import { clearTextHeightCache, noteTextItemHeight, textItemHeight } from "./textHeight";

const item = (markdown: string) => ({ markdown, width: 100, fontSize: 10 });

// Fallback estimate for a one-line entry at these settings.
const ESTIMATE = 10 * 1.5 + 10 * 0.5;

describe("textHeight cache", () => {
  it("keeps the larger measurement per key", () => {
    clearTextHeightCache();
    noteTextItemHeight(item("a"), 42);
    noteTextItemHeight(item("a"), 30);
    expect(textItemHeight(item("a"))).toBe(42);
  });

  it("evicts oldest entries beyond the cap", () => {
    clearTextHeightCache();
    for (let i = 0; i < 600; i++) noteTextItemHeight(item(`m${i}`), 42);
    expect(textItemHeight(item("m0"))).toBe(ESTIMATE);
    expect(textItemHeight(item("m599"))).toBe(42);
  });

  it("clearTextHeightCache drops all entries", () => {
    noteTextItemHeight(item("z"), 42);
    clearTextHeightCache();
    expect(textItemHeight(item("z"))).toBe(ESTIMATE);
  });
});
