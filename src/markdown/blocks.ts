// Token stream → a flat block tree shared by the on-screen HTML renderer and
// the export layout engine. Nesting (quotes, list depth) is flattened into
// flags so both consumers stay simple.
import type { Token } from "markdown-it";
import { markdownIt } from "./md";

export interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  link?: string;
}

export type Inline =
  | { kind: "text"; text: string; style: InlineStyle }
  | { kind: "math"; latex: string; color?: string }
  | { kind: "image"; imageId: string; alt: string }
  | { kind: "break" };

export type Block =
  | { kind: "paragraph"; quote: boolean; inlines: Inline[] }
  | { kind: "heading"; level: number; inlines: Inline[] }
  | { kind: "listItem"; ordered: boolean; index: number; depth: number; inlines: Inline[] }
  | { kind: "codeBlock"; text: string }
  | { kind: "mathBlock"; latex: string }
  | { kind: "rule" };

const ALLOWED_LINK = /^(https?:|mailto:)/i;

function collectInlines(children: Token[]): Inline[] {
  const out: Inline[] = [];
  const stack: InlineStyle[] = [{}];
  const style = () => ({ ...stack[stack.length - 1] });
  const top = () => stack[stack.length - 1];

  for (const token of children) {
    switch (token.type) {
      case "text":
      case "code_inline": {
        const s = style();
        if (token.type === "code_inline") s.code = true;
        if (token.content) out.push({ kind: "text", text: token.content, style: s });
        break;
      }
      case "strong_open":
        stack.push({ ...top(), bold: true });
        break;
      case "em_open":
        stack.push({ ...top(), italic: true });
        break;
      case "s_open":
        stack.push({ ...top(), strike: true });
        break;
      case "color_open": {
        const color = token.meta?.color;
        stack.push({ ...top(), ...(typeof color === "string" ? { color } : {}) });
        break;
      }
      case "link_open": {
        const href = String(token.attrGet("href") ?? "");
        stack.push(ALLOWED_LINK.test(href) ? { ...top(), link: href } : top());
        break;
      }
      case "strong_close":
      case "em_close":
      case "s_close":
      case "color_close":
      case "link_close":
        if (stack.length > 1) stack.pop();
        break;
      case "softbreak":
      case "hardbreak":
        out.push({ kind: "break" });
        break;
      case "math_inline":
        out.push({ kind: "math", latex: token.content, color: top().color });
        break;
      case "image": {
        const imageId = token.meta?.imageId;
        if (typeof imageId === "string" && imageId) {
          let alt = "";
          for (const child of token.children ?? []) {
            if (child.type === "text" || child.type === "code_inline") alt += child.content;
          }
          out.push({ kind: "image", imageId, alt });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

interface ListFrame {
  ordered: boolean;
  index: number;
}

export function parseMarkdown(source: string): Block[] {
  const tokens = markdownIt().parse(source, {});
  const blocks: Block[] = [];
  const listStack: ListFrame[] = [];
  let quoteDepth = 0;
  let pendingHeading = 0;
  let paragraph = false;

  const pushInlines = (inlines: Inline[]) => {
    if (pendingHeading > 0) {
      blocks.push({ kind: "heading", level: pendingHeading, inlines });
      pendingHeading = 0;
      return;
    }
    if (listStack.length > 0) {
      const frame = listStack[listStack.length - 1];
      blocks.push({
        kind: "listItem",
        ordered: frame.ordered,
        index: frame.ordered ? frame.index++ : 0,
        depth: listStack.length - 1,
        inlines,
      });
      return;
    }
    blocks.push({ kind: "paragraph", quote: quoteDepth > 0, inlines });
  };

  for (const token of tokens) {
    switch (token.type) {
      case "heading_open":
        pendingHeading = Number(token.tag.slice(1)) || 1;
        break;
      case "heading_close":
        pendingHeading = 0;
        break;
      case "paragraph_open":
        paragraph = true;
        break;
      case "paragraph_close":
        paragraph = false;
        break;
      case "inline":
        if (paragraph || pendingHeading > 0) pushInlines(collectInlines(token.children ?? []));
        break;
      case "bullet_list_open":
        listStack.push({ ordered: false, index: 0 });
        break;
      case "ordered_list_open":
        listStack.push({ ordered: true, index: Number(token.attrGet("start") ?? 1) || 1 });
        break;
      case "bullet_list_close":
      case "ordered_list_close":
        listStack.pop();
        break;
      case "blockquote_open":
        quoteDepth++;
        break;
      case "blockquote_close":
        quoteDepth = Math.max(0, quoteDepth - 1);
        break;
      case "fence":
      case "code_block":
        blocks.push({ kind: "codeBlock", text: token.content.replace(/\n$/, "") });
        break;
      case "math_block":
        blocks.push({ kind: "mathBlock", latex: token.content });
        break;
      case "hr":
        blocks.push({ kind: "rule" });
        break;
      default:
        break;
    }
  }
  return blocks;
}
