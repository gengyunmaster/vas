// Explicit dynamic-import map for the MathJax newcm font's on-demand glyph
// modules (double-struck for \mathbb, calligraphic for \mathcal, ...), keyed by
// the file name MathJax passes to mathjax.asyncLoad. Bare package specifiers
// are deliberate: in dev they are pre-bundled into the same optimized module
// graph as the MathJax output jax, while a raw /node_modules path (e.g. via
// import.meta.glob) would load a second copy of the font class and the glyph
// registration would land on the wrong instance.
export const dynamicFontModules: Record<string, () => Promise<unknown>> = {
  "PUA.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/PUA.js"),
  "accents-b-i.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js"),
  "accents.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js"),
  "arabic.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js"),
  "arrows.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js"),
  "braille-d.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/braille-d.js"),
  "braille.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/braille.js"),
  "calligraphic.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js"),
  "cherokee.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/cherokee.js"),
  "cyrillic-ss.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js"),
  "cyrillic.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js"),
  "devanagari.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/devanagari.js"),
  "double-struck.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js"),
  "fraktur.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js"),
  "greek-ss.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js"),
  "greek.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js"),
  "hebrew.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js"),
  "latin-b.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js"),
  "latin-bi.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js"),
  "latin-i.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js"),
  "latin.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js"),
  "marrows.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js"),
  "math.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js"),
  "monospace-ex.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js"),
  "monospace-l.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js"),
  "monospace.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js"),
  "mshapes.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js"),
  "phonetics-ss.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics-ss.js"),
  "phonetics.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics.js"),
  "sans-serif-b.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js"),
  "sans-serif-bi.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js"),
  "sans-serif-ex.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js"),
  "sans-serif-i.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js"),
  "sans-serif-r.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js"),
  "sans-serif.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js"),
  "script.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js"),
  "shapes.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js"),
  "symbols-b-i.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js"),
  "symbols.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js"),
  "variants.js": () => import("@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js"),
};
