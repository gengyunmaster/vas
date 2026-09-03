// Real-font coverage for the PDF text layer: the shipped subset files are
// inlined as data URIs and served through a stubbed fetch, so embedding runs
// against the exact bytes browsers get.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import monoTtf from "../../public/fonts/noto-sans-mono-regular.ttf?inline";
import boldTtf from "../../public/fonts/noto-sans-sc-bold.ttf?inline";
import regularTtf from "../../public/fonts/noto-sans-sc-regular.ttf?inline";
import { createPdfTextFonts, splitCodeChunks } from "./pdfTextLayer";

const decode = (dataUri: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(",") + 1)), (c) => c.charCodeAt(0));

const FONT_BYTES: Record<string, Uint8Array<ArrayBuffer>> = {
  "noto-sans-sc-regular.ttf": decode(regularTtf),
  "noto-sans-sc-bold.ttf": decode(boldTtf),
  "noto-sans-mono-regular.ttf": decode(monoTtf),
};

vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
  const data = FONT_BYTES[String(input).split("/").pop() ?? ""];
  return data ? new Response(data) : new Response(null, { status: 404 });
});

describe("splitCodeChunks", () => {
  it("splits printable ASCII from fallback characters", () => {
    expect(splitCodeChunks("let x变量 = 1;")).toEqual([
      { text: "let x", mono: true },
      { text: "变量", mono: false },
      { text: " = 1;", mono: true },
    ]);
    expect(splitCodeChunks("变量")).toEqual([{ text: "变量", mono: false }]);
    expect(splitCodeChunks("ascii")).toEqual([{ text: "ascii", mono: true }]);
    expect(splitCodeChunks("")).toEqual([]);
  });

  it("keeps non-ASCII symbols in fallback chunks", () => {
    expect(splitCodeChunks("a→b")).toEqual([
      { text: "a", mono: true },
      { text: "→", mono: false },
      { text: "b", mono: true },
    ]);
  });
});

describe("createPdfTextFonts", () => {
  it("embeds the mono subset and measures it as monospaced", async () => {
    const doc = await PDFDocument.create();
    const fonts = createPdfTextFonts(doc, fontkit);
    const mono = await fonts.mono();
    expect(await fonts.mono()).toBe(mono);
    expect(mono.widthOfTextAtSize("iii", 12)).toBeCloseTo(mono.widthOfTextAtSize("WWW", 12), 6);
    expect(mono.widthOfTextAtSize("iii", 12)).toBeCloseTo(3 * mono.widthOfTextAtSize("i", 12), 6);
    // The subset holds printable ASCII only (plus the subsetter's U+FFFF
    // sentinel); everything else must go to the fallback chunks.
    expect(mono.getCharacterSet().every((cp) => (cp >= 0x20 && cp <= 0x7e) || cp === 0xffff)).toBe(
      true,
    );
  });

  it("embeds regular and bold Noto Sans SC lazily", async () => {
    const doc = await PDFDocument.create();
    const fonts = createPdfTextFonts(doc, fontkit);
    const regular = await fonts.font(false);
    const bold = await fonts.font(true);
    expect(regular).not.toBe(bold);
    regular.encodeText("变量abc");
    bold.encodeText("变量abc");
  });
});
