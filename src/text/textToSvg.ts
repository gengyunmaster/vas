// Text item → SVG elements. Text runs stay real <text> (viewers use their
// own fonts), math runs are MathJax vector glyphs, images embed as data URIs.
import { escapeHtml } from "../markdown/html";
import type { TextItem } from "../model/textItem";
import type { TextLayout } from "./layout";
import { CODE_FONT_STACK, TEXT_FONT_STACK } from "./measure";

const QUOTE_BAR_COLOR = "#808080";
const CODE_BG_COLOR = "#000000";
const RULE_COLOR = "#808080";

export function textItemToSvg(
  item: TextItem,
  layout: TextLayout,
  imageData: Map<string, string>,
  mode: "all" | "pathsOnly" = "all",
): string[] {
  const parts: string[] = [`<g transform="translate(${fmt(item.x)} ${fmt(item.y)})">`];
  if (mode === "all") {
    for (const deco of layout.decorations) {
      if (deco.kind === "quoteBar") {
        parts.push(
          `<rect x="${fmt(deco.x)}" y="${fmt(deco.y)}" width="3" height="${fmt(deco.height)}" fill="${QUOTE_BAR_COLOR}" fill-opacity="0.45"/>`,
        );
      } else if (deco.kind === "codeBg") {
        parts.push(
          `<rect x="${fmt(deco.x)}" y="${fmt(deco.y)}" width="${fmt(deco.width)}" height="${fmt(deco.height)}" rx="8" fill="${CODE_BG_COLOR}" fill-opacity="0.06"/>`,
        );
      } else if (deco.kind === "rule") {
        parts.push(
          `<rect x="${fmt(deco.x)}" y="${fmt(deco.y - 0.75)}" width="${fmt(deco.width)}" height="1.5" fill="${RULE_COLOR}" fill-opacity="0.4"/>`,
        );
      } else {
        parts.push(
          `<rect x="${fmt(deco.x)}" y="${fmt(deco.y - deco.thickness / 2)}" width="${fmt(deco.width)}" height="${fmt(deco.thickness)}" fill="${escapeHtml(deco.color)}"/>`,
        );
      }
    }
  }
  for (const run of layout.runs) {
    if (run.kind === "text") {
      if (mode === "pathsOnly") continue;
      const weight = run.font.bold ? ` font-weight="700"` : "";
      const style = run.font.italic ? ` font-style="italic"` : "";
      const family = run.font.code ? CODE_FONT_STACK : TEXT_FONT_STACK;
      // xml:space="preserve": layout glues a leading space onto atoms after a
      // break (and prices it into x), which the default whitespace handling
      // would strip, shifting every glyph of the run one space to the left.
      const text = `<text x="${fmt(run.x)}" y="${fmt(run.y)}" font-family="${escapeHtml(family)}" font-size="${fmt(run.font.size)}"${weight}${style} fill="${escapeHtml(run.color)}" xml:space="preserve">${escapeHtml(run.text)}</text>`;
      if (run.link) {
        const href = escapeHtml(run.link);
        parts.push(`<a href="${href}" xlink:href="${href}" target="_blank">${text}</a>`);
      } else {
        parts.push(text);
      }
    } else if (run.kind === "math") {
      const [vx, , vw] = run.glyph.viewBox;
      if (vw <= 0) continue;
      const scale = run.width / vw;
      parts.push(
        `<g transform="translate(${fmt(run.x - vx * scale)} ${fmt(run.y - run.glyph.viewBox[1] * scale)}) scale(${fmt(scale)})" color="${escapeHtml(run.color)}">${run.glyph.body}</g>`,
      );
    } else {
      const dataUri = imageData.get(run.imageId);
      if (!dataUri) continue;
      const href = escapeHtml(dataUri);
      parts.push(
        `<image x="${fmt(run.x)}" y="${fmt(run.y)}" width="${fmt(run.width)}" height="${fmt(run.height)}" href="${href}" xlink:href="${href}"/>`,
      );
    }
  }
  parts.push("</g>");
  return parts;
}

// Math glyph scales are tiny fractions (fontSize/1000); two decimals would
// round 0.024 to 0.02 and shrink every formula to ~83% of its laid-out size.
function fmt(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}
