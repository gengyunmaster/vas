import { describe, expect, it } from "vitest";
import {
  createTextItem,
  dropUnknownTextImageRefs,
  isValidTextItem,
  remapTextImageRefs,
  textImageRefs,
} from "./textItem";

describe("createTextItem", () => {
  it("clamps the box into the page", () => {
    const item = createTextItem(700, 1100, 24, "#1a1a1a", 794, 1123);
    expect(item.x + item.width).toBeLessThanOrEqual(794);
    expect(item.y).toBeLessThanOrEqual(1123);
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.markdown).toBe("");
  });

  it("shrinks width on narrow pages", () => {
    const item = createTextItem(0, 0, 24, "#1a1a1a", 300, 400);
    expect(item.width).toBeLessThanOrEqual(300);
  });
});

describe("text image references", () => {
  it("extracts notebook image refs only", () => {
    const refs = textImageRefs(
      "![a](image:img-1) ![b](https://evil.example/x.png) ![c](image:img-2)",
    );
    expect(refs).toEqual(["img-1", "img-2"]);
  });

  it("remaps refs on import", () => {
    const remap = new Map([["old-1", "new-1"]]);
    expect(remapTextImageRefs("![a](image:old-1)", remap)).toBe("![a](image:new-1)");
  });

  it("rejects refs missing from the remap", () => {
    expect(() => remapTextImageRefs("![a](image:ghost)", new Map())).toThrow("unknown image");
  });

  it("drops unknown refs on export", () => {
    const markdown = "before ![a](image:ghost) after ![b](image:ok) end";
    expect(dropUnknownTextImageRefs(markdown, (id) => id === "ok")).toBe(
      "before  after ![b](image:ok) end",
    );
  });
});

describe("isValidTextItem", () => {
  const valid = createTextItem(10, 10, 24, "#1a1a1a", 794, 1123);

  it("accepts a created item", () => {
    expect(isValidTextItem(valid)).toBe(true);
  });

  it("rejects bad colors, sizes and oversized markdown", () => {
    expect(isValidTextItem({ ...valid, color: "red" })).toBe(false);
    expect(isValidTextItem({ ...valid, fontSize: 0 })).toBe(false);
    expect(isValidTextItem({ ...valid, width: 10 })).toBe(false);
    expect(isValidTextItem({ ...valid, markdown: "x".repeat(20001) })).toBe(false);
    expect(isValidTextItem({ ...valid, x: Number.NaN })).toBe(false);
    expect(isValidTextItem(null)).toBe(false);
  });
});
