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

  it("preserves spaces across inline style boundaries", async () => {
    const result = await layout("Plain **bold**, *italic* and ~~gone~~");
    const text = result.runs.map((r) => (r.kind === "text" ? r.text : "")).join("");
    expect(text).toBe("Plain bold, italic and gone");
  });

  it("keeps the spaces around inline math", async () => {
    const glyph = {
      body: "<path d='M0 0'/>",
      viewBox: [0, -400, 1000, 600] as [number, number, number, number],
    };
    const result = await layoutBlocks(parseMarkdown("see $x$ end"), {
      width: 500,
      fontSize: 10,
      color: "#000000",
      measure,
      resolveMath: async () => glyph,
      resolveImageSize: noImages,
    });
    const text = result.runs.map((r) => (r.kind === "text" ? r.text : "#")).join("");
    expect(text).toBe("see # end");
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

  it("advances x across colored code segments on one line", async () => {
    const result = await layout("```\n{#ff0000|ab} cd\n```");
    const runs = result.runs.filter((r) => r.kind === "text");
    if (runs[0]?.kind !== "text" || runs[1]?.kind !== "text") throw new Error("missing runs");
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ text: "ab", x: 8, color: "#ff0000" });
    expect(runs[1]).toMatchObject({ text: " cd", x: 28, color: "#000000" });
    expect(runs[1].y).toBe(runs[0].y);
  });

  it("keeps a color across newlines inside one code span", async () => {
    const result = await layout("```\n{#ff0000|a\nb}\n```");
    const runs = result.runs.filter((r) => r.kind === "text");
    if (runs[0]?.kind !== "text" || runs[1]?.kind !== "text") throw new Error("missing runs");
    expect(runs.map((r) => (r.kind === "text" ? r.color : ""))).toEqual(["#ff0000", "#ff0000"]);
    expect(runs[1].y).toBeGreaterThan(runs[0].y);
  });

  it("does not change code block height when colors are applied", async () => {
    const colored = await layout("```\n{#ff0000|ab} cd\n```");
    const plain = await layout("```\nab cd\n```");
    expect(colored.height).toBe(plain.height);
  });

  it("highlights fenced code with a language using the paper palette", async () => {
    const light = await layout("```js\nlet x\n```");
    const keyword = light.runs.find((r) => r.kind === "text" && r.text === "let");
    expect(keyword && keyword.kind === "text" ? keyword.color : "").toBe("#a626a4");
    const dark = await layoutBlocks(parseMarkdown("```js\nlet x\n```"), {
      width: 200,
      fontSize: 10,
      color: "#eeeeee",
      measure,
      resolveMath: noMath,
      resolveImageSize: noImages,
      darkPaper: true,
    });
    const darkKeyword = dark.runs.find((r) => r.kind === "text" && r.text === "let");
    expect(darkKeyword && darkKeyword.kind === "text" ? darkKeyword.color : "").toBe("#c678dd");
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

  it("carries color spans onto math runs", async () => {
    const glyph = {
      body: "<path d='M0 0'/>",
      viewBox: [0, -400, 1000, 600] as [number, number, number, number],
    };
    const result = await layoutBlocks(parseMarkdown("{#2f6fdd|$x^2$}"), {
      width: 500,
      fontSize: 10,
      color: "#000000",
      measure,
      resolveMath: async () => glyph,
      resolveImageSize: noImages,
    });
    const math = result.runs.find((r) => r.kind === "math");
    expect(math && math.kind === "math" ? math.color : "").toBe("#2f6fdd");
  });

  it("grows the line around tall inline math and keeps glyphs inside height", async () => {
    // Fraction-like glyph: 12 units ascent, 12 descent at fontSize 10.
    const glyph = {
      body: "<path d='M0 0'/>",
      viewBox: [0, -1200, 1000, 2400] as [number, number, number, number],
    };
    const opts = {
      width: 500,
      fontSize: 10,
      color: "#000000",
      measure,
      resolveMath: async () => glyph,
      resolveImageSize: noImages,
    };
    const result = await layoutBlocks(parseMarkdown("ab $x$ cd"), opts);
    const math = result.runs.find((r) => r.kind === "math");
    if (math?.kind !== "math") throw new Error("missing math run");
    expect(math.y).toBeGreaterThanOrEqual(0);
    expect(math.y + math.height).toBeLessThanOrEqual(result.height + 1e-9);
    const plain = await layout("abxcd", 500, 10);
    expect(result.height).toBeGreaterThan(plain.height);
    // Baseline alignment: neighboring text shares the math line's baseline.
    const text = result.runs.find((r) => r.kind === "text");
    if (text?.kind !== "text") throw new Error("missing text run");
    expect(text.y).toBeCloseTo(math.y + 12, 6);
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

  it("carries links onto runs and underlines them below the baseline", async () => {
    const result = await layout("see [docs](https://example.com)");
    const linked = result.runs.filter((r) => r.kind === "text" && r.link);
    expect(
      linked
        .map((r) => (r.kind === "text" ? r.text : ""))
        .join("")
        .trim(),
    ).toBe("docs");
    const underlines = result.decorations.filter((d) => d.kind === "underline");
    expect(underlines).toHaveLength(linked.length);
    const run = linked[0];
    const deco = underlines[0];
    if (run?.kind !== "text" || deco.kind !== "underline") throw new Error("missing run");
    expect(deco.color).toBe(run.color);
    expect(deco.y).toBeGreaterThan(run.y);
    expect(deco.width).toBeGreaterThan(0);
  });

  it("underlines every wrapped segment of a long link", async () => {
    const result = await layout("[链接测试文字链接测试文字](https://example.com)", 100, 10);
    const linked = result.runs.filter((r) => r.kind === "text" && r.link);
    const lines = new Set(linked.map((r) => (r.kind === "text" ? r.y : 0)));
    expect(lines.size).toBe(2);
    expect(result.decorations.filter((d) => d.kind === "underline")).toHaveLength(linked.length);
  });

  it("linkifies bare urls", async () => {
    const result = await layout("visit https://example.com today");
    expect(result.runs.some((r) => r.kind === "text" && r.link === "https://example.com")).toBe(
      true,
    );
    expect(result.decorations.some((d) => d.kind === "underline")).toBe(true);
  });

  it("marks struck text with a line above the baseline", async () => {
    const result = await layout("~~gone~~ kept");
    const struck = result.runs.find((r) => r.kind === "text" && r.strike);
    if (struck?.kind !== "text") throw new Error("missing struck run");
    expect(struck.text).toBe("gone");
    const line = result.decorations.find((d) => d.kind === "strikeLine");
    if (line?.kind !== "strikeLine") throw new Error("missing strike decoration");
    expect(line.y).toBeLessThan(struck.y);
    expect(line.color).toBe(struck.color);
  });

  it("sizes the line box around larger runs like headings", async () => {
    const result = await layout("# Big", 200, 10);
    const heading = result.runs.find((r) => r.kind === "text" && r.text === "Big");
    if (heading?.kind !== "text") throw new Error("missing heading run");
    // Heading is 1.6x base size: its ascent must fit above the baseline
    // inside the box, and the reported height must reach the baseline.
    expect(heading.y - heading.font.size * 1.15).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThanOrEqual(heading.y);
  });

  it("spaces wrapped heading lines by the heading's own metrics", async () => {
    const result = await layout("# aaaaaa bbbbbb cccc", 200, 10);
    const runs = result.runs.filter((r) => r.kind === "text");
    expect(runs).toHaveLength(3);
    const ys = runs.map((r) => (r.kind === "text" ? r.y : 0));
    const lineHeight = 16 * 1.5; // h1 size at base 10 is 16
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(lineHeight);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(lineHeight);
  });

  it("keeps body text clear of a preceding heading's descent", async () => {
    const result = await layout("# Big\n\nsmall", 200, 10);
    const heading = result.runs.find((r) => r.kind === "text" && r.text === "Big");
    const body = result.runs.find((r) => r.kind === "text" && r.text === "small");
    if (heading?.kind !== "text" || body?.kind !== "text") throw new Error("missing runs");
    expect(heading.y + heading.font.size * 0.35).toBeLessThanOrEqual(
      body.y - body.font.size * 1.15,
    );
    expect(result.height).toBeGreaterThanOrEqual(body.y);
  });

  it("hard-breaks words wider than the box", async () => {
    const word = "a".repeat(45);
    const result = await layout(word, 100, 10);
    const runs = result.runs.filter((r) => r.kind === "text");
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.map((r) => (r.kind === "text" ? r.text : "")).join("")).toBe(word);
    for (const run of runs) {
      if (run.kind !== "text") continue;
      expect(run.x + run.text.length * 10).toBeLessThanOrEqual(100);
    }
  });

  it("underlines every hard-broken segment of a long link", async () => {
    const result = await layout("[aaaaaaaaaaaaaaaaaaaaaaaaaaaaa](https://example.com)", 100, 10);
    const linked = result.runs.filter((r) => r.kind === "text" && r.link);
    expect(linked.length).toBeGreaterThan(1);
    expect(result.decorations.filter((d) => d.kind === "underline")).toHaveLength(linked.length);
  });

  it("measures inline and block code at the screen's 0.86 factor", async () => {
    const inline = await layout("some `code` here", 500, 10);
    const code = inline.runs.find((r) => r.kind === "text" && r.text.trim() === "code");
    if (code?.kind !== "text") throw new Error("missing code run");
    expect(code.font.code).toBe(true);
    expect(code.font.size).toBeCloseTo(8.6, 6);
    const block = await layout("```\nlet x\n```", 200, 10);
    const blockRun = block.runs.find((r) => r.kind === "text");
    if (blockRun?.kind !== "text") throw new Error("missing block code run");
    expect(blockRun.font.size).toBeCloseTo(8.6, 6);
  });

  it("wraps long code lines instead of overflowing the background", async () => {
    const code = "a".repeat(30);
    const result = await layout(`\`\`\`\n${code}\n\`\`\``, 100, 10);
    const runs = result.runs.filter((r) => r.kind === "text");
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.map((r) => (r.kind === "text" ? r.text : "")).join("")).toBe(code);
    for (const run of runs) {
      if (run.kind !== "text") continue;
      expect(run.x).toBe(8); // CODE_PADDING
      expect(run.x + run.text.length * 10).toBeLessThanOrEqual(92);
    }
    const bg = result.decorations.find((d) => d.kind === "codeBg");
    if (bg?.kind !== "codeBg") throw new Error("missing code background");
    expect(bg.width).toBe(100);
  });
});
