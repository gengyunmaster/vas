import { getOutlinePoints, HIGHLIGHTER_ALPHA } from "../engine/renderStroke";
import { isDarkColor } from "../model/color";
import type { Bounds } from "../model/hitTest";
import type { ImageItem } from "../model/image";
import { type Page, trimTrailingBlankPages } from "../model/page";
import { PATTERN_DASH, patternLayout } from "../model/patternLayout";
import { arrowHead } from "../model/shapeGeometry";
import type { Stroke } from "../model/stroke";
import { elementsBounds } from "../model/transform";
import { downloadZip } from "./exportZip";
import { collectImageDataUris } from "./imageDataUri";
import { outlineToSvgPath } from "./svgPath";
import { downloadBlob, sanitizeFileName } from "./transfer";

export async function exportPageSvg(title: string, pageIndex: number, page: Page): Promise<void> {
  const imageData = await collectImageDataUris(page.images.map((image) => image.imageId));
  const svg = pageToSvg(page, imageData);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${title}-page-${pageIndex + 1}.svg`);
}

export async function exportNotebookSvg(title: string, pages: Page[]): Promise<void> {
  const kept = trimTrailingBlankPages(pages);
  if (kept.length === 1 && kept[0]) {
    await exportPageSvg(title, 0, kept[0]);
    return;
  }
  const entries: { name: string; data: Uint8Array }[] = [];
  const encoder = new TextEncoder();
  for (const [index, page] of kept.entries()) {
    const imageData = await collectImageDataUris(page.images.map((image) => image.imageId));
    entries.push({
      name: `${sanitizeFileName(title)}-page-${index + 1}.svg`,
      data: encoder.encode(pageToSvg(page, imageData)),
    });
  }
  downloadZip(title, entries);
}

export async function exportSelectionSvg(
  title: string,
  page: Page,
  strokes: Stroke[],
  images: ImageItem[],
): Promise<void> {
  const bounds = elementsBounds(strokes, images);
  if (!bounds) return;
  const imageData = await collectImageDataUris(images.map((image) => image.imageId));
  const svg = pageToSvg({ ...page, strokes, images }, imageData, {
    annotationOnly: true,
    clipTo: bounds,
  });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${title}-selection.svg`);
}

export function pageToSvg(
  page: Page,
  imageData: Map<string, string>,
  options: { annotationOnly?: boolean; clipTo?: Bounds } = {},
): string {
  const view = options.clipTo ?? { minX: 0, minY: 0, maxX: page.width, maxY: page.height };
  const viewWidth = view.maxX - view.minX;
  const viewHeight = view.maxY - view.minY;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${fmt(view.minX)} ${fmt(view.minY)} ${fmt(viewWidth)} ${fmt(viewHeight)}" width="${fmt(viewWidth)}" height="${fmt(viewHeight)}">`,
  ];
  if (!options.annotationOnly) {
    parts.push(
      `<rect x="${fmt(view.minX)}" y="${fmt(view.minY)}" width="${fmt(viewWidth)}" height="${fmt(viewHeight)}" fill="${escapeXml(page.paperColor)}"/>`,
      ...patternToSvg(page),
    );
  }
  for (const image of page.images) {
    if (options.annotationOnly && image.locked) continue;
    const dataUri = imageData.get(image.imageId);
    if (!dataUri) continue;
    const href = escapeXml(dataUri);
    parts.push(
      `<image x="${fmt(image.x)}" y="${fmt(image.y)}" width="${fmt(image.width)}" height="${fmt(image.height)}" href="${href}" xlink:href="${href}" preserveAspectRatio="none"/>`,
    );
  }
  for (const stroke of page.strokes) {
    const element = strokeToSvg(stroke);
    if (element) parts.push(element);
  }
  parts.push("</svg>");
  return parts.join("\n");
}

function strokeToSvg(stroke: Stroke): string {
  if (stroke.shape) return shapeToSvg(stroke);
  const outline = getOutlinePoints(stroke, true);
  if (outline.length < 3) return "";
  const opacity = stroke.pen === "highlighter" ? ` fill-opacity="${HIGHLIGHTER_ALPHA}"` : "";
  return `<path d="${outlineToSvgPath(outline)}" fill="${escapeXml(stroke.color)}"${opacity}/>`;
}

function shapeToSvg(stroke: Stroke): string {
  const [a, b] = stroke.points;
  if (!stroke.shape || !a || !b) return "";
  const common = `stroke="${escapeXml(stroke.color)}" stroke-width="${fmt(stroke.size)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  switch (stroke.shape) {
    case "line":
      return `<path d="M${fmt(a.x)} ${fmt(a.y)} L${fmt(b.x)} ${fmt(b.y)}" ${common}/>`;
    case "arrow": {
      const [left, right] = arrowHead(a, b, stroke.size);
      const d =
        `M${fmt(a.x)} ${fmt(a.y)} L${fmt(b.x)} ${fmt(b.y)} ` +
        `M${fmt(left.x)} ${fmt(left.y)} L${fmt(b.x)} ${fmt(b.y)} L${fmt(right.x)} ${fmt(right.y)}`;
      return `<path d="${d}" ${common}/>`;
    }
    case "rect": {
      const d =
        `M${fmt(Math.min(a.x, b.x))} ${fmt(Math.min(a.y, b.y))} ` +
        `L${fmt(Math.max(a.x, b.x))} ${fmt(Math.min(a.y, b.y))} ` +
        `L${fmt(Math.max(a.x, b.x))} ${fmt(Math.max(a.y, b.y))} ` +
        `L${fmt(Math.min(a.x, b.x))} ${fmt(Math.max(a.y, b.y))} Z`;
      return `<path d="${d}" ${common}/>`;
    }
    case "ellipse":
      return `<ellipse cx="${fmt((a.x + b.x) / 2)}" cy="${fmt((a.y + b.y) / 2)}" rx="${fmt(Math.abs(b.x - a.x) / 2)}" ry="${fmt(Math.abs(b.y - a.y) / 2)}" ${common}/>`;
  }
}

function patternToSvg(page: Page): string[] {
  if (page.pattern === "blank") return [];
  const { lines, dots } = patternLayout(page.pattern, page.width, page.height);
  const dark = isDarkColor(page.paperColor);
  const color = dark ? "#ffffff" : "#000000";
  const opacity = dark ? "0.22" : "0.16";
  const elements: string[] = [];
  for (const line of lines) {
    const dash = line.dashed ? ` stroke-dasharray="${PATTERN_DASH.join(" ")}"` : "";
    elements.push(
      `<line x1="${fmt(line.x1)}" y1="${fmt(line.y1)}" x2="${fmt(line.x2)}" y2="${fmt(line.y2)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1"${dash}/>`,
    );
  }
  for (const dot of dots) {
    elements.push(
      `<circle cx="${fmt(dot.x)}" cy="${fmt(dot.y)}" r="1.2" fill="${color}" fill-opacity="${opacity}"/>`,
    );
  }
  return elements;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}
