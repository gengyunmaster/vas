// pdf-lib text layer for PDF export. svg2pdf.js drops SVG <text>, so text
// runs are drawn natively with embedded subset Noto fonts (real, selectable
// vector text); math glyphs and text-embedded images ride the annotation SVG
// layer instead (see pageToSvg textMode "pathsOnly"). Code runs are drawn
// with Noto Sans Mono for printable ASCII and fall back per chunk to Noto
// Sans SC, mirroring the canvas measurer's per-glyph font fallback.
import type fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { ensureImageLoaded } from "../engine/imageCache";
import { hexToRgb } from "../model/color";
import { type TextItem, textImageRefs } from "../model/textItem";
import type { TextLayout } from "../text/layout";
import { layoutTextItem, naturalImageSize } from "../text/layoutItem";
import { createTextMeasurer } from "../text/measure";

type PdfLib = typeof import("pdf-lib");

const PT_PER_UNIT = 72 / 96;
// Faux-italic shear. PDF's y axis points up, so the sign is opposite to the
// canvas convention: a positive shear leans the top of the glyphs right.
const ITALIC_SHEAR = 0.25;

export interface PdfTextFonts {
  font(bold: boolean): Promise<PDFFont>;
  mono(): Promise<PDFFont>;
}

interface FontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  mono: Uint8Array;
}

let fontBytes: Promise<FontBytes> | null = null;

function loadFontBytes(): Promise<FontBytes> {
  fontBytes ??= (async () => {
    const base = import.meta.env.BASE_URL;
    const [regular, bold, mono] = await Promise.all([
      fetch(`${base}fonts/noto-sans-sc-regular.ttf`),
      fetch(`${base}fonts/noto-sans-sc-bold.ttf`),
      fetch(`${base}fonts/noto-sans-mono-regular.ttf`),
    ]);
    if (!regular.ok || !bold.ok || !mono.ok) throw new Error("Failed to load text fonts");
    return {
      regular: new Uint8Array(await regular.arrayBuffer()),
      bold: new Uint8Array(await bold.arrayBuffer()),
      mono: new Uint8Array(await mono.arrayBuffer()),
    };
  })();
  return fontBytes;
}

export function createPdfTextFonts(doc: PDFDocument, fontkitModule: typeof fontkit): PdfTextFonts {
  doc.registerFontkit(fontkitModule);
  const cache = new Map<string, Promise<PDFFont>>();
  const embed = (key: string, pick: (bytes: FontBytes) => Uint8Array) => {
    let pending = cache.get(key);
    if (!pending) {
      pending = (async () => {
        const bytes = await loadFontBytes();
        // pdf-lib's re-subsetting (`subset: true`) breaks glyph mapping for
        // these fonts (most glyphs render blank); embed them whole instead —
        // they are already subsets. Shaping must stay off: fontkit's locl
        // turns digits into alternate glyphs and liga merges fi/fl, and
        // pdf-lib only maps cmap-reachable glyphs back to Unicode, so
        // substituted glyphs extract as nothing and land at the wrong width.
        return doc.embedFont(pick(bytes), {
          features: { liga: false, locl: false },
        });
      })();
      cache.set(key, pending);
    }
    return pending;
  };
  return {
    // Lazy per weight so documents without bold text skip the bold font.
    font: (bold) =>
      embed(bold ? "bold" : "regular", (bytes) => (bold ? bytes.bold : bytes.regular)),
    mono: () => embed("mono", (bytes) => bytes.mono),
  };
}

// Characters outside the subset charset cannot be encoded; swap them for a
// full-width question mark instead of failing the whole export.
function encodable(font: PDFFont, text: string): string {
  let out = "";
  let changed = false;
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "？";
      changed = true;
    }
  }
  return changed ? out : text;
}

// The mono subset covers printable ASCII only; a code run's remaining
// characters (CJK etc.) draw with the proportional font, mirroring the canvas
// measurer's per-glyph fallback through the code font stack.
export function splitCodeChunks(text: string): { text: string; mono: boolean }[] {
  const chunks: { text: string; mono: boolean }[] = [];
  let current = "";
  let currentMono = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const mono = cp >= 0x20 && cp <= 0x7e;
    if (current && mono !== currentMono) {
      chunks.push({ text: current, mono: currentMono });
      current = "";
    }
    currentMono = mono;
    current += ch;
  }
  if (current) chunks.push({ text: current, mono: currentMono });
  return chunks;
}

export interface PdfTextView {
  // Page-unit origin of the exported view (0,0 for a full page; bounds.min for
  // a selection crop).
  offsetX: number;
  offsetY: number;
  // View height in page units, needed for the y-down → y-up flip.
  heightUnits: number;
  // Selects the light/dark code-highlight palette; selection crops are white.
  darkPaper?: boolean;
}

