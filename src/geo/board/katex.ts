let loading: Promise<void> | null = null;

export function ensureKatex(): Promise<void> {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")])
    .then(([module]) => {
      (window as unknown as { katex: unknown }).katex = module.default;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
