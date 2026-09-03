import { expect, test, vi } from "vitest";
import { renderLatex } from "../latexSvg";
import { placeGlyph } from "../ui/export";

test("renderLatex typesets inline math as a single vector glyph run", async () => {
  const glyph = await renderLatex("y = x^2");
  expect(glyph).not.toBeNull();
  const [vx, vy, vw, vh] = glyph?.viewBox ?? [];
  expect(vx).toBe(0);
  expect(vy).toBeLessThan(0);
  expect(vw).toBeGreaterThan(1000);
  expect(vh).toBeGreaterThan(500);
  expect(glyph?.body).toContain("<path");
  expect(glyph?.body).not.toContain("<svg");
  expect(glyph?.body).not.toContain("foreignObject");
  expect(glyph?.body).toContain('fill="currentColor"');
});

test("renderLatex caches results per source string", async () => {
  const a = await renderLatex("v_{1} = 42");
  const b = await renderLatex("v_{1} = 42");
  expect(a).toBe(b);
});

test("renderLatex returns null for unparseable input", async () => {
  expect(await renderLatex("\\frac{1")).toBeNull();
});

test("renderLatex retries after a transient MathJax load failure", async () => {
  vi.resetModules();
  vi.doMock("@mathjax/src/js/mathjax.js", () => {
    throw new Error("chunk failed");
  });
  const failed = await import("../latexSvg");
  expect(await failed.renderLatex("x_retry")).toBeNull();
  vi.doUnmock("@mathjax/src/js/mathjax.js");
  vi.resetModules();
  const fresh = await import("../latexSvg");
  expect(await fresh.renderLatex("x_retry")).not.toBeNull();
}, 30000);

test("placeGlyph centers the scaled glyph run on the label footprint", () => {
  const glyph = {
    body: "<g/>",
    viewBox: [0, -500, 1000, 1000] as [number, number, number, number],
  };
  const markup = placeGlyph(glyph, {
    latex: "x",
    x: 100,
    y: 50,
    width: 20,
    height: 20,
    color: "rgb(1, 2, 3)",
    fontSize: 14,
  });
  expect(markup).toContain('color="rgb(1, 2, 3)"');
  expect(markup).toContain("scale(0.02)");
  // scale = 20/1000 = 0.02; center maps viewBox center (500, 0) to (110, 60)
  expect(markup).toContain("translate(100 60)");
  expect(markup).toContain("<g/>");
});

test("placeGlyph skips degenerate glyph boxes", () => {
  const glyph = { body: "<g/>", viewBox: [0, 0, 0, 0] as [number, number, number, number] };
  expect(
    placeGlyph(glyph, {
      latex: "x",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: "#000",
      fontSize: 14,
    }),
  ).toBe("");
});
