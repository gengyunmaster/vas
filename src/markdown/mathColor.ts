// {#rrggbb|...} color spans inside LaTeX math. KaTeX and MathJax only
// understand \color / \textcolor, so the notebook's own color syntax is
// rewritten to \textcolor before typesetting; \textcolor scopes the color to
// its argument, while the \color declaration would leak it to the rest of the
// enclosing group.
export const COLOR_SPAN_OPEN = /^\{#([0-9a-fA-F]{6})\|/;

const BACKSLASH = 0x5c;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;

// Returns the index of the `}` closing a span that starts at `from`, honoring
// brace nesting and skipping `\`-escaped characters. -1 when unclosed.
export function findClosingBrace(src: string, from: number): number {
  let depth = 0;
  let pos = from;
  while (pos < src.length) {
    const code = src.charCodeAt(pos);
    if (code === BACKSLASH) {
      pos += 2;
      continue;
    }
    if (code === OPEN_BRACE) depth++;
    if (code === CLOSE_BRACE) {
      if (depth === 0) return pos;
      depth--;
    }
    pos++;
  }
  return -1;
}

export function applyMathColorSpans(latex: string): string {
  let out = "";
  let pos = 0;
  while (pos < latex.length) {
    if (latex.charCodeAt(pos) === BACKSLASH) {
      out += latex.slice(pos, pos + 2);
      pos += 2;
      continue;
    }
    const match = COLOR_SPAN_OPEN.exec(latex.slice(pos, pos + 10));
    const contentStart = match ? pos + match[0].length : -1;
    const end = match ? findClosingBrace(latex, contentStart) : -1;
    if (!match || end === -1 || end === contentStart) {
      out += latex[pos];
      pos++;
      continue;
    }
    const content = applyMathColorSpans(latex.slice(contentStart, end));
    out += `\\textcolor{#${match[1].toLowerCase()}}{${content}}`;
    pos = end + 1;
  }
  return out;
}
