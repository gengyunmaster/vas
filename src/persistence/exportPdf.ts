import type { PDFDocument, PDFEmbeddedPage, PDFPage, RGB } from "pdf-lib";
import type { AudioItem } from "../model/audioItem";
import { hexToRgb, isDarkColor } from "../model/color";
import type { ImageItem } from "../model/image";
import { type Page, type PdfSource, trimTrailingBlankPages } from "../model/page";
import { PATTERN_DASH, patternLayout } from "../model/patternLayout";
import type { Stroke } from "../model/stroke";
import { type TextItem, textImageRefs } from "../model/textItem";
import { elementsBounds } from "../model/transform";
import { textItemHeight } from "../text/textHeight";
import { pageToSvg } from "./exportSvg";
import { collectImageDataUris } from "./imageDataUri";
import { getImage } from "./images";
import { getPdf } from "./pdfs";
import { createPdfTextFonts, drawPdfTextItems } from "./pdfTextLayer";
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
  texts: TextItem[] = [],
  audios: AudioItem[] = [],
): Promise<void> {
  const bounds = elementsBounds(
    strokes,
    images,
    texts.map((item) => ({ item, height: textItemHeight(item) })),
    audios,
  );
  if (!bounds) return;
  const imageData = await collectImageDataUris(selectionImageIds(images, texts), true);
  const widthUnits = bounds.maxX - bounds.minX;
  const heightUnits = bounds.maxY - bounds.minY;
  const width = widthUnits * PT_PER_UNIT;
  const height = heightUnits * PT_PER_UNIT;
  const cropped = { ...page, strokes, images, texts, audios };
  const pdfImages = images.filter((image) => image.pdfSource);
  if (texts.length > 0 || pdfImages.length > 0) {
    // svg2pdf drops <text> and cannot embed source PDFs: selections with text or
    // PDF-backed images go through pdf-lib so text stays real vector glyphs and
    // PDF images keep their vector form. Math and images ride the SVG layers.
    const pdflib: PdfLib = await import("pdf-lib");
    const [{ svg2pdf }] = await Promise.all([import("svg2pdf.js")]);
    const { jsPDF } = await import("jspdf");
    const doc = await pdflib.PDFDocument.create();
    doc.setTitle(title);
    const pdfPage = doc.addPage([width, height]);
    pdfPage.drawRectangle({ x: 0, y: 0, width, height, color: pdflib.rgb(1, 1, 1) });
    const view = { offsetX: bounds.minX, offsetY: bounds.minY, heightUnits };
    const caches = {
      sources: new Map<string, PDFDocument | null>(),
      embedded: new Map<string, PDFEmbeddedPage | null>(),
    };
    for (const image of pdfImages) {
      await drawPdfImage(pdflib, doc, pdfPage, image, view, caches);
    }
    const regularImages = images.filter((image) => !image.pdfSource);
    if (regularImages.length > 0 || audios.length > 0) {
      const layerBytes = await singlePageSvgPdf(
        jsPDF,
        svg2pdf,
        await pageToSvg(
          { ...page, strokes: [], images: regularImages, texts: [], audios },
          imageData,
          {
            annotationOnly: true,
            imagesOnly: true,
            clipTo: bounds,
          },
        ),
        width,
        height,
        title,
      );
      const [layer] = await doc.embedPdf(layerBytes, [0]);
      if (layer) pdfPage.drawPage(layer, { x: 0, y: 0, width, height });
    }
    if (texts.length > 0) {
      const fonts = createPdfTextFonts(doc, (await import("@pdf-lib/fontkit")).default);
      await drawPdfTextItems(pdflib, pdfPage, texts, fonts, {
        offsetX: bounds.minX,
        offsetY: bounds.minY,
        heightUnits,
      });
    }
    const annotation = await singlePageSvgPdf(
      jsPDF,
      svg2pdf,
      await pageToSvg(cropped, imageData, {
        annotationOnly: true,
        skipImages: true,
        clipTo: bounds,
        textMode: "pathsOnly",
      }),
      width,
      height,
      title,
    );
    const [embedded] = await doc.embedPdf(annotation, [0]);
    if (embedded) pdfPage.drawPage(embedded, { x: 0, y: 0, width, height });
    const bytes = await doc.save();
    downloadBlob(new Blob([bytes.slice()], { type: "application/pdf" }), `${title}-selection.pdf`);
    return;
  }
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  // jsPDF swaps a wider-than-tall format array in portrait mode; state the orientation explicitly
  const doc = new jsPDF({
    unit: "pt",
    format: [width, height],
    orientation: pdfOrientation(width, height),
  });
  doc.setDocumentProperties({ title });
  const svg = new DOMParser().parseFromString(
    await pageToSvg(cropped, imageData, {
      annotationOnly: true,
      clipTo: bounds,
      textMode: "none",
    }),
    "image/svg+xml",
  ).documentElement;
  await svg2pdf(svg, doc, { x: 0, y: 0, width, height });
  downloadBlob(
    new Blob([doc.output("arraybuffer")], { type: "application/pdf" }),
    `${title}-selection.pdf`,
  );
}

