import { describe, expect, it } from "vitest";
import { applyMathColorSpans, findClosingBrace } from "./mathColor";

describe("findClosingBrace", () => {
  it("honors nesting and backslash escapes", () => {
    expect(findClosingBrace("a{b}c}", 0)).toBe(5);
    expect(findClosingBrace(String.raw`a\}b}`, 0)).toBe(4);
    expect(findClosingBrace("abc", 0)).toBe(-1);
  });
});

describe("applyMathColorSpans", () => {
  it("rewrites color spans as scoped \\textcolor", () => {
    expect(applyMathColorSpans(String.raw`\frac{{#2f6fdd|ab}c}{def}`)).toBe(
      String.raw`\frac{\textcolor{#2f6fdd}{ab}c}{def}`,
    );
  });

  it("handles nested braces inside the span", () => {
    expect(applyMathColorSpans(String.raw`{#2f6fdd|\frac{1}{2}}`)).toBe(
      String.raw`\textcolor{#2f6fdd}{\frac{1}{2}}`,
    );
  });

  it("does not close the span on an escaped brace", () => {
    expect(applyMathColorSpans(String.raw`{#2f6fdd|a\}b}`)).toBe(
      String.raw`\textcolor{#2f6fdd}{a\}b}`,
    );
  });

  it("rewrites nested spans recursively", () => {
    expect(applyMathColorSpans("{#ff0000|a{#00ff00|b}c}")).toBe(
      "\\textcolor{#ff0000}{a\\textcolor{#00ff00}{b}c}",
    );
  });

  it("leaves malformed or non-hex spans untouched", () => {
    expect(applyMathColorSpans("{#2f6fdd|abc")).toBe("{#2f6fdd|abc");
    expect(applyMathColorSpans("{#red|x}")).toBe("{#red|x}");
    expect(applyMathColorSpans("{#2f6fdd|}")).toBe("{#2f6fdd|}");
  });

  it("leaves an escaped opening brace untouched", () => {
    expect(applyMathColorSpans(String.raw`\{#2f6fdd|x}`)).toBe(String.raw`\{#2f6fdd|x}`);
  });
});
