// pdf-lib text layer for PDF export. svg2pdf.js drops SVG <text>, so text
// runs are drawn natively with embedded subset Noto Sans SC (real, selectable
// vector text); math glyphs and text-embedded images ride the annotation SVG
// layer instead (see pageToSvg textMode "pathsOnly").
import type fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { ensureImageLoaded, getImageBitmap } from "../engine/imageCache";
import { hexToRgb } from "../model/color";
import { type TextItem, textImageRefs } from "../model/textItem";
import type { TextLayout } from "../text/layout";
import { layoutTextItem } from "../text/layoutItem";
import { createTextMeasurer } from "../text/measure";

type PdfLib = typeof import("pdf-lib");

const PT_PER_UNIT = 72 / 96;
// Faux-italic shear. PDF's y axis points up, so the sign is opposite to the
// canvas convention: a positive shear leans the top of the glyphs right.
const ITALIC_SHEAR = 0.25;

export interface PdfTextFonts {
  font(bold: boolean): Promise<PDFFont>;
}

let fontBytes: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

function loadFontBytes(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  fontBytes ??= (async () => {
    const base = import.meta.env.BASE_URL;
    const [regular, bold] = await Promise.all([
      fetch(`${base}fonts/noto-sans-sc-regular.ttf`),
      fetch(`${base}fonts/noto-sans-sc-bold.ttf`),
    ]);
    if (!regular.ok || !bold.ok) throw new Error("Failed to load text fonts");
    return {
      regular: new Uint8Array(await regular.arrayBuffer()),
      bold: new Uint8Array(await bold.arrayBuffer()),
    };
  })();
  return fontBytes;
}

export function createPdfTextFonts(doc: PDFDocument, fontkitModule: typeof fontkit): PdfTextFonts {
  doc.registerFontkit(fontkitModule);
  const cache = new Map<boolean, Promise<PDFFont>>();
  return {
    // Lazy per weight so documents without bold text skip the bold font.
    font(bold) {
      let pending = cache.get(bold);
      if (!pending) {
        pending = (async () => {
          const bytes = await loadFontBytes();
          // pdf-lib's re-subsetting (`subset: true`) breaks glyph mapping for
          // these fonts (most glyphs render blank); embed them whole instead —
          // they are already GB2312 subsets.
          return doc.embedFont(bold ? bytes.bold : bytes.regular);
        })();
        cache.set(bold, pending);
      }
      return pending;
    },
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

export interface PdfTextView {
  // Page-unit origin of the exported view (0,0 for a full page; bounds.min for
  // a selection crop).
  offsetX: number;
  offsetY: number;
  // View height in page units, needed for the y-down → y-up flip.
  heightUnits: number;
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
    const layout = await layoutTextItem(item, measure, naturalSize);
    drawDecorations(pdflib, pdfPage, item, layout, view);
    for (const run of layout.runs) {
      if (run.kind !== "text") continue;
      const font = await fonts.font(run.font.bold);
      const size = run.font.size * PT_PER_UNIT;
      const x = (item.x + run.x - view.offsetX) * PT_PER_UNIT;
      const y = (view.heightUnits - (item.y + run.y - view.offsetY)) * PT_PER_UNIT;
      const color = hexToRgb(run.color);
      const rgb = color ? pdflib.rgb(color.r, color.g, color.b) : pdflib.rgb(0, 0, 0);
      const text = encodable(font, run.text);
      if (!text) continue;
      if (run.font.italic) {
        pdfPage.pushOperators(
          pdflib.pushGraphicsState(),
          pdflib.concatTransformationMatrix(1, 0, ITALIC_SHEAR, 1, x, y),
        );
        pdfPage.drawText(text, { x: 0, y: 0, size, font, color: rgb });
        pdfPage.pushOperators(pdflib.popGraphicsState());
      } else {
        pdfPage.drawText(text, { x, y, size, font, color: rgb });
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

function naturalSize(imageId: string): { width: number; height: number } | null {
  const bitmap = getImageBitmap(imageId);
  return bitmap ? { width: bitmap.naturalWidth, height: bitmap.naturalHeight } : null;
}
