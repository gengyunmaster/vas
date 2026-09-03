// Syntax highlighting for fenced code blocks with a language tag. highlight.js
// loads lazily (like KaTeX) and stays out of the main bundle. hljs themes are
// CSS, but the export pipeline needs concrete hex values, so its <span
// class="hljs-*"> output is mapped through fixed light/dark palettes instead.
import type { CodeSegment } from "./blocks";

interface HljsModule {
  highlight(
    text: string,
    options: { language: string; ignoreIllegals: boolean },
  ): { value: string };
  getLanguage(name: string): unknown;
}

let loading: Promise<void> | null = null;
let hljsModule: HljsModule | null = null;

export function highlightReady(): boolean {
  return hljsModule !== null;
}

export function ensureHighlight(): Promise<void> {
  loading ??= import("highlight.js/lib/common")
    .then((module) => {
      hljsModule = module.default as unknown as HljsModule;
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

// One Light / One Dark hues. Keys are hljs scope classes minus the "hljs-"
// prefix; operators and punctuation stay unmapped and inherit the ink color.
const LIGHT_PALETTE: Record<string, string> = {
  keyword: "#a626a4",
  built_in: "#c18401",
  type: "#c18401",
  literal: "#0184bb",
  number: "#b76b01",
  string: "#50a14f",
  regexp: "#50a14f",
  symbol: "#0184bb",
  comment: "#a0a1a7",
  quote: "#a0a1a7",
  doctag: "#a626a4",
  meta: "#a0a1a7",
  title: "#4078f2",
  section: "#4078f2",
  attr: "#b76b01",
  attribute: "#b76b01",
  variable: "#e45649",
  "template-variable": "#e45649",
  name: "#e45649",
  tag: "#e45649",
  "selector-tag": "#a626a4",
  "selector-class": "#4078f2",
  "selector-id": "#4078f2",
  "selector-attr": "#b76b01",
  "selector-pseudo": "#a626a4",
  addition: "#22863a",
  deletion: "#d73a49",
};

const DARK_PALETTE: Record<string, string> = {
  keyword: "#c678dd",
  built_in: "#e5c07b",
  type: "#e5c07b",
  literal: "#56b6c2",
  number: "#d19a66",
  string: "#98c379",
  regexp: "#98c379",
  symbol: "#56b6c2",
  comment: "#7f848e",
  quote: "#7f848e",
  doctag: "#c678dd",
  meta: "#7f848e",
  title: "#61afef",
  section: "#61afef",
  attr: "#d19a66",
  attribute: "#d19a66",
  variable: "#e06c75",
  "template-variable": "#e06c75",
  name: "#e06c75",
  tag: "#e06c75",
  "selector-tag": "#c678dd",
  "selector-class": "#61afef",
  "selector-id": "#61afef",
  "selector-attr": "#d19a66",
  "selector-pseudo": "#c678dd",
  addition: "#98c379",
  deletion: "#e06c75",
};

const SPAN_OPEN = '<span class="';

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntity(entity: string): string | null {
  const body = entity.slice(1, -1);
  const named = NAMED_ENTITIES[body];
  if (named !== undefined) return named;
  const hex = body.startsWith("#x") || body.startsWith("#X");
  if (!hex && !body.startsWith("#")) return null;
  const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
  return String.fromCodePoint(code);
}

// hljs emits only text and <span class="hljs-..."> elements, so a flat scanner
// suffices. A span with no palette-mapped class inherits the enclosing color;
// text outside any span stays colorless. Adjacent segments sharing a color are
// merged to keep run counts (and PDF text ops) down.
export function parseHighlightedHtml(html: string, palette: Record<string, string>): CodeSegment[] {
  const segments: CodeSegment[] = [];
  const enclosing: (string | undefined)[] = [];
  let color: string | undefined;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const last = segments[segments.length - 1];
    if (last && last.color === color) last.text += buffer;
    else if (color) segments.push({ text: buffer, color });
    else segments.push({ text: buffer });
    buffer = "";
  };
  let pos = 0;
  while (pos < html.length) {
    if (html.startsWith(SPAN_OPEN, pos)) {
      const quoteEnd = html.indexOf('"', pos + SPAN_OPEN.length);
      if (quoteEnd !== -1 && html.charCodeAt(quoteEnd + 1) === 0x3e) {
        flush();
        const mapped = html
          .slice(pos + SPAN_OPEN.length, quoteEnd)
          .split(/\s+/)
          .map((cls) => palette[cls.replace(/^hljs-/, "")])
          .find((c) => c !== undefined);
        enclosing.push(color);
        color = mapped ?? color;
        pos = quoteEnd + 2;
        continue;
      }
    }
    if (html.startsWith("</span>", pos)) {
      flush();
      color = enclosing.pop();
      pos += "</span>".length;
      continue;
    }
    if (html.charCodeAt(pos) === 0x26) {
      const semi = html.indexOf(";", pos + 1);
      if (semi !== -1 && semi - pos <= 10) {
        const decoded = decodeEntity(html.slice(pos, semi + 1));
        if (decoded !== null) {
          buffer += decoded;
          pos = semi + 1;
          continue;
        }
      }
    }
    buffer += html[pos];
    pos++;
  }
  flush();
  return segments;
}

export function highlightCode(text: string, lang: string, dark: boolean): CodeSegment[] | null {
  if (!hljsModule?.getLanguage(lang)) return null;
  let value: string;
  try {
    value = hljsModule.highlight(text, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
  return parseHighlightedHtml(value, dark ? DARK_PALETTE : LIGHT_PALETTE);
}

// Colorless segments get hljs highlighting; manual {#hex|...} colors win.
export function highlightCodeSegments(
  segments: CodeSegment[],
  lang: string | undefined,
  dark: boolean,
): CodeSegment[] {
  if (!lang || !highlightReady()) return segments;
  const out: CodeSegment[] = [];
  for (const segment of segments) {
    const highlighted =
      segment.color === undefined ? highlightCode(segment.text, lang, dark) : null;
    if (highlighted && highlighted.length > 0) out.push(...highlighted);
    else out.push(segment);
  }
  return out;
}
