// Deterministic text layout shared by all three export backends (PNG canvas,
// SVG <text>, pdf-lib drawText). Pure and testable: the measurer, math
// resolver and image resolver are injected. The on-screen preview uses DOM
// flow instead, so minor line-break differences vs export are accepted.

import type { LatexGlyph } from "../geo/latexSvg";
import type { Block, Inline, InlineStyle } from "../markdown/blocks";
import { ensureHighlight, highlightCodeSegments, highlightReady } from "../markdown/highlight";

export interface FontSpec {
  size: number;
  bold: boolean;
  italic: boolean;
  code: boolean;
}

export type MeasureFn = (text: string, font: FontSpec) => number;
export type MathResolver = (latex: string, display: boolean) => Promise<LatexGlyph | null>;
export type ImageSizeResolver = (imageId: string) => { width: number; height: number } | null;

export type LaidRun =
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      font: FontSpec;
      color: string;
      link?: string;
      strike?: boolean;
    }
  | {
      kind: "math";
      x: number;
      y: number;
      width: number;
      height: number;
      glyph: LatexGlyph;
      color: string;
    }
  | { kind: "image"; x: number; y: number; width: number; height: number; imageId: string };

export type Decoration =
  | { kind: "quoteBar"; x: number; y: number; height: number }
  | { kind: "codeBg"; x: number; y: number; width: number; height: number }
  | { kind: "rule"; x: number; y: number; width: number }
  // y is the line's vertical center; color follows the run's ink.
  | { kind: "underline"; x: number; y: number; width: number; color: string; thickness: number }
  | { kind: "strikeLine"; x: number; y: number; width: number; color: string; thickness: number };

export interface TextLayout {
  runs: LaidRun[];
  decorations: Decoration[];
  height: number;
}

export interface LayoutOptions {
  width: number;
  fontSize: number;
  color: string;
  measure: MeasureFn;
  resolveMath: MathResolver;
  resolveImageSize: ImageSizeResolver;
  // Picks the light/dark syntax palette for highlighted code blocks.
  darkPaper?: boolean;
}

const LINE_HEIGHT = 1.5;
const PARAGRAPH_GAP = 0.5;
const HEADING_SCALE = [1.6, 1.45, 1.3, 1.15, 1.05, 1];
const QUOTE_INDENT = 14;
const QUOTE_BAR_WIDTH = 3;
const CODE_PADDING = 8;
// MathJax viewBox units are 1000 per em (see geo/ui/export.ts).
const MATH_EM_UNITS = 1000;

function isCjkBreakable(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0x20000 && cp <= 0x2fa1f)
  );
}

// Split into breakable atoms: latin/digit runs split at spaces (the space is
// glued to the word that follows it), CJK characters break individually.
export function splitAtoms(text: string): string[] {
  const atoms: string[] = [];
  let latin = "";
  let pendingSpace = false;
  const flushLatin = () => {
    if (latin) atoms.push(latin);
    latin = "";
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === " " || ch === "\t") {
      pendingSpace = true;
      continue;
    }
    if (isCjkBreakable(cp)) {
      flushLatin();
      atoms.push((pendingSpace ? " " : "") + ch);
    } else {
      if (pendingSpace) flushLatin();
      latin += (pendingSpace ? " " : "") + ch;
    }
    pendingSpace = false;
  }
  flushLatin();
  return atoms;
}

type AtomRun =
  | {
      kind: "text";
      text: string;
      font: FontSpec;
      color: string;
      link?: string;
      strike?: boolean;
    }
  | {
      kind: "math";
      glyph: LatexGlyph;
      width: number;
      height: number;
      ascent: number;
      color: string;
    }
  | { kind: "image"; imageId: string; width: number; height: number };

interface Atom {
  run: AtomRun;
}

interface Context {
  opts: LayoutOptions;
  runs: LaidRun[];
  decorations: Decoration[];
  y: number;
}

