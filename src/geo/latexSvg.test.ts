import { describe, expect, it } from "vitest";
import { renderLatex } from "./latexSvg";

// Guards the MathJax "color" extension registration: \textcolor (emitted by
// applyMathColorSpans) must produce colored glyph groups, and \color must keep
// its LaTeX declaration semantics (rest of group), matching on-screen KaTeX.
describe("renderLatex colors", () => {
  it("colors \\textcolor content with hex fills", async () => {
    const glyph = await renderLatex(String.raw`\frac{\textcolor{#2f6fdd}{ab}c}{def}`);
    expect(glyph?.body).toContain('data-mml-node="mstyle" fill="#2f6fdd"');
  }, 30000);

  it("scopes \\color to the rest of the group", async () => {
    const body = (await renderLatex(String.raw`a\color{red}bc`))?.body ?? "";
    const aIdx = body.indexOf('data-latex="a"');
    const redIdx = body.indexOf('fill="red"');
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(redIdx).toBeGreaterThan(aIdx);
    expect(body.indexOf('data-latex="b"', redIdx)).toBeGreaterThan(redIdx);
    expect(body.indexOf('data-latex="c"', redIdx)).toBeGreaterThan(redIdx);
  }, 30000);
});

// Macros whose glyphs live outside the base font ship as separate modules
// that MathJax loads through mathjax.asyncLoad + a typeset retry; without
// that wiring these all collapse into merror boxes and renderLatex gives up.
describe("renderLatex dynamic fonts", () => {
  it.each([
    ["double-struck", String.raw`\mathbb{R}`],
    ["calligraphic", String.raw`\mathcal{F}`],
    ["script", String.raw`\mathscr{L}`],
    ["fraktur", String.raw`\mathfrak{g}`],
    ["bold", String.raw`\mathbf{x}`],
    ["sans-serif", String.raw`\mathsf{S}`],
    ["monospace", String.raw`\mathtt{code}`],
    ["accent", String.raw`\tilde{a}`],
    ["unicode literal", String.raw`½ + ℂ`],
  ])(
    "renders %s glyphs",
    async (_label, latex) => {
      expect(await renderLatex(latex)).not.toBeNull();
    },
    30000,
  );

  it("renders the reported \\color + \\mathbb combination", async () => {
    const glyph = await renderLatex(String.raw`x\in\color{red}{\mathbb{R}}`);
    expect(glyph).not.toBeNull();
    expect(glyph?.body).toContain('fill="red"');
    expect(glyph?.body).toContain('data-c="211D"');
  }, 30000);

  it("combines a {#hex|...} span with a dynamic-font macro", async () => {
    const glyph = await renderLatex(String.raw`\frac{{#2f6fdd|\mathbb{R}}}{2}`);
    expect(glyph).not.toBeNull();
    expect(glyph?.body).toContain('fill="#2f6fdd"');
    expect(glyph?.body).toContain('data-c="211D"');
  }, 30000);

  it("renders \\text with colored math inside", async () => {
    const glyph = await renderLatex(String.raw`\text{for } \color{blue}{x > 0}`);
    expect(glyph).not.toBeNull();
    expect(glyph?.body).toContain('fill="blue"');
  }, 30000);

  it("still rejects unparseable source", async () => {
    expect(await renderLatex(String.raw`\frac{1}{`)).toBeNull();
  });
});
