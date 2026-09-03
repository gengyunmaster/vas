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

  it("ignores refs inside fenced code blocks", () => {
    const markdown = "![a](image:real)\n\n```\n![b](image:fenced)\n```\n\n![c](image:real-2)";
    expect(textImageRefs(markdown)).toEqual(["real", "real-2"]);
  });

  it("ignores refs inside tilde fences and longer fences", () => {
    const markdown = "~~~~\n![a](image:tilde)\n~~~~\n```js\n![b](image:js)\n```";
    expect(textImageRefs(markdown)).toEqual([]);
  });

  it("requires the closing fence to be at least as long as the opener", () => {
    const markdown = "````\n![a](image:inner)\n```\n![b](image:still-code)\n````\n![c](image:out)";
    expect(textImageRefs(markdown)).toEqual(["out"]);
  });

  it("treats the rest of the document as code after an unclosed fence", () => {
    const markdown = "![a](image:top)\n\n```\n![b](image:gone)\nno closer here\n![c](image:gone-2)";
    expect(textImageRefs(markdown)).toEqual(["top"]);
  });

  it("ignores refs inside inline code spans", () => {
    const markdown = "![a](image:real) `![b](image:span)` ![c](image:real-2)";
    expect(textImageRefs(markdown)).toEqual(["real", "real-2"]);
  });

  it("matches inline code closers by exact backtick run length", () => {
    const markdown = "``x ` ![a](image:inner) ` y`` ![b](image:out)";
    expect(textImageRefs(markdown)).toEqual(["out"]);
    const unclosed = "`x ![a](image:not-code)\n\n![b](image:after)";
    expect(textImageRefs(unclosed)).toEqual(["not-code", "after"]);
  });

  it("keeps refs adjacent to code spans", () => {
    const markdown = "`code`![a](image:tight)`code`";
    expect(textImageRefs(markdown)).toEqual(["tight"]);
  });

  it("does not remap or reject refs inside code", () => {
    const remap = new Map([["real", "mapped"]]);
    const markdown =
      "![a](image:real)\n\n```\n![b](image:literal)\n```\n\n`![c](image:also-literal)`";
    expect(remapTextImageRefs(markdown, remap)).toBe(
      "![a](image:mapped)\n\n```\n![b](image:literal)\n```\n\n`![c](image:also-literal)`",
    );
  });

  it("does not strip refs inside code on export", () => {
    const markdown = "```\n![a](image:ghost)\n```\n\n![b](image:ghost)";
    expect(dropUnknownTextImageRefs(markdown, () => false)).toBe("```\n![a](image:ghost)\n```\n\n");
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
