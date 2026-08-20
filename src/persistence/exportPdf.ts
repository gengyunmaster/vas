import type { PDFDocument, PDFEmbeddedPage, PDFPage, RGB } from "pdf-lib";
import { hexToRgb, isDarkColor } from "../model/color";
import type { ImageItem } from "../model/image";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type Page,
  type PagePattern,
  type PdfSource,
  trimTrailingBlankPages,
} from "../model/page";
import { PATTERN_DASH, patternLayout } from "../model/patternLayout";
import type { Stroke } from "../model/stroke";
import { elementsBounds } from "../model/transform";
import { pageToSvg } from "./exportSvg";
import { collectImageDataUris } from "./imageDataUri";
import { getImage } from "./images";
import { getPdf } from "./pdfs";
import { rasterizeToPng } from "./rasterize";
import { downloadBlob } from "./transfer";

const PT_PER_UNIT = 72 / 96;

type PdfLib = typeof import("pdf-lib");

export function pdfOrientation(width: number, height: number): "portrait" | "landscape" {
  return width > height ? "landscape" : "portrait";
}

export async function exportSelectionPdf(
  title: string,
  page: Page,
  strokes: Stroke[],
  images: ImageItem[],
): Promise<void> {
  const bounds = elementsBounds(strokes, images);
  if (!bounds) return;
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const width = (bounds.maxX - bounds.minX) * PT_PER_UNIT;
  const height = (bounds.maxY - bounds.minY) * PT_PER_UNIT;
  const imageData = await collectImageDataUris(
    images.map((image) => image.imageId),
    true,
  );
  // jsPDF swaps a wider-than-tall format array in portrait mode; state the orientation explicitly
  const doc = new jsPDF({
    unit: "pt",
    format: [width, height],
    orientation: pdfOrientation(width, height),
  });
  doc.setDocumentProperties({ title });
  const svg = new DOMParser().parseFromString(
    pageToSvg({ ...page, strokes, images }, imageData, { annotationOnly: true, clipTo: bounds }),
    "image/svg+xml",
  ).documentElement;
  await svg2pdf(svg, doc, { x: 0, y: 0, width, height });
  downloadBlob(
    new Blob([doc.output("arraybuffer")], { type: "application/pdf" }),
    `${title}-selection.pdf`,
  );
}

export async function exportNotebookPdf(title: string, pages: Page[]): Promise<void> {
  const kept = trimTrailingBlankPages(pages);
  if (!kept.some((page) => page.pdfSource)) {
    const bytes = await renderSvgLayerPdf(kept, title, false);
    downloadBlob(
      new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
      `${title}.pdf`,
    );
    return;
  }
  await exportLayeredPdf(title, kept);
}

async function renderSvgLayerPdf(
  pages: Page[],
  title: string,
  annotationOnly: boolean,
): Promise<Uint8Array> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const width = PAGE_WIDTH * PT_PER_UNIT;
  const height = PAGE_HEIGHT * PT_PER_UNIT;
  const doc = new jsPDF({ unit: "pt", format: [width, height] });
  doc.setDocumentProperties({ title });
  for (const [index, page] of pages.entries()) {
    if (index > 0) doc.addPage([width, height]);
    const images = annotationOnly ? page.images.filter((image) => !image.locked) : page.images;
    const imageData = await collectImageDataUris(
      images.map((image) => image.imageId),
      true,
    );
    const svg = new DOMParser().parseFromString(
      pageToSvg(page, imageData, { annotationOnly }),
      "image/svg+xml",
    ).documentElement;
    await svg2pdf(svg, doc, { x: 0, y: 0, width, height });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

async function exportLayeredPdf(title: string, pages: Page[]): Promise<void> {
  const pdflib: PdfLib = await import("pdf-lib");
  const annotationBytes = await renderSvgLayerPdf(pages, title, true);
  const width = PAGE_WIDTH * PT_PER_UNIT;
  const height = PAGE_HEIGHT * PT_PER_UNIT;
  const finalDoc = await pdflib.PDFDocument.create();
  finalDoc.setTitle(title);
  const annotationDoc = await pdflib.PDFDocument.load(annotationBytes);
  const annotationPages = await finalDoc.embedPdf(annotationDoc, annotationDoc.getPageIndices());
  const caches = {
    sources: new Map<string, PDFDocument | null>(),
    embedded: new Map<string, PDFEmbeddedPage | null>(),
  };
  for (const [index, page] of pages.entries()) {
    const pdfPage = finalDoc.addPage([width, height]);
    pdfPage.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: toPdfRgb(pdflib, page.paperColor),
    });
    drawPattern(pdflib, pdfPage, page.pattern, page.paperColor);
    if (page.pdfSource) {
      await drawSourceLayer(pdflib, finalDoc, pdfPage, page, caches);
    }
    pdfPage.drawPage(annotationPages[index], { x: 0, y: 0, width, height });
  }
  const bytes = await finalDoc.save();
  downloadBlob(
    new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
    `${title}.pdf`,
  );
}

