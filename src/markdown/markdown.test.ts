import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./blocks";

describe("parseMarkdown", () => {
  it("parses plain paragraphs with breaks", () => {
    const blocks = parseMarkdown("hello\nworld");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "paragraph", quote: false });
    const inlines = (blocks[0] as { inlines: unknown[] }).inlines;
    expect(inlines).toEqual([
      { kind: "text", text: "hello", style: {} },
      { kind: "break" },
      { kind: "text", text: "world", style: {} },
    ]);
  });

  it("parses headings and emphasis", () => {
    const blocks = parseMarkdown("## Title\n\n**bold** *italic* ~~gone~~ `code`");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    const inlines = (blocks[1] as { inlines: { kind: string; text?: string; style: object }[] })
      .inlines;
    expect(inlines[0]).toMatchObject({ text: "bold", style: { bold: true } });
    expect(inlines[2]).toMatchObject({ text: "italic", style: { italic: true } });
    expect(inlines[4]).toMatchObject({ text: "gone", style: { strike: true } });
    expect(inlines[6]).toMatchObject({ text: "code", style: { code: true } });
  });

  it("parses inline math", () => {
    const blocks = parseMarkdown("energy $E=mc^2$ here");
    const inlines = (blocks[0] as { inlines: unknown[] }).inlines;
    expect(inlines).toContainEqual({ kind: "math", latex: "E=mc^2" });
  });

  it("parses block math single-line and multi-line", () => {
    const single = parseMarkdown("$$x^2+y^2=1$$");
    expect(single[0]).toEqual({ kind: "mathBlock", latex: "x^2+y^2=1" });
    const multi = parseMarkdown("$$\n\\int_0^1 x\\,dx\n$$");
    expect(multi[0]).toEqual({ kind: "mathBlock", latex: "\\int_0^1 x\\,dx" });
  });

  it("parses \\(...\\) as inline math", () => {
    const blocks = parseMarkdown("energy \\(E=mc^2\\) here");
    const inlines = (blocks[0] as { inlines: unknown[] }).inlines;
    expect(inlines).toContainEqual({ kind: "math", latex: "E=mc^2" });
  });

  it("parses \\[...\\] as block math, single-line and multi-line", () => {
    const single = parseMarkdown("\\[x^2+y^2=1\\]");
    expect(single[0]).toEqual({ kind: "mathBlock", latex: "x^2+y^2=1" });
    const multi = parseMarkdown("\\[\n\\int_0^1 x\\,dx\n\\]");
    expect(multi[0]).toEqual({ kind: "mathBlock", latex: "\\int_0^1 x\\,dx" });
  });

  it("does not close \\(...\\) or \\[...\\] on an escaped delimiter", () => {
    const blocks = parseMarkdown("\\(a\\\\)b\\)");
    const inlines = (blocks[0] as { inlines: unknown[] }).inlines;
    expect(inlines).toContainEqual({ kind: "math", latex: "a\\\\)b" });
    const single = parseMarkdown("\\[a\\\\]b\\]");
    expect(single[0]).toEqual({ kind: "mathBlock", latex: "a\\\\]b" });
  });

  it("does not treat an escaped \\( as math", () => {
    const blocks = parseMarkdown("literal \\\\(x\\)");
    const inlines = (blocks[0] as { inlines: { kind: string }[] }).inlines;
    expect(inlines.every((i) => i.kind !== "math")).toBe(true);
  });

  it("does not treat currency-ish dollars as math", () => {
    const blocks = parseMarkdown("price is $ 5 and $ 6 total");
    const inlines = (blocks[0] as { inlines: { kind: string }[] }).inlines;
    expect(inlines.every((i) => i.kind === "text")).toBe(true);
  });

  it("parses color spans and nests emphasis inside", () => {
    const blocks = parseMarkdown("normal {#ff0000|red **boldred**} end");
    const inlines = (blocks[0] as { inlines: { kind: string; text?: string; style: object }[] })
      .inlines;
    const red = inlines.find((i) => i.text === "red ");
    expect(red?.style).toMatchObject({ color: "#ff0000" });
    const boldRed = inlines.find((i) => i.text === "boldred");
    expect(boldRed?.style).toMatchObject({ color: "#ff0000", bold: true });
  });

  it("accepts internal image references and rejects external ones", () => {
    const blocks = parseMarkdown("![ok](image:abc-123) ![bad](https://evil.example/x.png)");
    const inlines = (blocks[0] as { inlines: unknown[] }).inlines;
    expect(inlines[0]).toEqual({ kind: "image", imageId: "abc-123", alt: "ok" });
    expect(inlines[2]).toMatchObject({ kind: "text", text: "bad" });
  });

  it("keeps only safe link protocols", () => {
    const blocks = parseMarkdown("[good](https://example.com) [bad](javascript:alert(1))");
    const inlines = (blocks[0] as { inlines: { text?: string; style: InlineStyle }[] }).inlines;
    expect(inlines[0].style.link).toBe("https://example.com");
    // markdown-it refuses to tokenize unsafe protocols, so the source stays literal text
    expect(inlines.some((i) => i.style.link?.startsWith("javascript:"))).toBe(false);
    expect(inlines.map((i) => i.text).join("")).toContain("[bad](javascript:alert(1))");
  });

  interface InlineStyle {
    link?: string;
  }

  it("escapes raw HTML instead of passing it through", () => {
    const blocks = parseMarkdown("<script>alert(1)</script>");
    const inlines = (blocks[0] as { inlines: { text?: string }[] }).inlines;
    expect(inlines[0].text).toBe("<script>alert(1)</script>");
  });

  it("parses lists with depth and ordered indexes", () => {
    const blocks = parseMarkdown("- a\n- b\n\n1. first\n2. second");
    const items = blocks.filter((b) => b.kind === "listItem");
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ ordered: false, depth: 0 });
    expect(items[2]).toMatchObject({ ordered: true, index: 1 });
    expect(items[3]).toMatchObject({ ordered: true, index: 2 });
  });

  it("parses blockquotes, code fences and rules", () => {
    const blocks = parseMarkdown("> quoted\n\n```\ncode\n```\n\n---");
    expect(blocks[0]).toMatchObject({ kind: "paragraph", quote: true });
    expect(blocks[1]).toEqual({ kind: "codeBlock", text: "code" });
    expect(blocks[2]).toEqual({ kind: "rule" });
  });
});
