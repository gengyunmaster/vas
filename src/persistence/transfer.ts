import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { normalizeHex } from "../model/color";
import { type ImageItem, imageExtension } from "../model/image";
import { PAGE_PATTERNS, type Page, type PagePattern } from "../model/page";
import {
  newId,
  type PenKind,
  SHAPE_KINDS,
  type ShapeKind,
  type Stroke,
  type StrokePoint,
} from "../model/stroke";
import type { ViewState } from "../model/viewState";
import type { ImageRecord } from "./db";
import { deleteImages, getImage, saveImages } from "./images";
import {
  createNotebook,
  deleteNotebook,
  loadNotebook,
  replacePages,
  saveViewState,
} from "./notebooks";

export const FILE_FORMAT = "vas-notebook";
export const FILE_VERSION = 2;
export const NOTEBOOK_JSON_ENTRY = "notebook.json";

const FALLBACK_INK = "#1a1a1a";
const FALLBACK_PAPER = "#ffffff";
const FALLBACK_SIZE = 5;

export interface ImageManifestEntry {
  imageId: string;
  mimeType: string;
  sourceId?: string;
}

export function serializeNotebook(
  title: string,
  pages: Page[],
  images: ImageManifestEntry[] = [],
  viewState?: ViewState,
): string {
  return JSON.stringify(
    {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      title,
      ...(viewState ? { viewState } : {}),
      pages: pages.map((page) => ({
        paperColor: page.paperColor,
        pattern: page.pattern,
        strokes: page.strokes.map((stroke) => ({
          pen: stroke.pen,
          color: stroke.color,
          size: stroke.size,
          simulatePressure: stroke.simulatePressure,
          shape: stroke.shape,
          points: stroke.points,
        })),
        images: page.images.map((image) => ({
          imageId: image.imageId,
          x: image.x,
          y: image.y,
          width: image.width,
          height: image.height,
          ...(image.locked ? { locked: true } : {}),
        })),
      })),
      ...(images.length > 0
        ? { images: images.map((e) => ({ imageId: e.imageId, mimeType: e.mimeType })) }
        : {}),
    },
    null,
    2,
  );
}

export function parseNotebookFile(text: string): {
  title: string;
  pages: Page[];
  images: Required<ImageManifestEntry>[];
  viewState?: ViewState;
} {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || data.format !== FILE_FORMAT) {
    throw new Error("Not a vas notebook file");
  }
  if (data.version !== 1 && data.version !== FILE_VERSION) {
    throw new Error(`Unsupported file version: ${String(data.version)}`);
  }
  const title =
    typeof data.title === "string" && data.title.trim().length > 0
      ? data.title.trim()
      : "Imported notebook";
  if (!Array.isArray(data.pages) || data.pages.length === 0) {
    throw new Error("File contains no pages");
  }
  const images = parseImageManifest(data);
  const remap = new Map(images.map((entry) => [entry.sourceId, entry.imageId]));
  return {
    title,
    pages: data.pages.map((page) => parsePage(page, remap)),
    images,
    viewState: parseViewState(data.viewState),
  };
}

function parseViewState(raw: unknown): ViewState | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("Invalid view state");
  if (
    typeof raw.x !== "number" ||
    !Number.isFinite(raw.x) ||
    typeof raw.y !== "number" ||
    !Number.isFinite(raw.y) ||
    typeof raw.zoom !== "number" ||
    !Number.isFinite(raw.zoom) ||
    raw.zoom <= 0
  ) {
    throw new Error("Invalid view state");
  }
  return { x: raw.x, y: raw.y, zoom: raw.zoom };
}

export function buildNotebookZip(
  json: string,
  files: { path: string; data: Uint8Array }[],
): Uint8Array {
  const entries: Record<string, Uint8Array> = { [NOTEBOOK_JSON_ENTRY]: strToU8(json) };
  for (const file of files) entries[file.path] = file.data;
  return zipSync(entries);
}

export function imageEntryPath(imageId: string, mimeType: string): string {
  return `images/${imageId}.${imageExtension(mimeType)}`;
}

export function resolveImageEntries(
  entries: Record<string, Uint8Array>,
  manifest: Required<ImageManifestEntry>[],
): Uint8Array[] {
  return manifest.map((entry) => {
    const data = entries[imageEntryPath(entry.sourceId, entry.mimeType)];
    if (!data) throw new Error(`Missing image data for ${entry.sourceId}`);
    return data;
  });
}

export async function downloadNotebook(id: string): Promise<void> {
  const { meta, pages } = await loadNotebook(id);
  const referenced = new Set<string>();
  for (const page of pages) {
    for (const image of page.images) referenced.add(image.imageId);
  }
  if (referenced.size === 0) {
    const blob = new Blob([serializeNotebook(meta.title, pages, [], meta.viewState)], {
      type: "application/json",
    });
    downloadBlob(blob, `${meta.title}.vas.json`);
    return;
  }
  const records = new Map<string, ImageRecord>();
  for (const imageId of referenced) {
    const record = await getImage(imageId);
    if (record) records.set(imageId, record);
  }
  const cleanPages = pages.map((page) => ({
    ...page,
    images: page.images.filter((image) => records.has(image.imageId)),
  }));
  const manifest: ImageManifestEntry[] = [...records.values()].map((record) => ({
    imageId: record.id,
    mimeType: record.mimeType,
  }));
  const json = serializeNotebook(meta.title, cleanPages, manifest, meta.viewState);
  const files: { path: string; data: Uint8Array }[] = [];
  for (const record of records.values()) {
    files.push({
      path: imageEntryPath(record.id, record.mimeType),
      data: new Uint8Array(await record.blob.arrayBuffer()),
    });
  }
  const zip = buildNotebookZip(json, files);
  downloadBlob(
    new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }),
    `${meta.title}.vas.zip`,
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importNotebookFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return importNotebookZip(bytes);
  }
  const parsed = parseNotebookFile(strFromU8(bytes));
  if (parsed.images.length > 0) {
    throw new Error("This file references images; import the original .vas.zip archive instead");
  }
  const meta = await createNotebook(parsed.title);
  try {
    await replacePages(meta.id, parsed.pages);
    if (parsed.viewState) await saveViewState(meta.id, parsed.viewState);
  } catch (error) {
    await deleteNotebook(meta.id);
    throw error;
  }
  return meta.id;
}