function selectionImageIds(images: ImageItem[], texts: TextItem[]): string[] {
  const ids = new Set(images.map((image) => image.imageId));
  for (const text of texts) for (const id of textImageRefs(text.markdown)) ids.add(id);
  return [...ids];
}

async function singlePageSvgPdf(
  jsPDF: typeof import("jspdf")["jsPDF"],
  svg2pdf: typeof import("svg2pdf.js")["svg2pdf"],
  svgText: string,
  width: number,
  height: number,
  title: string,
): Promise<Uint8Array> {
  const doc = new jsPDF({
    unit: "pt",
    format: [width, height],
    orientation: pdfOrientation(width, height),
  });
  doc.setDocumentProperties({ title });
  const svg = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
  await svg2pdf(svg, doc, { x: 0, y: 0, width, height });
  return new Uint8Array(doc.output("arraybuffer"));
}

export async function exportNotebookPdf(title: string, pages: Page[]): Promise<void> {
  const kept = trimTrailingBlankPages(pages);
  const layered = kept.some(
    (page) =>
      page.pdfSource ||
      page.texts.length > 0 ||
      page.audios.length > 0 ||
      page.images.some((image) => image.pdfSource),
  );
  if (!layered) {
    const bytes = await renderSvgLayerPdf(kept, title, "all");
    downloadBlob(new Blob([bytes.slice()], { type: "application/pdf" }), `${title}.pdf`);
    return;
  }
  await exportLayeredPdf(title, kept);
}

type SvgLayer = "all" | "images" | "strokes";

async function renderSvgLayerPdf(
  pages: Page[],
  title: string,
  layer: SvgLayer,
): Promise<Uint8Array> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const firstWidth = pages[0].width * PT_PER_UNIT;
  const firstHeight = pages[0].height * PT_PER_UNIT;
  const doc = new jsPDF({
    unit: "pt",
    format: [firstWidth, firstHeight],
    orientation: pdfOrientation(firstWidth, firstHeight),
  });
  doc.setDocumentProperties({ title });
  for (const [index, page] of pages.entries()) {
    const width = page.width * PT_PER_UNIT;
    const height = page.height * PT_PER_UNIT;
    if (index > 0) doc.addPage([width, height], pdfOrientation(width, height));
    let svgText: string;
    if (layer === "images") {
      // PDF-backed images are embedded by pdf-lib instead; locked base images too.
      const images = page.images.filter((image) => !image.locked && !image.pdfSource);
      const imageData = await collectImageDataUris(
        images.map((image) => image.imageId),
        true,
      );
      svgText = await pageToSvg({ ...page, images }, imageData, {
        annotationOnly: true,
        imagesOnly: true,
      });
    } else if (layer === "strokes") {
      const imageData = await collectImageDataUris(
        page.texts.flatMap((text) => textImageRefs(text.markdown)),
        true,
      );
      svgText = await pageToSvg(page, imageData, {
        annotationOnly: true,
        skipImages: true,
        textMode: "pathsOnly",
      });
    } else {
      const imageData = await collectImageDataUris(
        selectionImageIds(page.images, page.texts),
        true,
      );
      svgText = await pageToSvg(page, imageData, {});
    }
    const svg = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
    await svg2pdf(svg, doc, { x: 0, y: 0, width, height });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

async function exportLayeredPdf(title: string, pages: Page[]): Promise<void> {
  const pdflib: PdfLib = await import("pdf-lib");
  const annotationBytes = await renderSvgLayerPdf(pages, title, "strokes");
  const hasImageLayer = pages.some(
    (page) =>
      page.audios.length > 0 || page.images.some((image) => !image.locked && !image.pdfSource),
  );
  const imageLayerBytes = hasImageLayer ? await renderSvgLayerPdf(pages, title, "images") : null;
  const finalDoc = await pdflib.PDFDocument.create();
  finalDoc.setTitle(title);
  const hasTexts = pages.some((page) => page.texts.length > 0);
  const fonts = hasTexts
    ? createPdfTextFonts(finalDoc, (await import("@pdf-lib/fontkit")).default)
    : null;
  const annotationDoc = await pdflib.PDFDocument.load(annotationBytes);
  const annotationPages = await finalDoc.embedPdf(annotationDoc, annotationDoc.getPageIndices());
  const imageLayerDoc = imageLayerBytes ? await pdflib.PDFDocument.load(imageLayerBytes) : null;
  const imageLayerPages = imageLayerDoc
    ? await finalDoc.embedPdf(imageLayerDoc, imageLayerDoc.getPageIndices())
    : null;
  const caches = {
    sources: new Map<string, PDFDocument | null>(),
    embedded: new Map<string, PDFEmbeddedPage | null>(),
  };
  for (const [index, page] of pages.entries()) {
    const width = page.width * PT_PER_UNIT;
    const height = page.height * PT_PER_UNIT;
    const pdfPage = finalDoc.addPage([width, height]);
    pdfPage.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: toPdfRgb(pdflib, page.paperColor),
    });
    drawPattern(pdflib, pdfPage, page, page.paperColor);
    if (page.pdfSource) {
      await drawSourceLayer(pdflib, finalDoc, pdfPage, page, caches);
    }
    const view = { offsetX: 0, offsetY: 0, heightUnits: page.height };
    for (const image of page.images) {
      if (!image.locked && image.pdfSource) {
        await drawPdfImage(pdflib, finalDoc, pdfPage, image, view, caches);
      }
    }
    const imageLayer = imageLayerPages?.[index];
    if (imageLayer) pdfPage.drawPage(imageLayer, { x: 0, y: 0, width, height });
    if (fonts && page.texts.length > 0) {
      await drawPdfTextItems(pdflib, pdfPage, page.texts, fonts, {
        offsetX: 0,
        offsetY: 0,
        heightUnits: page.height,
        darkPaper: isDarkColor(page.paperColor),
      });
    }
    pdfPage.drawPage(annotationPages[index], { x: 0, y: 0, width, height });
  }
  const bytes = await finalDoc.save();
  downloadBlob(new Blob([bytes.slice()], { type: "application/pdf" }), `${title}.pdf`);
}

