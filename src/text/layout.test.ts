import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../markdown/blocks";
import { type FontSpec, layoutBlocks, splitAtoms } from "./layout";

// Deterministic stub: every character is 10 units wide (20 for bold).
const measure = (text: string, font: FontSpec) => text.length * (font.bold ? 20 : 10);

const noMath = async () => null;
const noImages = () => null;

async function layout(source: string, width = 200, fontSize = 10) {
  return layoutBlocks(parseMarkdown(source), {
    width,
    fontSize,
    color: "#000000",
    measure,
    resolveMath: noMath,
    resolveImageSize: noImages,
  });
}

describe("splitAtoms", () => {
  it("keeps latin words whole and breaks cjk per character", () => {
    expect(splitAtoms("hello world")).toEqual(["hello", " world"]);
    expect(splitAtoms("你好世界")).toEqual(["你", "好", "世", "界"]);
    expect(splitAtoms("abc你def")).toEqual(["abc", "你", "def"]);
  });
});

describe("layoutBlocks", () => {
  it("wraps latin text at word boundaries", async () => {
    const result = await layout("aaaa bbbb cccc", 100, 10);
    // 40px word + 50px spaced word = 90px fills line one; the third word wraps.
    const lines = new Set(
      result.runs.filter((r) => r.kind === "text").map((r) => (r.kind === "text" ? r.y : 0)),
    );
    expect(lines.size).toBe(2);
  });

  it("breaks cjk text anywhere", async () => {
    const result = await layout("你好世界你好世界你好", 90, 10);
    const ys = new Set(
      result.runs.filter((r) => r.kind === "text").map((r) => (r.kind === "text" ? r.y : 0)),
    );
    expect(ys.size).toBe(2);
  });

  it("grows height with content and honors explicit breaks", async () => {
    const single = await layout("one");
    const multi = await layout("one\ntwo\nthree");
    expect(multi.height).toBeGreaterThan(single.height * 2);
  });

  it("adds a quote bar for blockquotes", async () => {
    const result = await layout("> hello");
    expect(result.decorations.some((d) => d.kind === "quoteBar")).toBe(true);
    const bar = result.decorations.find((d) => d.kind === "quoteBar");
    expect(bar && bar.kind === "quoteBar" ? bar.height : 0).toBeGreaterThan(0);
  });

  it("renders code blocks on a background with monospace font", async () => {
    const result = await layout("```\nlet x = 1;\n```");
    expect(result.decorations.some((d) => d.kind === "codeBg")).toBe(true);
    const run = result.runs.find((r) => r.kind === "text");
    expect(run && run.kind === "text" ? run.font.code : false).toBe(true);
  });

  it("scales headings and lays out list markers", async () => {
    const result = await layout("# Title\n\n- item");
    const heading = result.runs.find((r) => r.kind === "text" && r.text === "Title");
    expect(heading && heading.kind === "text" ? heading.font.bold : false).toBe(true);
    const marker = result.runs.find((r) => r.kind === "text" && r.text === "•");
    expect(marker).toBeTruthy();
  });

  it("lays out math atoms on the text baseline", async () => {
    const glyph = {
      body: "<path d='M0 0'/>",
      viewBox: [0, -400, 1000, 600] as [number, number, number, number],
    };
    const result = await layoutBlocks(parseMarkdown("a $x^2$ b"), {
      width: 500,
      fontSize: 10,
      color: "#000000",
      measure,
      resolveMath: async () => glyph,
      resolveImageSize: noImages,
    });
    const math = result.runs.find((r) => r.kind === "math");
    expect(math && math.kind === "math" ? math.width : 0).toBeCloseTo(10, 3);
  });

  it("sizes images to the box width preserving aspect", async () => {
    const result = await layoutBlocks(parseMarkdown("![pic](image:img1)"), {
      width: 100,
      fontSize: 10,
      color: "#000000",
      measure,
      resolveMath: noMath,
      resolveImageSize: () => ({ width: 400, height: 200 }),
    });
    const image = result.runs.find((r) => r.kind === "image");
    expect(image && image.kind === "image" ? [image.width, image.height] : null).toEqual([100, 50]);
  });

  it("applies color spans to runs", async () => {
    const result = await layout("{#ff0000|red} plain");
    const colors = result.runs
      .filter((r) => r.kind === "text")
      .map((r) => (r.kind === "text" ? r.color : ""));
    expect(colors).toContain("#ff0000");
    expect(colors).toContain("#000000");
  });
});
