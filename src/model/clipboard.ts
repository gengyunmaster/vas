import type { AudioItem } from "./audioItem";
import { normalizeHex } from "./color";
import type { ImageItem } from "./image";
import type { PdfSource } from "./page";
import { SHAPE_KINDS, type ShapeKind, type Stroke, type StrokePoint } from "./stroke";
import { isValidTextItem, type TextItem } from "./textItem";

export interface ClipboardContent {
  strokes: Stroke[];
  images: ImageItem[];
  texts: TextItem[];
  audios: AudioItem[];
}

// Copy/cut mirrors the selection into the system clipboard as JSON with this
// marker, so paste can tell vas data apart from foreign text and the payload
// even travels across tabs (blob references share the same IndexedDB).
const MARKER = "vas-clipboard";

export function serializeClipboard(content: ClipboardContent): string {
  return JSON.stringify({ marker: MARKER, ...content });
}

// Null means the text is not a vas payload (plain text, foreign JSON); a
// payload carrying our marker but failing validation throws instead.
export function parseClipboardPayload(text: string): ClipboardContent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.marker !== MARKER) return null;
  return {
    strokes: parseList(raw.strokes, parseStroke, "strokes"),
    images: parseList(raw.images, parseImage, "images"),
    texts: parseList(raw.texts, parseText, "texts"),
    audios: parseList(raw.audios, parseAudio, "audios"),
  };
}

function parseList<T>(raw: unknown, parse: (value: unknown) => T, label: string): T[] {
  if (!Array.isArray(raw)) throw new Error(`Invalid clipboard ${label}`);
  return raw.map(parse);
}

function parseStroke(raw: unknown): Stroke {
  if (!isRecord(raw) || typeof raw.id !== "string") throw new Error("Invalid clipboard stroke");
  if (!Array.isArray(raw.points) || raw.points.length === 0) {
    throw new Error("Invalid clipboard stroke points");
  }
  const points: StrokePoint[] = raw.points.map((p) => {
    if (!isRecord(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error("Invalid clipboard stroke point");
    }
    const pressure =
      typeof p.pressure === "number" && Number.isFinite(p.pressure) ? p.pressure : 0.5;
    return { x: p.x as number, y: p.y as number, pressure };
  });
  const color = typeof raw.color === "string" ? normalizeHex(raw.color) : null;
  if (!color) throw new Error("Invalid clipboard stroke color");
  if (typeof raw.size !== "number" || !Number.isFinite(raw.size) || raw.size <= 0) {
    throw new Error("Invalid clipboard stroke size");
  }
  if (raw.pen !== "pen" && raw.pen !== "highlighter") {
    throw new Error("Invalid clipboard stroke pen");
  }
  if (raw.shape !== undefined && !SHAPE_KINDS.includes(raw.shape as ShapeKind)) {
    throw new Error("Invalid clipboard stroke shape");
  }
  return {
    id: raw.id,
    points,
    color,
    size: raw.size,
    pen: raw.pen,
    simulatePressure: raw.simulatePressure === true,
    ...(raw.shape !== undefined ? { shape: raw.shape as ShapeKind } : {}),
  };
}

function parseImage(raw: unknown): ImageItem {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.imageId !== "string") {
    throw new Error("Invalid clipboard image");
  }
  return {
    id: raw.id,
    imageId: raw.imageId,
    x: finite(raw.x, "image x"),
    y: finite(raw.y, "image y"),
    width: positive(raw.width, "image width"),
    height: positive(raw.height, "image height"),
    ...(raw.locked === true ? { locked: true } : {}),
    ...(typeof raw.geometryId === "string" ? { geometryId: raw.geometryId } : {}),
    ...(raw.pdfSource !== undefined ? { pdfSource: parsePdfSource(raw.pdfSource) } : {}),
    ...(typeof raw.videoId === "string" ? { videoId: raw.videoId } : {}),
  };
}

function parsePdfSource(raw: unknown): PdfSource {
  if (!isRecord(raw) || typeof raw.docId !== "string") throw new Error("Invalid clipboard pdf");
  if (typeof raw.pageIndex !== "number" || !Number.isInteger(raw.pageIndex) || raw.pageIndex < 0) {
    throw new Error("Invalid clipboard pdf page");
  }
  if (raw.whiteBackground !== undefined && typeof raw.whiteBackground !== "boolean") {
    throw new Error("Invalid clipboard pdf background flag");
  }
  return {
    docId: raw.docId,
    pageIndex: raw.pageIndex,
    ...(raw.whiteBackground !== undefined ? { whiteBackground: raw.whiteBackground } : {}),
  };
}

function parseText(raw: unknown): TextItem {
  if (!isValidTextItem(raw)) throw new Error("Invalid clipboard text");
  return raw;
}

function parseAudio(raw: unknown): AudioItem {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.audioId !== "string") {
    throw new Error("Invalid clipboard audio");
  }
  return {
    id: raw.id,
    audioId: raw.audioId,
    x: finite(raw.x, "audio x"),
    y: finite(raw.y, "audio y"),
    width: positive(raw.width, "audio width"),
    height: positive(raw.height, "audio height"),
  };
}

function finite(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw))
    throw new Error(`Invalid clipboard ${label}`);
  return raw;
}

function positive(raw: unknown, label: string): number {
  const value = finite(raw, label);
  if (value <= 0) throw new Error(`Invalid clipboard ${label}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
