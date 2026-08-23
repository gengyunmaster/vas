import { boardPalette } from "../board/palette";
import { type LatexGlyph, type LatexOverlay, renderLatex } from "../latexSvg";

export interface ComposeOptions {
  // undefined keeps the board's background color; null embeds transparent.
  background?: string | null;
  overlays?: LatexOverlay[];
}

const CROP_MARGIN = 20;

export async function composeBoardSvg(
  host: HTMLElement,
  options: ComposeOptions = {},
): Promise<string> {
  const svg = host.querySelector("svg");
  if (!svg) return "";
  const background =
    options.background === undefined ? boardPalette.boardBackground : options.background;
  const clone = prepareClone(svg);
  await vectorizeSvgTexts(clone);
  const crop = contentBounds(clone, options.overlays ?? []);
  if (crop) {
    clone.setAttribute("viewBox", `${crop.x} ${crop.y} ${crop.width} ${crop.height}`);
    clone.setAttribute("width", String(crop.width));
    clone.setAttribute("height", String(crop.height));
  }
  const overlayMarkup = await overlayLayer(options.overlays ?? []);
  if (overlayMarkup) clone.insertAdjacentHTML("beforeend", overlayMarkup);
  if (background) {
    clone.insertAdjacentHTML(
      "afterbegin",
      `<rect x="${crop?.x ?? 0}" y="${crop?.y ?? 0}" width="${crop?.width ?? "100%"}" height="${crop?.height ?? "100%"}" fill="${background}"/>`,
    );
  }
  const text = new XMLSerializer().serializeToString(clone);
  // JSXGraph declares xmlns via setAttributeNS, which DOM attribute lookups by
  // plain name do not see; adding it at the DOM level would serialize as a
  // duplicate attribute and invalidate the XML. Patch the string instead.
  const withXmlns = /<svg[^>]*\sxmlns=/.test(text)
    ? text
    : text.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  // JSXGraph parks a hidden foreignObject container in the board SVG. Even an
  // empty one makes older Chromium taint any canvas the image is drawn onto.
  return stripForeignObjects(withXmlns);
}

export async function rasterizeBoard(
  host: HTMLElement,
  scale: number,
  options: ComposeOptions = {},
): Promise<Blob | null> {
  const svg = host.querySelector("svg");
  if (!svg) return null;
  const { width, height } = boardPixelSize(svg);
  try {
    return await rasterizeSvg(await composeBoardSvg(host, options), width, height, scale);
  } catch (error) {
    console.warn("PNG export failed", error);
    return null;
  }
}

// SVG-native <text> nodes (axis tick labels) render fine in browsers, but
// svg2pdf drops them on PDF export. Re-typeset them as MathJax vector glyphs
// so every downstream consumer sees paths only.
async function vectorizeSvgTexts(root: SVGSVGElement): Promise<void> {
  for (const node of Array.from(root.querySelectorAll("text"))) {
    if (node.getAttribute("display") === "none") continue;
    const content = node.textContent ?? "";
    if (!content.trim()) continue;
    const glyph = await renderLatex(content);
    if (!glyph) continue;
    const fontSize =
      Number.parseFloat(node.style.fontSize || node.getAttribute("font-size") || "") || 16;
    const x = Number.parseFloat(node.getAttribute("x") ?? "0") || 0;
    const y = Number.parseFloat(node.getAttribute("y") ?? "0") || 0;
    const fill = node.getAttribute("fill") ?? "currentColor";
    const [, , glyphWidth] = glyph.viewBox;
    const scale = fontSize / 1000;
    const anchor = node.getAttribute("text-anchor");
    const anchorShift =
      anchor === "middle" ? (-glyphWidth * scale) / 2 : anchor === "end" ? -glyphWidth * scale : 0;
    const dyEx = Number.parseFloat(node.getAttribute("dy") ?? "0") || 0;
    const dy = dyEx * 0.5 * fontSize;
    const holder = document.createElementNS("http://www.w3.org/2000/svg", "g");
    holder.innerHTML = `<g transform="translate(${round(x + anchorShift)} ${round(y + dy)}) scale(${round(scale, 6)})" color="${fill}">${glyph.body}</g>`;
    node.replaceWith(...Array.from(holder.childNodes));
  }
}

// Everything interesting is wrapped in one <g> so the content bounding box can
// be measured with a single getBBox call on a rendered clone.
function prepareClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = boardPixelSize(svg);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
  while (clone.firstChild) wrapper.appendChild(clone.firstChild);
  clone.appendChild(wrapper);
  return clone;
}