// A PDF-backed image embeds its original page as a vector Form XObject. Unlike
// the locked base, no white backing is drawn: source pages that paint no
// background stay transparent, matching the raster preview.
async function drawPdfImage(
  pdflib: PdfLib,
  finalDoc: PDFDocument,
  pdfPage: PDFPage,
  image: ImageItem,
  view: { offsetX: number; offsetY: number; heightUnits: number },
  caches: {
    sources: Map<string, PDFDocument | null>;
    embedded: Map<string, PDFEmbeddedPage | null>;
  },
): Promise<void> {
  const source = image.pdfSource;
  if (!source) return;
  const rect = {
    x: (image.x - view.offsetX) * PT_PER_UNIT,
    y: (view.heightUnits - (image.y - view.offsetY) - image.height) * PT_PER_UNIT,
    width: image.width * PT_PER_UNIT,
    height: image.height * PT_PER_UNIT,
  };
  const embedded = await embedSourcePage(pdflib, finalDoc, source, caches);
  if (embedded) {
    pdfPage.drawPage(embedded, rect);
    return;
  }
  await drawRasterFallback(finalDoc, pdfPage, image.imageId, rect);
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
    y: toY(page.height, locked.y + locked.height),
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

function toY(pageHeight: number, y: number): number {
  return (pageHeight - y) * PT_PER_UNIT;
}

function drawPattern(pdflib: PdfLib, pdfPage: PDFPage, page: Page, paperColor: string): void {
  if (page.pattern === "blank") return;
  const { lines, dots } = patternLayout(page.pattern, page.width, page.height);
  const dark = isDarkColor(paperColor);
  const color = dark ? pdflib.rgb(1, 1, 1) : pdflib.rgb(0, 0, 0);
  const opacity = dark ? 0.22 : 0.16;
  for (const line of lines) {
    pdfPage.drawLine({
      start: { x: line.x1 * PT_PER_UNIT, y: toY(page.height, line.y1) },
      end: { x: line.x2 * PT_PER_UNIT, y: toY(page.height, line.y2) },
      thickness: 0.75,
      color,
      opacity,
      ...(line.dashed ? { dashArray: PATTERN_DASH.map((v) => v * PT_PER_UNIT) } : {}),
    });
  }
  for (const dot of dots) {
    pdfPage.drawCircle({
      x: dot.x * PT_PER_UNIT,
      y: toY(page.height, dot.y),
      size: 0.9,
      color,
      opacity,
    });
  }
}
