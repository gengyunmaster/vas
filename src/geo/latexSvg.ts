// MathJax is heavy, so the document is created lazily on first use and the
// module is meant to be reached through dynamic import(). Output uses
// fontCache: "none", which inlines every glyph as a <path> — the resulting
// markup is self-contained vector data with no runtime font dependency.
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
  adaptor: { outerHTML(node: LiteNode): string };
}

let context: Promise<MathjaxContext> | null = null;

function loadMathjax(): Promise<MathjaxContext> {
  context ??= (async () => {
    await Promise.all([
      import("@mathjax/src/js/input/tex/ams/AmsConfiguration.js"),
      import("@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js"),
      import("@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js"),
      import("@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js"),
      import("@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js"),
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
    const html = mathjax.document("", {
      InputJax: new TeX({
        packages: ["base", "ams", "newcommand", "noundefined", "textmacros", "unicode"],
      }),
      OutputJax: new SVG({ fontCache: "none", linebreaks: { inline: false } }),
    });
    return { html, adaptor } as MathjaxContext;
  })();
  return context;
}

const glyphCache = new Map<string, LatexGlyph | null>();

// Returns null when the source cannot be parsed or the output is not a single SVG.
export async function renderLatex(latex: string, display = false): Promise<LatexGlyph | null> {
  const key = `${display ? "d" : "i"}:${latex}`;
  const cached = glyphCache.get(key);
  if (cached !== undefined) return cached;
  let glyph: LatexGlyph | null = null;
  try {
    const { html, adaptor } = await loadMathjax();
    const container = adaptor.outerHTML(html.convert(latex, { display }));
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
    glyph = null;
  }
  glyphCache.set(key, glyph);
  return glyph;
}
