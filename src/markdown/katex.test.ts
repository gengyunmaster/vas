import { describe, expect, it } from "vitest";
import { ensureKatex, renderMathHtml } from "./katex";

describe("renderMathHtml", () => {
  it("rewrites {#hex|...} spans inside math for KaTeX", async () => {
    await ensureKatex();
    const html = renderMathHtml(String.raw`\frac{{#2f6fdd|ab}c}{def}`, false);
    expect(html).toContain("#2f6fdd");
  }, 30000);
});
