import type { PDFDocument, PDFImage, PDFPage, RGB } from "pdf-lib";
import { getOutlinePoints, HIGHLIGHTER_ALPHA } from "../engine/renderStroke";
import { hexToRgb, isDarkColor } from "../model/color";
import type { ImageItem } from "../model/image";
import type { PagePattern } from "../model/page";
import { PAGE_HEIGHT, PAGE_WIDTH, type Page, trimTrailingBlankPages } from "../model/page";
import { PATTERN_DASH, patternLayout } from "../model/patternLayout";
import { arrowHead } from "../model/shapeGeometry";
import type { Stroke } from "../model/stroke";
import { getImage } from "./images";
import { rasterizeToPng } from "./rasterize";
import { outlineToSvgPath } from "./svgPath";
import { downloadBlob } from "./transfer";

const PT_PER_UNIT = 72 / 96;

export async function exportNotebookPdf(title: string, pages: Page[]): Promise<void> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const width = PAGE_WIDTH * PT_PER_UNIT;
  const height = PAGE_HEIGHT * PT_PER_UNIT;
  const embedded = new Map<string, PDFImage | null>();

  for (const page of trimTrailingBlankPages(pages)) {
    const pdfPage = doc.addPage([width, height]);
    pdfPage.drawRectangle({ x: 0, y: 0, width, height, color: toPdfRgb(page.paperColor, rgb) });
    drawPattern(pdfPage, page.pattern, page.paperColor, rgb);
    for (const image of page.images) {
      await drawPdfImage(doc, pdfPage, image, embedded);
    }
    for (const stroke of page.strokes) {
      if (stroke.shape) {
        drawPdfShape(pdfPage, stroke, rgb);
        continue;
      }
      const outline = getOutlinePoints(stroke, true);
      if (outline.length < 3) continue;
      pdfPage.drawSvgPath(outlineToSvgPath(outline, PT_PER_UNIT), {
        y: height,
        color: toPdfRgb(stroke.color, rgb),
        opacity: stroke.pen === "highlighter" ? HIGHLIGHTER_ALPHA : 1,
      });
    }
  }

  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
    `${title}.pdf`,
  );
}

async function drawPdfImage(
  doc: PDFDocument,
  pdfPage: PDFPage,
  image: ImageItem,
  embedded: Map<string, PDFImage | null>,
): Promise<void> {
  let pdfImage = embedded.get(image.imageId);
  if (pdfImage === undefined) {
    pdfImage = await embedImage(doc, image.imageId);
    embedded.set(image.imageId, pdfImage);
  }
  if (!pdfImage) return;
  pdfPage.drawImage(pdfImage, {
    x: image.x * PT_PER_UNIT,
    y: toY(image.y + image.height),
    width: image.width * PT_PER_UNIT,
    height: image.height * PT_PER_UNIT,
  });
}

async function embedImage(doc: PDFDocument, imageId: string): Promise<PDFImage | null> {
  try {
    const record = await getImage(imageId);
    if (!record) return null;
    const bytes = await record.blob.arrayBuffer();
    if (record.mimeType === "image/jpeg") return await doc.embedJpg(bytes);
    if (record.mimeType === "image/png") return await doc.embedPng(bytes);
    const png = await rasterizeToPng(record.blob);
    return png ? await doc.embedPng(png) : null;
  } catch {
    return null;
  }
}

function toPdfRgb(hex: string, rgb: (r: number, g: number, b: number) => RGB): RGB {
  const parsed = hexToRgb(hex);
  return parsed ? rgb(parsed.r, parsed.g, parsed.b) : rgb(0, 0, 0);
}

function toY(y: number): number {
  return (PAGE_HEIGHT - y) * PT_PER_UNIT;
}

function drawPdfShape(
  pdfPage: PDFPage,
  stroke: Stroke,
  rgb: (r: number, g: number, b: number) => RGB,
): void {
  const [a, b] = stroke.points;
  if (!stroke.shape || !a || !b) return;
  const color = toPdfRgb(stroke.color, rgb);
  const thickness = stroke.size * PT_PER_UNIT;
  switch (stroke.shape) {
    case "line":
      pdfPage.drawLine({
        start: { x: a.x * PT_PER_UNIT, y: toY(a.y) },
        end: { x: b.x * PT_PER_UNIT, y: toY(b.y) },
        thickness,
        color,
      });
      break;
    case "arrow": {
      const [left, right] = arrowHead(a, b, stroke.size);
      for (const point of [b, left, right]) {
        const from = point === b ? a : b;
        pdfPage.drawLine({
          start: { x: from.x * PT_PER_UNIT, y: toY(from.y) },
          end: { x: point.x * PT_PER_UNIT, y: toY(point.y) },
          thickness,
          color,
        });
      }
      break;
    }
    case "rect":
      pdfPage.drawRectangle({
        x: Math.min(a.x, b.x) * PT_PER_UNIT,
        y: toY(Math.max(a.y, b.y)),
        width: Math.abs(b.x - a.x) * PT_PER_UNIT,
        height: Math.abs(b.y - a.y) * PT_PER_UNIT,
        borderColor: color,
        borderWidth: thickness,
      });
      break;
    case "ellipse":
      pdfPage.drawEllipse({
        x: ((a.x + b.x) / 2) * PT_PER_UNIT,
        y: toY((a.y + b.y) / 2),
        xScale: (Math.abs(b.x - a.x) / 2) * PT_PER_UNIT,
        yScale: (Math.abs(b.y - a.y) / 2) * PT_PER_UNIT,
        borderColor: color,
        borderWidth: thickness,
      });
      break;
  }
}

function drawPattern(
  pdfPage: PDFPage,
  pattern: PagePattern,
  paperColor: string,
  rgb: (r: number, g: number, b: number) => RGB,
): void {
  if (pattern === "blank") return;
  const { lines, dots } = patternLayout(pattern);
  const dark = isDarkColor(paperColor);
  const color = dark ? rgb(1, 1, 1) : rgb(0, 0, 0);
  const opacity = dark ? 0.22 : 0.16;
  for (const line of lines) {
    pdfPage.drawLine({
      start: { x: line.x1 * PT_PER_UNIT, y: toY(line.y1) },
      end: { x: line.x2 * PT_PER_UNIT, y: toY(line.y2) },
      thickness: 0.75,
      color,
      opacity,
      ...(line.dashed ? { dashArray: PATTERN_DASH.map((v) => v * PT_PER_UNIT) } : {}),
    });
  }
  for (const dot of dots) {
    pdfPage.drawCircle({
      x: dot.x * PT_PER_UNIT,
      y: toY(dot.y),
      size: 0.9,
      color,
      opacity,
    });
  }
}
