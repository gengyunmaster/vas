import { ensureTextFontsLoaded } from "../fonts";
import type { FontSpec, MeasureFn } from "./layout";

export const TEXT_FONT_STACK = '"Noto Sans SC", ui-sans-serif, system-ui, sans-serif';
export const CODE_FONT_STACK = 'ui-monospace, "Noto Sans SC", monospace';

function canvasFont(font: FontSpec): string {
  const style = font.italic ? "italic " : "";
  const weight = font.bold ? 700 : 400;
  const family = font.code ? CODE_FONT_STACK : TEXT_FONT_STACK;
  return `${style}${weight} ${font.size}px ${family}`;
}

// Canvas measureText against the embedded Noto subsets: the same font files
// are embedded into PDF exports, so screen layout and export agree.
export async function createTextMeasurer(): Promise<MeasureFn> {
  await ensureTextFontsLoaded();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return (text, font) => text.length * font.size * 0.5;
  return (text, font) => {
    ctx.font = canvasFont(font);
    return ctx.measureText(text).width;
  };
}

export { canvasFont };
