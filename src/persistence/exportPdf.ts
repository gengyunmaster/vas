import { PAGE_HEIGHT, PAGE_WIDTH, type Page, trimTrailingBlankPages } from "../model/page";
import { pageToSvg } from "./exportSvg";
import { collectImageDataUris } from "./imageDataUri";
import { downloadBlob } from "./transfer";

const PT_PER_UNIT = 72 / 96;

export async function exportNotebookPdf(title: string, pages: Page[]): Promise<void> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const width = PAGE_WIDTH * PT_PER_UNIT;
  const height = PAGE_HEIGHT * PT_PER_UNIT;
  const doc = new jsPDF({ unit: "pt", format: [width, height] });
  doc.setDocumentProperties({ title });
  const kept = trimTrailingBlankPages(pages);
  for (const [index, page] of kept.entries()) {
    if (index > 0) doc.addPage([width, height]);
    const imageData = await collectImageDataUris(
      page.images.map((image) => image.imageId),
      true,
    );
    const svg = new DOMParser().parseFromString(
      pageToSvg(page, imageData),
      "image/svg+xml",
    ).documentElement;
    await svg2pdf(svg, doc, { x: 0, y: 0, width, height });
  }
  downloadBlob(doc.output("blob"), `${title}.pdf`);
}
