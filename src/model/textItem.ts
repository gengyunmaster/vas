import { PLACEMENT_MARGIN } from "./page";
import { newId } from "./stroke";

export interface TextItem {
  id: string;
  x: number;
  y: number;
  // Box width is fixed by the user; height always derives from layout.
  width: number;
  fontSize: number;
  color: string;
  markdown: string;
}

export const TEXT_FONT_SIZES = [14, 18, 24, 32, 42, 56] as const;
export const DEFAULT_TEXT_FONT_SIZE = 24;
export const DEFAULT_TEXT_WIDTH = 360;
export const MIN_TEXT_WIDTH = 80;
export const MAX_TEXT_MARKDOWN_LENGTH = 20000;
// Bottom edge a text box may approach; also reused as the right-edge margin
// when clamping box width.
export const TEXT_PAGE_MARGIN = 8;

export function createTextItem(
  x: number,
  y: number,
  fontSize: number,
  color: string,
  pageWidth: number,
  pageHeight: number,
): TextItem {
  const width = Math.min(
    DEFAULT_TEXT_WIDTH,
    Math.max(MIN_TEXT_WIDTH, pageWidth - PLACEMENT_MARGIN * 2),
  );
  return {
    id: newId(),
    x: Math.min(Math.max(0, x), Math.max(0, pageWidth - width)),
    y: Math.min(Math.max(0, y), Math.max(0, pageHeight - fontSize * 2)),
    width,
    fontSize,
    color,
    markdown: "",
  };
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

// Image references inside markdown: ![alt](image:<imageId>). Only this exact
// shape survives sanitization, so a plain regex is a faithful extractor.
const IMAGE_REF_PATTERN = /!\[[^\]]*\]\(image:([\w-]+)\)/g;

export function textImageRefs(markdown: string): string[] {
  return [...markdown.matchAll(IMAGE_REF_PATTERN)].map((match) => match[1]);
}

export function remapTextImageRefs(markdown: string, remap: Map<string, string>): string {
  return markdown.replace(IMAGE_REF_PATTERN, (whole, id: string) => {
    const mapped = remap.get(id);
    if (!mapped) throw new Error("Text references an unknown image");
    return whole.replace(`image:${id})`, `image:${mapped})`);
  });
}

// Export-side cleanup: references whose blob is missing from the images table
// degrade to nothing rather than producing an archive that cannot re-import.
export function dropUnknownTextImageRefs(
  markdown: string,
  known: (imageId: string) => boolean,
): string {
  return markdown.replace(IMAGE_REF_PATTERN, (whole, id: string) => (known(id) ? whole : ""));
}

export function isValidTextItem(value: unknown): value is TextItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    Number.isFinite(item.x) &&
    Number.isFinite(item.y) &&
    Number.isFinite(item.width) &&
    (item.width as number) >= MIN_TEXT_WIDTH &&
    Number.isFinite(item.fontSize) &&
    (item.fontSize as number) > 0 &&
    (item.fontSize as number) <= 200 &&
    typeof item.color === "string" &&
    isHexColor(item.color) &&
    typeof item.markdown === "string" &&
    item.markdown.length <= MAX_TEXT_MARKDOWN_LENGTH
  );
}
