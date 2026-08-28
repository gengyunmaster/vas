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
