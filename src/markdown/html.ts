// Blocks → HTML for the on-screen preview overlay. All text is escaped;
// math goes through KaTeX, images resolve through the images table.
import type { Block, CodeSegment, Inline, InlineStyle } from "./blocks";
import { highlightCodeSegments } from "./highlight";
import { renderMathHtml } from "./katex";

export type ImageUrlResolver = (imageId: string) => string | null;

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function styleAttr(style: InlineStyle): string {
  return style.color ? ` style="color: ${style.color}"` : "";
}

function renderInline(inline: Inline, resolveImage: ImageUrlResolver): string {
  switch (inline.kind) {
    case "break":
      return "<br>";
    case "math": {
      const html = renderMathHtml(inline.latex, false);
      const body = html ?? `<code class="md-math-pending">${escapeHtml(inline.latex)}</code>`;
      return inline.color ? `<span style="color: ${inline.color}">${body}</span>` : body;
    }
    case "image": {
      const url = resolveImage(inline.imageId);
      if (!url) return `<span class="md-img-missing">[image]</span>`;
      return `<img class="md-img" src="${escapeHtml(url)}" alt="${escapeHtml(inline.alt)}">`;
    }
    case "text": {
      let html = escapeHtml(inline.text);
      const { bold, italic, strike, code, link } = inline.style;
      if (code) html = `<code>${html}</code>`;
      if (bold) html = `<strong>${html}</strong>`;
      if (italic) html = `<em>${html}</em>`;
      if (strike) html = `<s>${html}</s>`;
      if (link)
        html = `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
      return `<span${styleAttr(inline.style)}>${html}</span>`;
    }
  }
}

function renderInlines(inlines: Inline[], resolveImage: ImageUrlResolver): string {
  return inlines.map((inline) => renderInline(inline, resolveImage)).join("");
}

// Segment colors are validated #rrggbb (color spans) or fixed palette values.
function renderCodeSegments(segments: CodeSegment[]): string {
  return segments
    .map((segment) => {
      const text = escapeHtml(segment.text);
      return segment.color ? `<span style="color: ${segment.color}">${text}</span>` : text;
    })
    .join("");
}

export function renderBlocksHtml(
  blocks: Block[],
  resolveImage: ImageUrlResolver,
  darkPaper = false,
): string {
  const parts: string[] = [];
  let listDepth = 0;
  let listOrdered = false;

  const closeList = () => {
    while (listDepth > 0) {
      parts.push(listOrdered ? "</ol>" : "</ul>");
      listDepth--;
    }
  };

  for (const block of blocks) {
    if (block.kind !== "listItem") closeList();
    switch (block.kind) {
      case "paragraph": {
        const body = renderInlines(block.inlines, resolveImage);
        parts.push(
          block.quote
            ? `<blockquote class="md-quote">${body}</blockquote>`
            : `<p class="md-p">${body}</p>`,
        );
        break;
      }
      case "heading":
        parts.push(
          `<h${block.level} class="md-h">${renderInlines(block.inlines, resolveImage)}</h${block.level}>`,
        );
        break;
      case "listItem": {
        if (listDepth === 0 || listOrdered !== block.ordered) {
          closeList();
          parts.push(block.ordered ? "<ol>" : "<ul>");
          listDepth = 1;
          listOrdered = block.ordered;
        }
        const marker = block.ordered ? `${block.index}.` : "•";
        parts.push(
          `<li class="md-li md-depth-${Math.min(block.depth, 6)}"><span class="md-marker">${marker}</span>${renderInlines(block.inlines, resolveImage)}</li>`,
        );
        break;
      }
      case "codeBlock":
        parts.push(
          `<pre class="md-code">${renderCodeSegments(highlightCodeSegments(block.segments, block.lang, darkPaper))}</pre>`,
        );
        break;
      case "mathBlock": {
        const html = renderMathHtml(block.latex, true);
        parts.push(
          html
            ? `<div class="md-math-block">${html}</div>`
            : `<pre class="md-code">${escapeHtml(block.latex)}</pre>`,
        );
        break;
      }
      case "rule":
        parts.push("<hr>");
        break;
    }
  }
  closeList();
  return parts.join("");
}