export async function drawPdfTextItems(
  pdflib: PdfLib,
  pdfPage: PDFPage,
  texts: TextItem[],
  fonts: PdfTextFonts,
  view: PdfTextView,
): Promise<void> {
  if (texts.length === 0) return;
  const imageIds = new Set<string>();
  for (const item of texts) for (const id of textImageRefs(item.markdown)) imageIds.add(id);
  await Promise.all([...imageIds].map((id) => ensureImageLoaded(id)));
  const measure = await createTextMeasurer();
  for (const item of texts) {
    const layout = await layoutTextItem(item, measure, naturalImageSize, view.darkPaper ?? false);
    drawDecorations(pdflib, pdfPage, item, layout, view);
    for (const run of layout.runs) {
      if (run.kind !== "text") continue;
      const size = run.font.size * PT_PER_UNIT;
      const x = (item.x + run.x - view.offsetX) * PT_PER_UNIT;
      const y = (view.heightUnits - (item.y + run.y - view.offsetY)) * PT_PER_UNIT;
      const color = hexToRgb(run.color);
      const rgb = color ? pdflib.rgb(color.r, color.g, color.b) : pdflib.rgb(0, 0, 0);
      let pieces: { text: string; font: PDFFont }[];
      if (run.font.code) {
        // Bold code still draws with the mono regular font (there is no mono
        // bold subset); fallback chunks honor bold through Noto Sans SC.
        const mono = await fonts.mono();
        const fallback = await fonts.font(run.font.bold);
        pieces = splitCodeChunks(run.text).map((chunk) =>
          chunk.mono
            ? { text: chunk.text, font: mono }
            : { text: encodable(fallback, chunk.text), font: fallback },
        );
      } else {
        const font = await fonts.font(run.font.bold);
        pieces = [{ text: encodable(font, run.text), font }];
      }
      let cursor = x;
      for (const piece of pieces) {
        if (!piece.text) continue;
        if (run.font.italic) {
          pdfPage.pushOperators(
            pdflib.pushGraphicsState(),
            pdflib.concatTransformationMatrix(1, 0, ITALIC_SHEAR, 1, cursor, y),
          );
          pdfPage.drawText(piece.text, { x: 0, y: 0, size, font: piece.font, color: rgb });
          pdfPage.pushOperators(pdflib.popGraphicsState());
        } else {
          pdfPage.drawText(piece.text, { x: cursor, y, size, font: piece.font, color: rgb });
        }
        cursor += piece.font.widthOfTextAtSize(piece.text, size);
      }
      if (run.link && cursor > x) {
        addLinkAnnotation(pdflib, pdfPage, run.link, x, y, cursor - x, size);
      }
    }
  }
}

function drawDecorations(
  pdflib: PdfLib,
  pdfPage: PDFPage,
  item: TextItem,
  layout: TextLayout,
  view: PdfTextView,
): void {
  for (const deco of layout.decorations) {
    const x = (item.x + deco.x - view.offsetX) * PT_PER_UNIT;
    if (deco.kind === "rule") {
      const y = (view.heightUnits - (item.y + deco.y - view.offsetY)) * PT_PER_UNIT;
      pdfPage.drawRectangle({
        x,
        y: y - 1.5 * PT_PER_UNIT * 0.5,
        width: deco.width * PT_PER_UNIT,
        height: 1.5 * PT_PER_UNIT,
        color: pdflib.rgb(0.5, 0.5, 0.5),
        opacity: 0.4,
      });
      continue;
    }
    if (deco.kind === "underline" || deco.kind === "strikeLine") {
      const y = (view.heightUnits - (item.y + deco.y - view.offsetY)) * PT_PER_UNIT;
      const ink = hexToRgb(deco.color);
      pdfPage.drawRectangle({
        x,
        y: y - (deco.thickness / 2) * PT_PER_UNIT,
        width: deco.width * PT_PER_UNIT,
        height: deco.thickness * PT_PER_UNIT,
        color: ink ? pdflib.rgb(ink.r, ink.g, ink.b) : pdflib.rgb(0, 0, 0),
      });
      continue;
    }
    const y = (view.heightUnits - (item.y + deco.y + deco.height - view.offsetY)) * PT_PER_UNIT;
    if (deco.kind === "quoteBar") {
      pdfPage.drawRectangle({
        x,
        y,
        width: 3 * PT_PER_UNIT,
        height: deco.height * PT_PER_UNIT,
        color: pdflib.rgb(0.5, 0.5, 0.5),
        opacity: 0.45,
      });
    } else {
      pdfPage.drawRectangle({
        x,
        y,
        width: deco.width * PT_PER_UNIT,
        height: deco.height * PT_PER_UNIT,
        color: pdflib.rgb(0, 0, 0),
        opacity: 0.06,
      });
    }
  }
}

// A real Link annotation per run segment: without one, clickability depends
// on the reader's own URL auto-detection heuristic.
function addLinkAnnotation(
  pdflib: PdfLib,
  pdfPage: PDFPage,
  url: string,
  x: number,
  baseline: number,
  width: number,
  size: number,
): void {
  const annot = pdfPage.doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, baseline - size * 0.35, x + width, baseline + size],
    Border: [0, 0, 0],
    // URIs in actions must be ASCII; encodeURI percent-encodes the rest.
    A: { Type: "Action", S: "URI", URI: pdflib.PDFString.of(encodeURI(url)) },
  });
  pdfPage.node.addAnnot(pdfPage.doc.context.register(annot));
}
