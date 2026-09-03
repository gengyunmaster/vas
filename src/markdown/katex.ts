import { applyMathColorSpans } from "./mathColor";

let loading: Promise<void> | null = null;

interface KatexModule {
  renderToString(latex: string, options: { displayMode: boolean; throwOnError: boolean }): string;
}

let katexModule: KatexModule | null = null;

export function katexReady(): boolean {
  return katexModule !== null;
}

export function ensureKatex(): Promise<void> {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")])
    .then(([module]) => {
      katexModule = module.default as unknown as KatexModule;
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

export function renderMathHtml(latex: string, displayMode: boolean): string | null {
  if (!katexModule) return null;
  try {
    return katexModule.renderToString(applyMathColorSpans(latex), {
      displayMode,
      throwOnError: false,
    });
  } catch {
    return null;
  }
}
