import { PLACEMENT_MARGIN } from "./page";
import { newId } from "./stroke";

export interface TextItem {
  id: string;
  x: number;
  y: number;
  // Box width is fixed by the user; height always derives from layout.
  width: number;
  fontSize: number;
  color: string;
  markdown: string;
}

export const TEXT_FONT_SIZES = [14, 18, 24, 32, 42, 56] as const;
export const DEFAULT_TEXT_FONT_SIZE = 24;
export const DEFAULT_TEXT_WIDTH = 360;
export const MIN_TEXT_WIDTH = 80;
export const MAX_TEXT_MARKDOWN_LENGTH = 20000;
// Bottom edge a text box may approach; also reused as the right-edge margin
// when clamping box width.
export const TEXT_PAGE_MARGIN = 8;

export function createTextItem(
  x: number,
  y: number,
  fontSize: number,
  color: string,
  pageWidth: number,
  pageHeight: number,
): TextItem {
  const width = Math.min(
    DEFAULT_TEXT_WIDTH,
    Math.max(MIN_TEXT_WIDTH, pageWidth - PLACEMENT_MARGIN * 2),
  );
  return {
    id: newId(),
    x: Math.min(Math.max(0, x), Math.max(0, pageWidth - width)),
    y: Math.min(Math.max(0, y), Math.max(0, pageHeight - fontSize * 2)),
    width,
    fontSize,
    color,
    markdown: "",
  };
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

// Image references inside markdown: ![alt](image:<imageId>). Only this exact
// shape survives sanitization, so matching source text is a faithful
// extractor — except inside code, where the syntax is literal text. Code
// contexts are fenced blocks (``` or ~~~) and inline code spans (equal-length
// backtick runs), scanned here to keep this module markdown-it free.
const IMAGE_REF_PATTERN = /!\[[^\]]*\]\(image:([\w-]+)\)/g;

interface CodeSpan {
  start: number;
  end: number;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

function fencedCodeSpans(markdown: string): CodeSpan[] {
  const spans: CodeSpan[] = [];
  let fence: { marker: string; length: number; start: number } | null = null;
  let pos = 0;
  while (pos <= markdown.length) {
    const newline = markdown.indexOf("\n", pos);
    const end = newline === -1 ? markdown.length : newline;
    const line = markdown.slice(pos, end);
    const open = FENCE_OPEN.exec(line);
    if (fence) {
      const closes =
        open &&
        open[1][0] === fence.marker &&
        open[1].length >= fence.length &&
        line.slice(open[0].length).trim() === "";
      if (closes) {
        spans.push({ start: fence.start, end });
        fence = null;
      }
    } else if (open && (open[1][0] === "~" || !line.slice(open[0].length).includes("`"))) {
      fence = { marker: open[1][0], length: open[1].length, start: pos };
    }
    if (newline === -1) break;
    pos = newline + 1;
  }
  // An unclosed fence swallows the rest of the document, like markdown-it.
  if (fence) spans.push({ start: fence.start, end: markdown.length });
  return spans;
}

function inlineCodeSpans(text: string, offset: number): CodeSpan[] {
  const spans: CodeSpan[] = [];
  let pos = 0;
  while (pos < text.length) {
    if (text[pos] !== "`") {
      pos++;
      continue;
    }
    let runEnd = pos;
    while (text[runEnd] === "`") runEnd++;
    const length = runEnd - pos;
    let search = runEnd;
    let closed = false;
    while (search < text.length) {
      const next = text.indexOf("`", search);
      if (next === -1) break;
      let closeEnd = next;
      while (text[closeEnd] === "`") closeEnd++;
      if (closeEnd - next === length) {
        spans.push({ start: offset + pos, end: offset + closeEnd });
        pos = closeEnd;
        closed = true;
        break;
      }
      search = closeEnd;
    }
    // Unclosed runs stay literal text and scanning continues after them.
    if (!closed) pos = runEnd;
  }
  return spans;
}

function codeSpans(markdown: string): CodeSpan[] {
  const fenced = fencedCodeSpans(markdown);
  const spans = [...fenced];
  let cursor = 0;
  const segments = (start: number, end: number) => {
    if (end > start) spans.push(...inlineCodeSpans(markdown.slice(start, end), start));
  };
  for (const span of fenced) {
    segments(cursor, span.start);
    cursor = span.end;
  }
  segments(cursor, markdown.length);
  return spans;
}

function insideCode(spans: CodeSpan[], index: number): boolean {
  return spans.some((span) => index >= span.start && index < span.end);
}

export function textImageRefs(markdown: string): string[] {
  const spans = codeSpans(markdown);
  return [...markdown.matchAll(IMAGE_REF_PATTERN)]
    .filter((match) => !insideCode(spans, match.index))
    .map((match) => match[1]);
}

export function remapTextImageRefs(markdown: string, remap: Map<string, string>): string {
  const spans = codeSpans(markdown);
  return markdown.replace(IMAGE_REF_PATTERN, (whole, id: string, offset: number) => {
    if (insideCode(spans, offset)) return whole;
    const mapped = remap.get(id);
    if (!mapped) throw new Error("Text references an unknown image");
    return whole.replace(`image:${id})`, `image:${mapped})`);
  });
}

// Export-side cleanup: references whose blob is missing from the images table
// degrade to nothing rather than producing an archive that cannot re-import.
export function dropUnknownTextImageRefs(
  markdown: string,
  known: (imageId: string) => boolean,
): string {
  const spans = codeSpans(markdown);
  return markdown.replace(IMAGE_REF_PATTERN, (whole, id: string, offset: number) =>
    insideCode(spans, offset) || known(id) ? whole : "",
  );
}

export function isValidTextItem(value: unknown): value is TextItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    Number.isFinite(item.x) &&
    Number.isFinite(item.y) &&
    Number.isFinite(item.width) &&
    (item.width as number) >= MIN_TEXT_WIDTH &&
    Number.isFinite(item.fontSize) &&
    (item.fontSize as number) > 0 &&
    (item.fontSize as number) <= 200 &&
    typeof item.color === "string" &&
    isHexColor(item.color) &&
    typeof item.markdown === "string" &&
    item.markdown.length <= MAX_TEXT_MARKDOWN_LENGTH
  );
}
