import { boardPalette } from "../board/palette";

function serializeBoardSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = boardPixelSize(svg);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const text = new XMLSerializer().serializeToString(clone);
  // JSXGraph declares xmlns via setAttributeNS, which DOM attribute lookups by
  // plain name do not see; adding it at the DOM level would serialize as a
  // duplicate attribute and invalidate the XML. Patch the string instead.
  const withXmlns = /<svg[^>]*\sxmlns=/.test(text)
    ? text
    : text.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const withBackground = withXmlns.replace(
    /<svg[^>]*>/,
    (open) => `${open}<rect width="100%" height="100%" fill="${boardPalette.boardBackground}"/>`,
  );
  // JSXGraph parks a hidden foreignObject container in the board SVG. Even an
  // empty one makes older Chromium taint any canvas the image is drawn onto.
  return stripForeignObjects(withBackground);
}

function stripForeignObjects(svgText: string): string {
  return svgText
    .replace(/<foreignObject\b[^>]*\/>/g, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/g, "");
}

export async function composeBoardSvg(host: HTMLElement): Promise<string> {
  const svg = host.querySelector("svg");
  if (!svg) return "";
  const base = serializeBoardSvg(svg);
  const layer = textLayerMarkup(host);
  if (!layer) return base;
  const { width, height } = boardPixelSize(svg);
  const css = await textLayerCss();
  const foreignObject =
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${width}px;height:${height}px;">` +
    `<style><![CDATA[${css}]]></style>${layer}</div></foreignObject>`;
  return base.replace("</svg>", `${foreignObject}</svg>`);
}

export async function rasterizeBoard(host: HTMLElement, scale: number): Promise<Blob | null> {
  const svg = host.querySelector("svg");
  if (!svg) return null;
  const { width, height } = boardPixelSize(svg);
  try {
    const blob = await rasterizeSvg(await composeBoardSvg(host), width, height, scale);
    if (blob) return blob;
  } catch (error) {
    // Some browsers refuse (or taint the canvas for) an SVG image whose text
    // layer rides in a foreignObject; degrade to the vector layer with plain
    // text overlays instead of failing outright.
    console.warn("PNG export: composite with text layer failed, falling back", error);
  }
  try {
    const blob = await rasterizeFallback(svg, host, width, height, scale);
    if (blob) return blob;
  } catch (error) {
    console.warn("PNG export: text-overlay fallback failed", error);
  }
  try {
    return await rasterizeSvg(serializeBoardSvg(svg), width, height, scale);
  } catch (error) {
    console.warn("PNG export: vector-only rasterization failed", error);
    return null;
  }
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

async function rasterizeFallback(
  svg: SVGSVGElement,
  host: HTMLElement,
  width: number,
  height: number,
  scale: number,
): Promise<Blob | null> {
  const url = URL.createObjectURL(
    new Blob([serializeBoardSvg(svg)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = await loadImage(url);
    const canvas = createCanvas(width, height, scale);
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = boardPalette.boardBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const hostRect = host.getBoundingClientRect();
    for (const node of host.querySelectorAll(".JXGtext")) {
      if (!(node instanceof HTMLElement)) continue;
      const computed = getComputedStyle(node);
      if (computed.display === "none" || computed.visibility === "hidden") continue;
      const text = node.textContent ?? "";
      if (!text.trim()) continue;
      const rect = node.getBoundingClientRect();
      context.fillStyle = computed.color;
      context.font = `${parseFloat(computed.fontSize) * scale}px ${computed.fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        text,
        (rect.left + rect.width / 2 - hostRect.left) * scale,
        (rect.top + rect.height / 2 - hostRect.top) * scale,
      );
    }
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

function textLayerMarkup(host: HTMLElement): string {
  const pieces: string[] = [];
  for (const node of host.querySelectorAll(".JXGtext")) {
    // SVG-native texts (tick labels) live in the vector layer already; only
    // HTML overlay texts belong in the foreignObject layer.
    if (!(node instanceof HTMLElement)) continue;
    const computed = getComputedStyle(node);
    if (computed.display === "none" || computed.visibility === "hidden") continue;
    const clone = node.cloneNode(true) as HTMLElement;
    clone.style.color = computed.color;
    clone.style.fontSize = computed.fontSize;
    clone.style.fontFamily = computed.fontFamily;
    // outerHTML serializes U+00A0 as &nbsp;, an entity XML does not define;
    // the SVG must stay well-formed for image rasterization and strict viewers.
    pieces.push(clone.outerHTML.replace(/&nbsp;/g, "&#160;"));
  }
  return pieces.join("");
}

// KaTeX markup only renders with its CSS and fonts. Both are scraped from the
// stylesheets already loaded in the page, so this works identically in dev and
// production builds; fonts are inlined as data URLs because an SVG used as an
// image source may not fetch external resources.
let cachedCss: Promise<string> | null = null;

function textLayerCss(): Promise<string> {
  cachedCss ??= collectKatexCss().then((css) => {
    // KaTeX styles arrive in an async chunk; recollect until its rules exist.
    if (!css.includes(".katex")) cachedCss = null;
    return css;
  });
  return cachedCss;
}

async function collectKatexCss(): Promise<string> {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        if (rule.style.fontFamily.includes("KaTeX")) chunks.push(rule.cssText);
      } else if (rule.cssText.startsWith(".katex")) {
        chunks.push(rule.cssText);
      }
    }
  }
  let css = chunks.join("\n");
  const fonts = [
    ...new Set([...css.matchAll(/url\(["']?([^"')]+?\.woff2)["']?\)/g)].map((match) => match[1])),
  ];
  for (const fontUrl of fonts) {
    try {
      const blob = await fetch(fontUrl).then((response) => response.blob());
      css = css.split(fontUrl).join(await blobToDataUrl(blob));
    } catch {
      // Keep the remote reference; the label still renders when the file is reachable.
    }
  }
  return css;
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize the board SVG"));
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
