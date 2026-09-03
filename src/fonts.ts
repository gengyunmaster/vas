// Injects @font-face for the subset Noto fonts that back both the on-screen
// text items and the vector PDF export, so glyphs and metrics match between
// screen and export: Noto Sans SC for prose, Noto Sans Mono (printable ASCII)
// for code runs. URLs must be built at runtime: public/ assets are not
// rebased by Vite when the app is served under a sub-path base.
export const TEXT_FONT_FAMILY = '"Noto Sans SC", ui-sans-serif, system-ui, sans-serif';

const weights = [
  { family: "Noto Sans SC", weight: 400, file: "noto-sans-sc-regular.ttf" },
  { family: "Noto Sans SC", weight: 700, file: "noto-sans-sc-bold.ttf" },
  { family: "Noto Sans Mono", weight: 400, file: "noto-sans-mono-regular.ttf" },
];

const css = weights
  .map(
    ({ family, weight, file }) => `@font-face {
  font-family: "${family}";
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url("${import.meta.env.BASE_URL}fonts/${file}") format("truetype");
}`,
  )
  .join("\n");

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

export async function ensureTextFontsLoaded(): Promise<void> {
  if (typeof document === "undefined") return;
  await Promise.all([
    document.fonts.load('400 16px "Noto Sans SC"'),
    document.fonts.load('700 16px "Noto Sans SC"'),
    document.fonts.load('400 16px "Noto Sans Mono"'),
  ]);
}
