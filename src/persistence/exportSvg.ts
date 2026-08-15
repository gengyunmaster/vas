import { getOutlinePoints, HIGHLIGHTER_ALPHA } from "../engine/renderStroke";
import { isDarkColor } from "../model/color";
import { PAGE_HEIGHT, PAGE_WIDTH, type Page } from "../model/page";
import { PATTERN_DASH, patternLayout } from "../model/patternLayout";
import { arrowHead } from "../model/shapeGeometry";
import type { Stroke } from "../model/stroke";
import { getImage } from "./images";
import { outlineToSvgPath } from "./svgPath";
import { downloadBlob } from "./transfer";

export async function exportPageSvg(title: string, pageIndex: number, page: Page): Promise<void> {
  const imageData = new Map<string, string>();
  await Promise.all(
    page.images.map(async (image) => {
      if (imageData.has(image.imageId)) return;
      const dataUri = await loadImageDataUri(image.imageId);
      if (dataUri) imageData.set(image.imageId, dataUri);
    }),
  );
  const svg = pageToSvg(page, imageData);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${title}-page-${pageIndex + 1}.svg`);
}

export function pageToSvg(page: Page, imageData: Map<string, string>): string {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}">`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${escapeXml(page.paperColor)}"/>`,
    ...patternToSvg(page),
  ];
  for (const image of page.images) {
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
  const { lines, dots } = patternLayout(page.pattern);
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

async function loadImageDataUri(imageId: string): Promise<string | null> {
  try {
    const record = await getImage(imageId);
    if (!record) return null;
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    return `data:${record.mimeType};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