function fontFor(base: FontSpec, style: InlineStyle): FontSpec {
  return {
    size: base.size,
    bold: base.bold || !!style.bold,
    italic: !!style.italic,
    code: !!style.code,
  };
}

async function buildAtoms(
  inlines: Inline[],
  baseFont: FontSpec,
  opts: LayoutOptions,
): Promise<Atom[]> {
  const atoms: Atom[] = [];
  // splitAtoms glues a space onto the atom that follows it, but drops one that
  // trails an inline's text; carry it across inline (style) boundaries so
  // "a **b**" does not collapse into "ab".
  let pendingSpace = false;
  const pushSpace = () => {
    if (!pendingSpace) return;
    atoms.push({
      run: { kind: "text", text: " ", font: baseFont, color: opts.color },
    });
    pendingSpace = false;
  };
  for (const inline of inlines) {
    switch (inline.kind) {
      case "text": {
        const pieces = splitAtoms(inline.text);
        if (pendingSpace && pieces.length > 0) {
          if (!pieces[0].startsWith(" ")) pieces[0] = ` ${pieces[0]}`;
          pendingSpace = false;
        }
        pendingSpace = pendingSpace || /[ \t]$/.test(inline.text);
        for (const piece of pieces) {
          atoms.push({
            run: {
              kind: "text",
              text: piece,
              font: fontFor(baseFont, inline.style),
              color: inline.style.color ?? opts.color,
              link: inline.style.link,
              strike: !!inline.style.strike,
            },
          });
        }
        break;
      }
      case "math": {
        pushSpace();
        const glyph = await opts.resolveMath(inline.latex, false);
        if (!glyph) {
          for (const piece of splitAtoms(inline.latex)) {
            atoms.push({
              run: {
                kind: "text",
                text: piece,
                font: { ...baseFont, code: true },
                color: inline.color ?? opts.color,
              },
            });
          }
          break;
        }
        const scale = baseFont.size / MATH_EM_UNITS;
        const [, vbY, vbW, vbH] = glyph.viewBox;
        atoms.push({
          run: {
            kind: "math",
            glyph,
            width: vbW * scale,
            height: vbH * scale,
            ascent: -vbY * scale,
            color: inline.color ?? opts.color,
          },
        });
        break;
      }
      case "image": {
        const natural = opts.resolveImageSize(inline.imageId);
        if (!natural || natural.width <= 0 || natural.height <= 0) break;
        pushSpace();
        const width = Math.min(natural.width, opts.width);
        atoms.push({
          run: {
            kind: "image",
            imageId: inline.imageId,
            width,
            height: (natural.height * width) / natural.width,
          },
        });
        break;
      }
      case "break":
        break;
    }
  }
  return atoms;
}

