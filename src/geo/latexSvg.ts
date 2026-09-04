// MathJax is heavy, so the document is created lazily on first use and the
// module is meant to be reached through dynamic import(). Output uses
// fontCache: "none", which inlines every glyph as a <path> — the resulting
// markup is self-contained vector data with no runtime font dependency.
import { applyMathColorSpans } from "../markdown/mathColor";
import { dynamicFontModules } from "./mathjaxDynamicFonts";
export interface LatexGlyph {
  body: string;
  viewBox: [number, number, number, number];
}

// A rendered-on-screen KaTeX label: its LaTeX source plus the exact pixel
// footprint it occupies, used to re-typeset it as vectors when composing SVG.
export interface LatexOverlay {
  latex: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fontSize: number;
}

interface LiteNode {
  // The lite adaptor's DOM stand-in; only serialization is needed here.
  outerHTML?: string;
}

interface MathjaxContext {
  html: { convert(latex: string, options: { display: boolean }): LiteNode };
  // Dynamic font loads signal a retry exception mid-typeset; this reruns the
  // callback once the pending fetch resolves (component-loader behavior).
  handleRetriesFor(run: () => void): Promise<void>;
  adaptor: {
    // outerHTML serializes as HTML, leaving "<" raw inside attribute values
    // (data-latex holds the TeX source, e.g. "a<b") — fine for innerHTML but
    // malformed XML once the glyph is embedded into exported SVG.
    serializeXML(node: LiteNode): string;
  };
}

// Glyphs outside the base font (double-struck for \mathbb, calligraphic for
// \mathcal, fraktur, bold/italic latin variants, ...) ship as per-file modules
// that MathJax fetches through mathjax.asyncLoad on demand; each stays its own
// lazy chunk so the precache only pays for what a notebook actually uses.
function loadDynamicFont(name: string): Promise<unknown> {
  const file = name.split("/").pop() ?? "";
  const loader = dynamicFontModules[file];
  return loader
    ? loader()
    : Promise.reject(new Error(`Unknown MathJax dynamic font file: ${name}`));
}

let context: Promise<MathjaxContext> | null = null;

async function buildContext(): Promise<MathjaxContext> {
  await Promise.all([
    import("@mathjax/src/js/input/tex/ams/AmsConfiguration.js"),
    import("@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js"),
    import("@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js"),
    import("@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js"),
    import("@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js"),
    import("@mathjax/src/js/input/tex/color/ColorConfiguration.js"),
  ]);
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] =
    await Promise.all([
      import("@mathjax/src/js/mathjax.js"),
      import("@mathjax/src/js/input/tex.js"),
      import("@mathjax/src/js/output/svg.js"),
      import("@mathjax/src/js/adaptors/liteAdaptor.js"),
      import("@mathjax/src/js/handlers/html.js"),
    ]);
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  mathjax.asyncLoad = loadDynamicFont;
  const html = mathjax.document("", {
    InputJax: new TeX({
      packages: ["base", "ams", "newcommand", "noundefined", "textmacros", "unicode", "color"],
    }),
    OutputJax: new SVG({ fontCache: "none", linebreaks: { inline: false } }),
  });
  return { html, adaptor, handleRetriesFor: mathjax.handleRetriesFor } as MathjaxContext;
}

function loadMathjax(): Promise<MathjaxContext> {
  // A failed load (e.g. a transient chunk fetch error) must not poison the
  // session: reset so the next call retries, mirroring markdown/katex.ts.
  context ??= buildContext().catch((error: unknown) => {
    context = null;
    throw error;
  });
  return context;
}

const GLYPH_CACHE_LIMIT = 500;
const glyphCache = new Map<string, LatexGlyph | null>();

function glyphCacheSet(key: string, glyph: LatexGlyph | null): void {
  glyphCache.delete(key);
  glyphCache.set(key, glyph);
  while (glyphCache.size > GLYPH_CACHE_LIMIT) {
    const oldest = glyphCache.keys().next().value;
    if (oldest === undefined) break;
    glyphCache.delete(oldest);
  }
}

// Returns null when the source cannot be parsed or the output is not a single SVG.
export async function renderLatex(latex: string, display = false): Promise<LatexGlyph | null> {
  const source = applyMathColorSpans(latex);
  const key = `${display ? "d" : "i"}:${source}`;
  const cached = glyphCache.get(key);
  if (cached !== undefined) return cached;
  let glyph: LatexGlyph | null = null;
  try {
    const { html, adaptor, handleRetriesFor } = await loadMathjax();
    let node: LiteNode | null = null;
    await handleRetriesFor(() => {
      node = html.convert(source, { display });
    });
    if (!node) return null;
    const container = adaptor.serializeXML(node);
    const svgStart = container.indexOf("<svg");
    const svgCount = container.match(/<svg[\s>]/g)?.length ?? 0;
    if (svgStart >= 0 && svgCount === 1) {
      const contentStart = container.indexOf(">", svgStart) + 1;
      const closeIndex = container.lastIndexOf("</svg>");
      const openTag = container.slice(svgStart, contentStart);
      const viewBoxValue = openTag.match(/viewBox="([^"]+)"/)?.[1] ?? "";
      const parts = viewBoxValue.trim().split(/\s+/).map(Number);
      if (closeIndex > contentStart && parts.length === 4 && parts.every(Number.isFinite)) {
        const body = container.slice(contentStart, closeIndex);
        // MathJax typesets parse failures as an merror box instead of throwing.
        if (!body.includes("data-mjx-error")) {
          glyph = { body, viewBox: parts as [number, number, number, number] };
        }
      }
    }
  } catch {
    // Transient failures (MathJax not loaded yet) are not cached: the next
    // render must retry rather than stick at null.
    return null;
  }
  glyphCacheSet(key, glyph);
  return glyph;
}