function contentBounds(
  clone: SVGSVGElement,
  overlays: LatexOverlay[],
): { x: number; y: number; width: number; height: number } | null {
  const wrapper = clone.firstElementChild;
  if (!(wrapper instanceof SVGGElement)) return null;
  const boardBox = clone.viewBox.baseVal;
  let bounds: DOMRect | null = null;
  const measurer = document.createElement("div");
  measurer.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;top:0;left:0";
  measurer.appendChild(clone);
  document.body.appendChild(measurer);
  try {
    const box = wrapper.getBBox();
    if (box.width > 0 || box.height > 0) {
      bounds = new DOMRect(box.x, box.y, box.width, box.height);
    }
  } catch {
    bounds = null;
  }
  measurer.remove();
  for (const overlay of overlays) {
    const rect = new DOMRect(overlay.x, overlay.y, overlay.width, overlay.height);
    bounds = bounds ? unionRect(bounds, rect) : rect;
  }
  if (!bounds) return null;
  const left = Math.max(boardBox.x, bounds.x - CROP_MARGIN);
  const top = Math.max(boardBox.y, bounds.y - CROP_MARGIN);
  const right = Math.min(boardBox.x + boardBox.width, bounds.x + bounds.width + CROP_MARGIN);
  const bottom = Math.min(boardBox.y + boardBox.height, bounds.y + bounds.height + CROP_MARGIN);
  if (right <= left || bottom <= top) return null;
  return {
    x: round(left),
    y: round(top),
    width: round(right - left),
    height: round(bottom - top),
  };
}

function unionRect(a: DOMRect, b: DOMRect): DOMRect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return new DOMRect(
    left,
    top,
    Math.max(a.x + a.width, b.x + b.width) - left,
    Math.max(a.y + a.height, b.y + b.height) - top,
  );
}

async function overlayLayer(overlays: LatexOverlay[]): Promise<string> {
  const parts: string[] = [];
  for (const overlay of overlays) {
    const glyph = await renderLatex(overlay.latex);
    parts.push(glyph ? placeGlyph(glyph, overlay) : fallbackText(overlay));
  }
  return parts.join("");
}

// Scale the MathJax glyph run to the on-screen KaTeX footprint (its width is
// measured from the live label node) and center it there.
export function placeGlyph(glyph: LatexGlyph, overlay: LatexOverlay): string {
  const [vx, vy, vw, vh] = glyph.viewBox;
  if (vw <= 0 || vh <= 0) return "";
  const scale = overlay.width > 0 ? overlay.width / vw : overlay.height / vh;
  const tx = overlay.x + overlay.width / 2 - (vx + vw / 2) * scale;
  const ty = overlay.y + overlay.height / 2 - (vy + vh / 2) * scale;
  return `<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale, 6)})" color="${overlay.color}">${glyph.body}</g>`;
}

// Labels whose LaTeX MathJax cannot parse degrade to plain SVG text with the
// markup commands stripped — readable beats missing.
function fallbackText(overlay: LatexOverlay): string {
  const plain = overlay.latex
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}^_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const cx = overlay.x + overlay.width / 2;
  const cy = overlay.y + overlay.height / 2;
  return `<text x="${round(cx)}" y="${round(cy)}" text-anchor="middle" dominant-baseline="central" fill="${overlay.color}" font-size="${overlay.fontSize}">${escapeXml(plain)}</text>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripForeignObjects(svgText: string): string {
  return svgText
    .replace(/<foreignObject\b[^>]*\/>/g, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/g, "");
}

async function rasterizeSvg(
  svgText: string,
  width: number,
  height: number,
  scale: number,
): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadImage(url);
    const canvas = createCanvas(width, height, scale);
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = boardPalette.boardBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createCanvas(width: number, height: number, scale: number): HTMLCanvasElement | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  return canvas;
}

function boardPixelSize(svg: SVGSVGElement): { width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  const attrWidth = Number(svg.getAttribute("width"));
  const attrHeight = Number(svg.getAttribute("height"));
  return {
    width: svg.clientWidth || rect.width || (Number.isFinite(attrWidth) ? attrWidth : 0),
    height: svg.clientHeight || rect.height || (Number.isFinite(attrHeight) ? attrHeight : 0),
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize the board SVG"));
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
