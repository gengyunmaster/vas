import { describe, expect, it } from "vitest";
import { parseToolPrefs } from "./prefs";

describe("parseToolPrefs", () => {
  it("returns an empty object for missing or invalid input", () => {
    expect(parseToolPrefs(null)).toEqual({});
    expect(parseToolPrefs(undefined)).toEqual({});
    expect(parseToolPrefs("garbage")).toEqual({});
    expect(parseToolPrefs(42)).toEqual({});
  });

  it("omits keys that are absent instead of setting them to undefined", () => {
    const parsed = parseToolPrefs({});
    expect(parsed).toEqual({});
    expect("color" in parsed).toBe(false);
    expect("size" in parsed).toBe(false);
  });

  it("keeps only the valid entries from a partial record", () => {
    const parsed = parseToolPrefs({ color: "#ff0000", size: "big", tool: "fountain" });
    expect(parsed).toEqual({ color: "#ff0000" });
  });

  it("parses a full valid record", () => {
    const parsed = parseToolPrefs({
      tool: "highlighter",
      color: "#2F6FDD",
      size: 5,
      paperColor: "#003423",
      pattern: "grid",
      sidebarOpen: true,
    });
    expect(parsed).toEqual({
      tool: "highlighter",
      color: "#2f6fdd",
      size: 5,
      paperColor: "#003423",
      pattern: "grid",
      sidebarOpen: true,
    });
  });

  it("migrates the legacy pen field", () => {
    expect(parseToolPrefs({ pen: "highlighter" })).toEqual({ tool: "highlighter" });
    expect(parseToolPrefs({ pen: "eraser" })).toEqual({});
  });

  it("rejects absurd or non-finite sizes", () => {
    expect(parseToolPrefs({ size: 500 })).toEqual({});
    expect(parseToolPrefs({ size: Infinity })).toEqual({});
    expect(parseToolPrefs({ size: -2 })).toEqual({});
    expect(parseToolPrefs({ size: 2.5 })).toEqual({ size: 2.5 });
  });
});
