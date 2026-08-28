// Paints text items onto a 2D context for bitmap export (PNG). The screen
// keeps its DOM overlay; this runs only on the export path.

import { decodeBlob, getImageBitmap } from "../engine/imageCache";
import type { LatexGlyph } from "../geo/latexSvg";
import type { TextItem } from "../model/textItem";
import { layoutTextItem } from "./layoutItem";
import { canvasFont, createTextMeasurer } from "./measure";

const QUOTE_BAR_COLOR = "rgba(128, 128, 128, 0.45)";
const CODE_BG_COLOR = "rgba(0, 0, 0, 0.06)";
const RULE_COLOR = "rgba(128, 128, 128, 0.4)";

export async function paintTextItems(
  ctx: CanvasRenderingContext2D,
  texts: TextItem[],
): Promise<void> {
  if (texts.length === 0) return;
  const measure = await createTextMeasurer();
  for (const item of texts) {
    const layout = await layoutTextItem(item, measure, naturalSize);
    ctx.save();
    ctx.translate(item.x, item.y);
    for (const deco of layout.decorations) {
      if (deco.kind === "quoteBar") {
        ctx.fillStyle = QUOTE_BAR_COLOR;
        ctx.fillRect(deco.x, deco.y, 3, deco.height);
      } else if (deco.kind === "codeBg") {
        ctx.fillStyle = CODE_BG_COLOR;
        ctx.beginPath();
        ctx.roundRect(deco.x, deco.y, deco.width, deco.height, 8);
        ctx.fill();
      } else if (deco.kind === "rule") {
        ctx.fillStyle = RULE_COLOR;
        ctx.fillRect(deco.x, deco.y - 0.75, deco.width, 1.5);
      } else {
        ctx.fillStyle = deco.color;
        ctx.fillRect(deco.x, deco.y - deco.thickness / 2, deco.width, deco.thickness);
      }
    }
    for (const run of layout.runs) {
      if (run.kind === "text") {
        ctx.font = canvasFont(run.font);
        ctx.fillStyle = run.color;
        ctx.fillText(run.text, run.x, run.y);
      } else if (run.kind === "math") {
        const bitmap = await glyphBitmap(run.glyph, run.color);
        if (bitmap) ctx.drawImage(bitmap, run.x, run.y, run.width, run.height);
      } else {
        const bitmap = getImageBitmap(run.imageId);
        if (bitmap) ctx.drawImage(bitmap, run.x, run.y, run.width, run.height);
      }
    }
    ctx.restore();
  }
}

function naturalSize(imageId: string): { width: number; height: number } | null {
  const bitmap = getImageBitmap(imageId);
  return bitmap ? { width: bitmap.naturalWidth, height: bitmap.naturalHeight } : null;
}

const glyphBitmaps = new Map<string, Promise<HTMLImageElement | null>>();

// MathJax glyph runs are SVG paths; rasterize once per glyph+color via the
// same blob decoder the image cache uses.
function glyphBitmap(glyph: LatexGlyph, color: string): Promise<HTMLImageElement | null> {
  const [vx, vy, vw, vh] = glyph.viewBox;
  const key = `${color}|${glyph.body}`;
  let task = glyphBitmaps.get(key);
  if (!task) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" ` +
      `width="${vw / 2}" height="${vh / 2}" color="${color}">${glyph.body}</svg>`;
    task = decodeBlob(new Blob([svg], { type: "image/svg+xml" })).catch(() => null);
    glyphBitmaps.set(key, task);
  }
  return task;
}