async function drawSourceLayer(
  pdflib: PdfLib,
  finalDoc: PDFDocument,
  pdfPage: PDFPage,
  page: Page,
  caches: {
    sources: Map<string, PDFDocument | null>;
    embedded: Map<string, PDFEmbeddedPage | null>;
  },
): Promise<void> {
  const source = page.pdfSource;
  const locked = page.images.find((image) => image.locked);
  if (!source || !locked) return;
  const rect = {
    x: locked.x * PT_PER_UNIT,
    y: toY(locked.y + locked.height),
    width: locked.width * PT_PER_UNIT,
    height: locked.height * PT_PER_UNIT,
  };
  const embedded = await embedSourcePage(pdflib, finalDoc, source, caches);
  if (embedded) {
    pdfPage.drawRectangle({ ...rect, color: pdflib.rgb(1, 1, 1) });
    pdfPage.drawPage(embedded, rect);
    return;
  }
  await drawRasterFallback(finalDoc, pdfPage, locked.imageId, rect);
}

async function embedSourcePage(
  pdflib: PdfLib,
  finalDoc: PDFDocument,
  source: PdfSource,
  caches: {
    sources: Map<string, PDFDocument | null>;
    embedded: Map<string, PDFEmbeddedPage | null>;
  },
): Promise<PDFEmbeddedPage | null> {
  const key = `${source.docId}:${source.pageIndex}`;
  const cached = caches.embedded.get(key);
  if (cached !== undefined) return cached;
  let embedded: PDFEmbeddedPage | null = null;
  try {
    let sourceDoc = caches.sources.get(source.docId);
    if (sourceDoc === undefined) {
      sourceDoc = null;
      const record = await getPdf(source.docId);
      if (record) {
        const bytes = new Uint8Array(await record.blob.arrayBuffer());
        try {
          sourceDoc = await pdflib.PDFDocument.load(bytes);
        } catch {
          sourceDoc = await pdflib.PDFDocument.load(bytes, { ignoreEncryption: true });
        }
      }
      caches.sources.set(source.docId, sourceDoc);
    }
    if (sourceDoc && source.pageIndex < sourceDoc.getPageCount()) {
      embedded = await finalDoc.embedPage(sourceDoc.getPage(source.pageIndex));
    }
  } catch {
    embedded = null;
  }
  caches.embedded.set(key, embedded);
  return embedded;
}

async function drawRasterFallback(
  finalDoc: PDFDocument,
  pdfPage: PDFPage,
  imageId: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<void> {
  try {
    const record = await getImage(imageId);
    if (!record) return;
    const bytes = await record.blob.arrayBuffer();
    let image =
      record.mimeType === "image/jpeg"
        ? await finalDoc.embedJpg(bytes)
        : record.mimeType === "image/png"
          ? await finalDoc.embedPng(bytes)
          : null;
    if (!image) {
      const png = await rasterizeToPng(record.blob);
      if (png) image = await finalDoc.embedPng(png);
    }
    if (image) pdfPage.drawImage(image, rect);
  } catch {
    // leave the base blank rather than fail the whole export
  }
}

function toPdfRgb(pdflib: PdfLib, hex: string): RGB {
  const parsed = hexToRgb(hex);
  return parsed ? pdflib.rgb(parsed.r, parsed.g, parsed.b) : pdflib.rgb(0, 0, 0);
}

function toY(y: number): number {
  return (PAGE_HEIGHT - y) * PT_PER_UNIT;
}

function drawPattern(
  pdflib: PdfLib,
  pdfPage: PDFPage,
  pattern: PagePattern,
  paperColor: string,
): void {
  if (pattern === "blank") return;
  const { lines, dots } = patternLayout(pattern);
  const dark = isDarkColor(paperColor);
  const color = dark ? pdflib.rgb(1, 1, 1) : pdflib.rgb(0, 0, 0);
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