async function importNotebookZip(bytes: Uint8Array): Promise<string> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("Invalid zip archive");
  }
  const jsonEntry = entries[NOTEBOOK_JSON_ENTRY];
  if (!jsonEntry) throw new Error("Archive contains no notebook.json");
  const parsed = parseNotebookFile(strFromU8(jsonEntry));
  const imageData = resolveImageEntries(entries, parsed.images);
  const records: ImageRecord[] = parsed.images.map((entry, index) => ({
    id: entry.imageId,
    mimeType: entry.mimeType,
    blob: new Blob([imageData[index].buffer as ArrayBuffer], { type: entry.mimeType }),
  }));
  const meta = await createNotebook(parsed.title);
  try {
    await saveImages(records);
    await replacePages(meta.id, parsed.pages);
    if (parsed.viewState) await saveViewState(meta.id, parsed.viewState);
  } catch (error) {
    await deleteNotebook(meta.id);
    await deleteImages(records.map((record) => record.id));
    throw error;
  }
  return meta.id;
}

function parseImageManifest(data: Record<string, unknown>): Required<ImageManifestEntry>[] {
  if (data.images === undefined) return [];
  if (!Array.isArray(data.images)) throw new Error("Invalid images manifest");
  return data.images.map((raw) => {
    if (!isRecord(raw) || typeof raw.imageId !== "string" || raw.imageId.length === 0) {
      throw new Error("Invalid image entry");
    }
    return {
      imageId: newId(),
      mimeType:
        typeof raw.mimeType === "string" && raw.mimeType.length > 0
          ? raw.mimeType
          : "application/octet-stream",
      sourceId: raw.imageId,
    };
  });
}

function parsePage(raw: unknown, remap: Map<string, string>): Page {
  if (!isRecord(raw)) throw new Error("Invalid page");
  if (!Array.isArray(raw.strokes)) throw new Error("Invalid page strokes");
  return {
    id: newId(),
    paperColor: parseColor(raw.paperColor, FALLBACK_PAPER),
    pattern: PAGE_PATTERNS.includes(raw.pattern as PagePattern)
      ? (raw.pattern as PagePattern)
      : "blank",
    strokes: raw.strokes.map(parseStroke),
    images: parsePageImages(raw.images, remap),
  };
}

function parsePageImages(raw: unknown, remap: Map<string, string>): ImageItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("Invalid page images");
  return raw.map((entry) => {
    if (!isRecord(entry) || typeof entry.imageId !== "string") throw new Error("Invalid image");
    const imageId = remap.get(entry.imageId);
    if (!imageId) throw new Error("Page references an unknown image");
    return {
      id: newId(),
      imageId,
      x: parseFiniteNumber(entry.x, "image x"),
      y: parseFiniteNumber(entry.y, "image y"),
      width: parsePositiveNumber(entry.width, "image width"),
      height: parsePositiveNumber(entry.height, "image height"),
      ...(entry.locked === true ? { locked: true } : {}),
    };
  });
}

function parseFiniteNumber(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new Error(`Invalid ${label}`);
  return raw;
}

function parsePositiveNumber(raw: unknown, label: string): number {
  const value = parseFiniteNumber(raw, label);
  if (value <= 0) throw new Error(`Invalid ${label}`);
  return value;
}

function parseStroke(raw: unknown): Stroke {
  if (!isRecord(raw)) throw new Error("Invalid stroke");
  if (!Array.isArray(raw.points)) throw new Error("Invalid stroke points");
  const points = raw.points.map(parsePoint);
  if (points.length === 0) throw new Error("Stroke has no points");
  const pen: PenKind = raw.pen === "highlighter" ? "highlighter" : "pen";
  const shape = SHAPE_KINDS.includes(raw.shape as ShapeKind) ? (raw.shape as ShapeKind) : undefined;
  return {
    id: newId(),
    pen,
    color: parseColor(raw.color, FALLBACK_INK),
    size:
      typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size > 0
        ? raw.size
        : FALLBACK_SIZE,
    simulatePressure: raw.simulatePressure === true,
    shape,
    points,
  };
}

function parsePoint(raw: unknown): StrokePoint {
  if (
    !isRecord(raw) ||
    typeof raw.x !== "number" ||
    !Number.isFinite(raw.x) ||
    typeof raw.y !== "number" ||
    !Number.isFinite(raw.y)
  ) {
    throw new Error("Invalid point");
  }
  return {
    x: raw.x,
    y: raw.y,
    pressure:
      typeof raw.pressure === "number" && Number.isFinite(raw.pressure) ? raw.pressure : 0.5,
  };
}

function parseColor(raw: unknown, fallback: string): string {
  return typeof raw === "string" ? (normalizeHex(raw) ?? fallback) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
