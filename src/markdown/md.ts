// markdown-it singleton with three custom extensions:
//   $...$ / \(...\)    inline math; $$...$$ / \[...\] block math (KaTeX on
//                      screen, MathJax vectors on export)
//   {#rrggbb|text}   colored text
//   ![](image:<id>)  references to images stored in the notebook (external
//                    image URLs are rejected by the sanitize rule below)
// Raw HTML stays disabled: imported notebooks are untrusted input.
import MarkdownIt, {
  type MarkdownIt as MarkdownItInstance,
  type StateBlock,
  type StateCore,
  type StateInline,
  type Token,
} from "markdown-it";
import { COLOR_SPAN_OPEN, findClosingBrace } from "./mathColor";

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;
const SPACE = 0x20;
const OPEN_PAREN = 0x28;
const CLOSE_PAREN = 0x29;

function mathInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const opener = state.src.charCodeAt(start);
  let latexStart: number;
  let end: number;
  let closerLen: number;
  if (opener === DOLLAR) {
    if (state.src.charCodeAt(start + 1) === DOLLAR) return false;
    if (state.src.charCodeAt(start + 1) === SPACE) return false;
    end = state.src.indexOf("$", start + 1);
    while (end !== -1) {
      const before = state.src.charCodeAt(end - 1);
      if (before === BACKSLASH || before === SPACE) {
        end = state.src.indexOf("$", end + 1);
        continue;
      }
      break;
    }
    latexStart = start + 1;
    closerLen = 1;
  } else if (opener === BACKSLASH && state.src.charCodeAt(start + 1) === OPEN_PAREN) {
    end = -1;
    let pos = start + 2;
    while (pos + 1 < state.posMax) {
      if (state.src.charCodeAt(pos) !== BACKSLASH) {
        pos++;
        continue;
      }
      if (state.src.charCodeAt(pos + 1) === CLOSE_PAREN) {
        end = pos;
        break;
      }
      pos += 2;
    }
    latexStart = start + 2;
    closerLen = 2;
  } else {
    return false;
  }
  if (end === -1 || end === latexStart) return false;
  const latex = state.src.slice(latexStart, end);
  if (latex.includes("\n")) return false;
  if (!silent) {
    const token = state.push("math_inline", "", 0);
    token.content = latex;
  }
  state.pos = end + closerLen;
  return true;
}

// Text left on the line after the closing delimiter is real content, not
// part of the formula; re-emit it as a paragraph so the core inline rule
// parses it (state.line already consumes the physical line).
function pushTrailingParagraph(state: StateBlock, text: string, line: number): void {
  const content = text.trim();
  if (!content) return;
  state.push("paragraph_open", "p", 1);
  const inline = state.push("inline", "", 0);
  inline.content = content;
  inline.map = [line, line + 1];
  inline.children = [];
  state.push("paragraph_close", "p", -1);
}

function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (start + 1 >= max) return false;
  let closer: string;
  if (state.src.startsWith("$$", start)) {
    closer = "$$";
  } else if (state.src.startsWith("\\[", start)) {
    closer = "\\]";
  } else {
    return false;
  }
  let pos = start + 2;
  // Single-line form: opener and closer on the same line
  let firstLineEnd = state.src.indexOf(closer, pos);
  while (firstLineEnd !== -1 && state.src.charCodeAt(firstLineEnd - 1) === BACKSLASH) {
    firstLineEnd = state.src.indexOf(closer, firstLineEnd + closer.length);
  }
  if (firstLineEnd !== -1 && firstLineEnd < max) {
    if (silent) return true;
    const token = state.push("math_block", "", 0);
    token.block = true;
    token.content = state.src.slice(pos, firstLineEnd).trim();
    token.map = [startLine, startLine + 1];
    pushTrailingParagraph(state, state.src.slice(firstLineEnd + closer.length, max), startLine);
    state.line = startLine + 1;
    return true;
  }
  // Multi-line form: closing delimiter on a later line
  let nextLine = startLine + 1;
  let found = false;
  for (; nextLine <= endLine; nextLine++) {
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    if (pos < state.eMarks[nextLine] && state.src.startsWith(closer, pos)) {
      found = true;
      break;
    }
  }
  if (!found) return false;
  if (silent) return true;
  const token = state.push("math_block", "", 0);
  token.block = true;
  token.content = state.src.slice(start + 2, state.eMarks[nextLine - 1] ?? start + 2).trim();
  token.map = [startLine, nextLine + 1];
  pushTrailingParagraph(
    state,
    state.src.slice(pos + closer.length, state.eMarks[nextLine]),
    nextLine,
  );
  state.line = nextLine + 1;
  return true;
}

function colorInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const match = COLOR_SPAN_OPEN.exec(state.src.slice(start, start + 10));
  if (!match) return false;
  const innerStart = start + match[0].length;
  const end = findClosingBrace(state.src, innerStart);
  if (end === -1 || end === innerStart) return false;
  if (!silent) {
    const open = state.push("color_open", "span", 1);
    open.meta = { color: `#${match[1].toLowerCase()}` };
    const oldPos = state.pos;
    const oldPosMax = state.posMax;
    state.pos = innerStart;
    state.posMax = end;
    state.md.inline.tokenize(state);
    state.pos = oldPos;
    state.posMax = oldPosMax;
    state.push("color_close", "span", -1);
  }
  state.pos = end + 1;
  return true;
}

const IMAGE_REF = /^image:[\w-]+$/;

function imageAltText(token: Token): string {
  let text = "";
  for (const child of token.children ?? []) {
    if (child.type === "text" || child.type === "code_inline") text += child.content;
  }
  return text;
}

// External image URLs are rejected: the notebook must stay self-contained and
// offline-capable. Only references into the images table survive.
function sanitizeImages(state: StateCore): boolean {
  for (const token of state.tokens) {
    if (token.type !== "inline") continue;
    for (const child of token.children ?? []) {
      if (child.type !== "image") continue;
      const src = String(child.attrGet("src") ?? "");
      if (IMAGE_REF.test(src)) {
        child.meta = { imageId: src.slice("image:".length) };
        child.attrs = [];
        continue;
      }
      child.type = "text";
      child.tag = "";
      child.nesting = 0;
      child.content = imageAltText(child);
      child.children = null;
      child.attrs = null;
    }
  }
  return true;
}

let instance: MarkdownItInstance | null = null;

export function markdownIt(): MarkdownItInstance {
  if (instance) return instance;
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
  md.disable("table");
  // Before "escape": \( must win over the escape rule, which would otherwise
  // swallow the backslash and render a literal "(".
  md.inline.ruler.before("escape", "math_inline", mathInline);
  md.inline.ruler.after("escape", "color", colorInline);
  md.block.ruler.before("paragraph", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.core.ruler.push("sanitize_images", sanitizeImages);
  instance = md;
  return md;
}