function layoutAtoms(ctx: Context, atoms: Atom[], indent: number) {
  const { width, fontSize, measure } = ctx.opts;
  const lineHeight = fontSize * LINE_HEIGHT;
  const contentWidth = width - indent;
  let x = 0;

  // Group into visual lines first: a line's height must grow around tall
  // inline math (fractions overflow a plain 1.5em box, like KaTeX's strut),
  // which is only known once line breaking is done.
  type ImageAtom = Atom & { run: { kind: "image" } };
  type Line = { kind: "flow"; atoms: Atom[] } | { kind: "image"; atom: ImageAtom };
  const lines: Line[] = [{ kind: "flow", atoms: [] }];
  const flowLine = () => {
    const last = lines[lines.length - 1];
    return last.kind === "flow" ? last : null;
  };
  const freshFlowLine = () => {
    lines.push({ kind: "flow", atoms: [] });
    x = 0;
  };

  for (const atom of atoms) {
    if (atom.run.kind === "image") {
      const current = lines[lines.length - 1];
      if (current.kind === "flow" && current.atoms.length > 0) freshFlowLine();
      lines.push({ kind: "image", atom: atom as ImageAtom }, { kind: "flow", atoms: [] });
      x = 0;
      continue;
    }
    const atomWidth =
      atom.run.kind === "text" ? measure(atom.run.text, atom.run.font) : atom.run.width;
    // Whitespace collapses at the start of a wrapped line.
    if (x === 0 && atom.run.kind === "text" && atom.run.text.trim() === "") continue;
    if (x > 0 && x + atomWidth > contentWidth) freshFlowLine();
    flowLine()?.atoms.push(atom);
    x += atomWidth;
  }

  for (const line of lines) {
    if (line.kind === "image") {
      ctx.runs.push({
        kind: "image",
        x: indent,
        y: ctx.y,
        width: line.atom.run.width,
        height: line.atom.run.height,
        imageId: line.atom.run.imageId,
      });
      ctx.y += line.atom.run.height + fontSize * 0.6;
      continue;
    }
    let ascent = fontSize * 1.15;
    let descent = lineHeight - ascent;
    for (const atom of line.atoms) {
      if (atom.run.kind !== "math") continue;
      ascent = Math.max(ascent, atom.run.ascent);
      descent = Math.max(descent, atom.run.height - atom.run.ascent);
    }
    const baseline = ctx.y + ascent;
    let lineX = 0;
    for (const atom of line.atoms) {
      if (atom.run.kind === "text") {
        const atomWidth = measure(atom.run.text, atom.run.font);
        ctx.runs.push({
          kind: "text",
          x: indent + lineX,
          y: baseline,
          text: atom.run.text,
          font: atom.run.font,
          color: atom.run.color,
          link: atom.run.link,
          strike: atom.run.strike,
        });
        const size = atom.run.font.size;
        const thickness = Math.max(1, size * 0.055);
        if (atom.run.link) {
          ctx.decorations.push({
            kind: "underline",
            x: indent + lineX,
            y: baseline + size * 0.13,
            width: atomWidth,
            color: atom.run.color,
            thickness,
          });
        }
        if (atom.run.strike) {
          ctx.decorations.push({
            kind: "strikeLine",
            x: indent + lineX,
            y: baseline - size * 0.28,
            width: atomWidth,
            color: atom.run.color,
            thickness,
          });
        }
        lineX += atomWidth;
      } else if (atom.run.kind === "math") {
        ctx.runs.push({
          kind: "math",
          x: indent + lineX,
          y: baseline - atom.run.ascent,
          width: atom.run.width,
          height: atom.run.height,
          glyph: atom.run.glyph,
          color: atom.run.color,
        });
        lineX += atom.run.width;
      }
    }
    ctx.y += ascent + descent;
  }
}

async function layoutInlineFlow(
  ctx: Context,
  inlines: Inline[],
  baseFont: FontSpec,
  indent: number,
) {
  // Explicit breaks split the flow into segments laid out line by line.
  const segments: Inline[][] = [[]];
  for (const inline of inlines) {
    if (inline.kind === "break") {
      segments.push([]);
    } else {
      segments[segments.length - 1].push(inline);
    }
  }
  for (const segment of segments) {
    const atoms = await buildAtoms(segment, baseFont, ctx.opts);
    layoutAtoms(ctx, atoms, indent);
  }
}

// Segments (manual colors + hljs highlighting) may span newlines; split them
// into per-line chunks so each line's runs share a baseline and advance x.
function codeLines(
  block: Block & { kind: "codeBlock" },
  dark: boolean,
): { text: string; color?: string }[][] {
  const lines: { text: string; color?: string }[][] = [[]];
  for (const segment of highlightCodeSegments(block.segments, block.lang, dark)) {
    const parts = segment.text.split("\n");
    for (const [index, part] of parts.entries()) {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, color: segment.color });
    }
  }
  return lines;
}

