// @vitest-environment jsdom
// Regression: a formula containing "<" (or quotes/ampersands) round-trips
// through MathJax with its TeX source mirrored into data-latex attributes.
// HTML serialization leaves "<" raw there, which is malformed XML and used to
// break every export backend at once (SVG unparseable, PNG blob decode
// failing, svg2pdf dropping the glyphs in PDF).
import { describe, expect, it } from "vitest";
import { renderLatex } from "../geo/latexSvg";
import { parseMarkdown } from "../markdown/blocks";
import { layoutBlocks } from "./layout";
import { textItemToSvg } from "./textToSvg";

const SOURCE = String.raw`{#f2b134|*特别提醒*} 函数 $y=a^x$ 和 $y=\log_a x$ 的交点个数**与 $a$ 的取值有关**。当
\[{\color{red}0}<{\color{yellow}a}<{\color{green}\mathrm{e}^{-\mathrm{e}}\approx0.066}\]
时，{#2f6fdd|共有 $3$ 个交点}。`;

async function exportSvg(source: string): Promise<{ svg: string; mathRuns: number }> {
  const layout = await layoutBlocks(parseMarkdown(source), {
    width: 400,
    fontSize: 20,
    color: "#1a1a1a",
    measure: (text, font) => text.length * font.size * 0.5,
    resolveMath: renderLatex,
    resolveImageSize: () => null,
  });
  const parts = textItemToSvg(
    { id: "t", x: 0, y: 0, width: 400, fontSize: 20, color: "#1a1a1a", markdown: source },
    layout,
    new Map(),
  );
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`,
    mathRuns: layout.runs.filter((run) => run.kind === "math").length,
  };
}

describe("textItemToSvg whitespace", () => {
  it("preserves leading spaces glued onto wrapped-line atoms", () => {
    const parts = textItemToSvg(
      { id: "t", x: 0, y: 0, width: 400, fontSize: 20, color: "#1a1a1a", markdown: "" },
      {
        runs: [
          {
            kind: "text",
            x: 42,
            y: 23,
            text: " 数",
            font: { size: 20, bold: false, italic: false, code: false },
            color: "#1a1a1a",
          },
        ],
        decorations: [],
        height: 40,
      },
      new Map(),
    );
    const svg = parts.join("");
    expect(svg).toContain('xml:space="preserve"');
    expect(svg).toContain("> 数</text>");
  });
});

describe("textItemToSvg with math", () => {
  it("keeps every formula as a glyph run and emits well-formed XML", async () => {
    const { svg, mathRuns } = await exportSvg(SOURCE);
    expect(mathRuns).toBe(5);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  }, 30000);

  it("escapes special characters inside data-latex attributes", async () => {
    const { svg } = await exportSvg(SOURCE);
    expect(svg).not.toMatch(/data-latex="[^"]*</);
    expect(svg).toContain("data-latex=");
  }, 30000);
});
