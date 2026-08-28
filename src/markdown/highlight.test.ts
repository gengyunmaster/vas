import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ensureHighlight,
  highlightCode,
  highlightCodeSegments,
  highlightReady,
  parseHighlightedHtml,
} from "./highlight";

const PALETTE: Record<string, string> = {
  keyword: "#111111",
  string: "#222222",
  comment: "#333333",
  title: "#444444",
};

beforeAll(async () => {
  await ensureHighlight();
});

describe("parseHighlightedHtml", () => {
  it("passes plain text through as a colorless segment", () => {
    expect(parseHighlightedHtml("let x = 1;", PALETTE)).toEqual([{ text: "let x = 1;" }]);
  });

  it("decodes named and numeric entities", () => {
    expect(parseHighlightedHtml("&amp; &lt; &gt; &quot; &#x27; &#39; &#x2F;", PALETTE)).toEqual([
      { text: "& < > \" ' ' /" },
    ]);
  });

  it("leaves unknown entities literal", () => {
    expect(parseHighlightedHtml("a &bogus; b &", PALETTE)).toEqual([{ text: "a &bogus; b &" }]);
  });

  it("colors spans with a mapped class", () => {
    expect(parseHighlightedHtml('<span class="hljs-keyword">let</span> x', PALETTE)).toEqual([
      { text: "let", color: "#111111" },
      { text: " x" },
    ]);
  });

  it("maps multi-class spans via their first mapped class", () => {
    expect(parseHighlightedHtml('<span class="hljs-title function_">f</span>', PALETTE)).toEqual([
      { text: "f", color: "#444444" },
    ]);
  });

  it("lets a mapped inner span win and restores the outer color after it", () => {
    const html = '<span class="hljs-string">"x<span class="hljs-keyword">y</span>z"</span> end';
    expect(parseHighlightedHtml(html, PALETTE)).toEqual([
      { text: '"x', color: "#222222" },
      { text: "y", color: "#111111" },
      { text: 'z"', color: "#222222" },
      { text: " end" },
    ]);
  });

  it("inherits the outer color for unmapped inner classes", () => {
    const html = '<span class="hljs-comment">a<span class="hljs-punctuation">(</span>b</span>';
    expect(parseHighlightedHtml(html, PALETTE)).toEqual([{ text: "a(b", color: "#333333" }]);
  });

  it("keeps unmapped spans colorless", () => {
    expect(parseHighlightedHtml('<span class="hljs-params">a</span>', PALETTE)).toEqual([
      { text: "a" },
    ]);
  });

  it("merges adjacent segments sharing a color", () => {
    const html = '<span class="hljs-keyword">a</span><span class="hljs-keyword">b</span>c';
    expect(parseHighlightedHtml(html, PALETTE)).toEqual([
      { text: "ab", color: "#111111" },
      { text: "c" },
    ]);
  });

  it("recovers from malformed span markup as literal text", () => {
    expect(parseHighlightedHtml('a <span class="hljs-keyword"', PALETTE)).toEqual([
      { text: 'a <span class="hljs-keyword"' },
    ]);
  });
});

describe("highlightCode", () => {
  it("reports readiness and returns null for unknown languages", () => {
    expect(highlightReady()).toBe(true);
    expect(highlightCode("MOVE 1 TO X", "cobol", false)).toBeNull();
  });

  it("highlights keywords with the light and dark palettes", () => {
    expect(highlightCode("let x", "js", false)).toEqual([
      { text: "let", color: "#a626a4" },
      { text: " x" },
    ]);
    expect(highlightCode("let x", "js", true)).toEqual([
      { text: "let", color: "#c678dd" },
      { text: " x" },
    ]);
  });

  it("decodes entities produced by hljs", () => {
    expect(highlightCode('a < b && "s"', "js", false)).toEqual([
      { text: "a < b && " },
      { text: '"s"', color: "#50a14f" },
    ]);
  });
});

describe("highlightCodeSegments", () => {
  it("returns segments unchanged without a language", () => {
    const segments = [{ text: "let x" }];
    expect(highlightCodeSegments(segments, undefined, false)).toBe(segments);
  });

  it("highlights colorless segments and keeps manual colors", () => {
    const result = highlightCodeSegments(
      [{ text: "let " }, { text: "x", color: "#123456" }],
      "js",
      false,
    );
    expect(result).toEqual([
      { text: "let", color: "#a626a4" },
      { text: " " },
      { text: "x", color: "#123456" },
    ]);
  });

  it("falls back to the original segment when highlighting yields nothing", () => {
    expect(highlightCodeSegments([{ text: "" }], "js", false)).toEqual([{ text: "" }]);
  });
});

describe("ensureHighlight loading state", () => {
  it("starts unloaded in a fresh module instance", async () => {
    vi.resetModules();
    const fresh = await import("./highlight");
    expect(fresh.highlightReady()).toBe(false);
    expect(fresh.highlightCode("let", "js", false)).toBeNull();
  });
});