export async function layoutBlocks(blocks: Block[], opts: LayoutOptions): Promise<TextLayout> {
  // Highlight must finish loading before layout so exports always get colors.
  if (blocks.some((block) => block.kind === "codeBlock" && block.lang) && !highlightReady()) {
    await ensureHighlight();
  }
  const ctx: Context = { opts, runs: [], decorations: [], y: 0 };
  const baseFont: FontSpec = { size: opts.fontSize, bold: false, italic: false, code: false };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (i > 0) ctx.y += opts.fontSize * PARAGRAPH_GAP;

    switch (block.kind) {
      case "paragraph": {
        const quoteStart = ctx.y;
        const indent = block.quote ? QUOTE_INDENT + QUOTE_BAR_WIDTH : 0;
        await layoutInlineFlow(ctx, block.inlines, baseFont, indent);
        if (block.quote) {
          ctx.decorations.push({
            kind: "quoteBar",
            x: 0,
            y: quoteStart,
            height: ctx.y - quoteStart - opts.fontSize * 0.35,
          });
        }
        break;
      }
      case "heading": {
        const scale = HEADING_SCALE[Math.min(Math.max(block.level, 1), 6) - 1];
        ctx.y += opts.fontSize * 0.4;
        await layoutInlineFlow(
          ctx,
          block.inlines,
          { ...baseFont, size: Math.round(opts.fontSize * scale), bold: true },
          0,
        );
        break;
      }
      case "listItem": {
        const indent = (block.depth + 1) * opts.fontSize * 1.5;
        const marker = block.ordered ? `${block.index}.` : "•";
        ctx.runs.push({
          kind: "text",
          x: block.depth * opts.fontSize * 1.5,
          y: ctx.y + opts.fontSize * 1.15,
          text: marker,
          font: baseFont,
          color: opts.color,
        });
        await layoutInlineFlow(ctx, block.inlines, baseFont, indent);
        break;
      }
      case "codeBlock": {
        const codeFont: FontSpec = { ...baseFont, code: true };
        const start = ctx.y;
        ctx.y += CODE_PADDING;
        for (const line of codeLines(block, opts.darkPaper ?? false)) {
          let x = CODE_PADDING;
          for (const chunk of line) {
            ctx.runs.push({
              kind: "text",
              x,
              y: ctx.y + opts.fontSize * 1.15,
              text: chunk.text,
              font: codeFont,
              color: chunk.color ?? opts.color,
            });
            x += ctx.opts.measure(chunk.text, codeFont);
          }
          ctx.y += opts.fontSize * LINE_HEIGHT;
        }
        ctx.y += CODE_PADDING - opts.fontSize * 0.35;
        ctx.decorations.push({
          kind: "codeBg",
          x: 0,
          y: start,
          width: opts.width,
          height: ctx.y - start,
        });
        break;
      }
      case "mathBlock": {
        const glyph = await opts.resolveMath(block.latex, true);
        if (!glyph) break;
        const scale = opts.fontSize / MATH_EM_UNITS;
        const [, , vbW, vbH] = glyph.viewBox;
        const pxW = vbW * scale;
        const pxH = vbH * scale;
        ctx.y += opts.fontSize * 0.4;
        ctx.runs.push({
          kind: "math",
          x: Math.max(0, (opts.width - pxW) / 2),
          y: ctx.y,
          width: pxW,
          height: pxH,
          glyph,
          color: opts.color,
        });
        ctx.y += pxH + opts.fontSize * 0.6;
        break;
      }
      case "rule":
        ctx.y += opts.fontSize * 0.5;
        ctx.decorations.push({ kind: "rule", x: 0, y: ctx.y, width: opts.width });
        ctx.y += opts.fontSize * 0.5;
        break;
    }
  }
  // The last line's text descent below the baseline is dead space and trims
  // away, but a tall math/image run occupies real pixels down there — keep it.
  const contentBottom = ctx.runs.reduce(
    (bottom, run) => (run.kind === "text" ? bottom : Math.max(bottom, run.y + run.height)),
    0,
  );
  return {
    runs: ctx.runs,
    decorations: ctx.decorations,
    height: Math.max(0, ctx.y - opts.fontSize * 0.35, contentBottom),
  };
}
