import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { AudioItem } from "../model/audioItem";
import { normalizeHex } from "../model/color";
import { type ImageItem, imageExtension } from "../model/image";
import {
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  PAGE_HEIGHT,
  PAGE_PATTERNS,
  PAGE_WIDTH,
  type Page,
  type PagePattern,
  type PdfSource,
} from "../model/page";
import {
  newId,
  type PenKind,
  SHAPE_KINDS,
  type ShapeKind,
  type Stroke,
  type StrokePoint,
} from "../model/stroke";
import {
  dropUnknownTextImageRefs,
  MAX_TEXT_MARKDOWN_LENGTH,
  MIN_TEXT_WIDTH,
  remapTextImageRefs,
  type TextItem,
  textImageRefs,
} from "../model/textItem";
import type { ViewState } from "../model/viewState";
import type { GeometryRecord, ImageRecord, MediaRecord, PdfRecord } from "./db";
import { deleteGeometries, getGeometry, saveGeometries } from "./geometries";
import { deleteImages, getImage, retainImages, saveImages } from "./images";
import { deleteMedias, getMedia, retainMedias, saveMedias } from "./media";
import {
  createNotebook,
  deleteNotebook,
  loadNotebook,
  replacePages,
  saveViewState,
} from "./notebooks";
import { deletePdfs, getPdf, retainPdfs, savePdf } from "./pdfs";

export const FILE_FORMAT = "vas-notebook";
// v6 adds video (image items with videoId + media table blobs) and per-page
// audio badges; older versions read fine because audios default to an empty
// list and image items without videoId are plain images.
export const FILE_VERSION = 6;
export const NOTEBOOK_JSON_ENTRY = "notebook.json";

const FALLBACK_INK = "#1a1a1a";
const FALLBACK_PAPER = "#ffffff";
const FALLBACK_SIZE = 5;

export interface ImageManifestEntry {
  imageId: string;
  mimeType: string;
  sourceId?: string;
}

export interface PdfManifestEntry {
  docId: string;
  sourceId?: string;
}

export interface GeometryManifestEntry {
  geometryId: string;
  sourceId?: string;
}

export interface MediaManifestEntry {
  mediaId: string;
  kind: "video" | "audio";
  mimeType: string;
  sourceId?: string;
}

export function serializeNotebook(
  title: string,
  pages: Page[],
  images: ImageManifestEntry[] = [],
  viewState?: ViewState,
  pdfs: PdfManifestEntry[] = [],
  geometries: GeometryManifestEntry[] = [],
  media: MediaManifestEntry[] = [],
): string {
  return JSON.stringify(
    {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      title,
      ...(viewState ? { viewState } : {}),
      pages: pages.map((page) => ({
        width: page.width,
        height: page.height,
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
          ...(image.geometryId ? { geometryId: image.geometryId } : {}),
          ...(image.pdfSource ? { pdfSource: image.pdfSource } : {}),
          ...(image.videoId ? { videoId: image.videoId } : {}),
        })),
        texts: page.texts.map((text) => ({
          x: text.x,
          y: text.y,
          width: text.width,
          fontSize: text.fontSize,
          color: text.color,
          markdown: text.markdown,
        })),
        audios: page.audios.map((audio) => ({
          audioId: audio.audioId,
          x: audio.x,
          y: audio.y,
          width: audio.width,
          height: audio.height,
        })),
        ...(page.pdfSource ? { pdfSource: page.pdfSource } : {}),
      })),
      ...(images.length > 0
        ? { images: images.map((e) => ({ imageId: e.imageId, mimeType: e.mimeType })) }
        : {}),
      ...(pdfs.length > 0 ? { pdfs: pdfs.map((e) => ({ docId: e.docId })) } : {}),
      ...(geometries.length > 0
        ? { geometries: geometries.map((e) => ({ geometryId: e.geometryId })) }
        : {}),
      ...(media.length > 0
        ? {
            media: media.map((e) => ({
              mediaId: e.mediaId,
              kind: e.kind,
              mimeType: e.mimeType,
            })),
          }
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
  pdfs: Required<PdfManifestEntry>[];
  geometries: Required<GeometryManifestEntry>[];
  media: Required<MediaManifestEntry>[];
  viewState?: ViewState;
} {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || data.format !== FILE_FORMAT) {
    throw new Error("Not a vas notebook file");
  }
  if (typeof data.version !== "number" || data.version < 1 || data.version > FILE_VERSION) {
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
  const pdfs = parsePdfManifest(data);
  const geometries = parseGeometryManifest(data);
  const media = parseMediaManifest(data);
  const remap = new Map(images.map((entry) => [entry.sourceId, entry.imageId]));
  const pdfRemap = new Map(pdfs.map((entry) => [entry.sourceId, entry.docId]));
  const geometryRemap = new Map(geometries.map((entry) => [entry.sourceId, entry.geometryId]));
  const mediaRemap = new Map(media.map((entry) => [entry.sourceId, entry.mediaId]));
  return {
    title,
    pages: data.pages.map((page) => parsePage(page, remap, pdfRemap, geometryRemap, mediaRemap)),
    images,
    pdfs,
    geometries,
    media,
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

export function pdfEntryPath(docId: string): string {
  return `pdfs/${docId}.pdf`;
}

export function geometryEntryPath(geometryId: string): string {
  return `geometries/${geometryId}.json`;
}

export function mediaEntryPath(mediaId: string, mimeType: string): string {
  return `media/${mediaId}.${mediaExtension(mimeType)}`;
}

function mediaExtension(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "";
  switch (subtype) {
    case "webm":
      return "webm";
    case "mp4":
      return "mp4";
    case "quicktime":
      return "mov";
    case "ogg":
      return "ogg";
    case "mpeg":
      return "mp3";
    case "wav":
    case "x-wav":
      return "wav";
    case "mp4a-latm":
      return "m4a";
    default:
      return subtype.replace(/[^a-z0-9]/g, "") || "bin";
  }
}

export function resolveMediaEntries(
  entries: Record<string, Uint8Array>,
  manifest: Required<MediaManifestEntry>[],
): Uint8Array[] {
  return manifest.map((entry) => {
    const data = entries[mediaEntryPath(entry.sourceId, entry.mimeType)];
    if (!data) throw new Error(`Missing media data for ${entry.sourceId}`);
    return data;
  });
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

export function resolvePdfEntries(
  entries: Record<string, Uint8Array>,
  manifest: Required<PdfManifestEntry>[],
): Uint8Array[] {
  return manifest.map((entry) => {
    const data = entries[pdfEntryPath(entry.sourceId)];
    if (!data) throw new Error(`Missing PDF data for ${entry.sourceId}`);
    return data;
  });
}

export function resolveGeometryEntries(
  entries: Record<string, Uint8Array>,
  manifest: Required<GeometryManifestEntry>[],
): Uint8Array[] {
  return manifest.map((entry) => {
    const data = entries[geometryEntryPath(entry.sourceId)];
    if (!data) throw new Error(`Missing geometry data for ${entry.sourceId}`);
    return data;
  });
}

export async function downloadNotebook(id: string): Promise<void> {
  const { meta, pages } = await loadNotebook(id);
  const referenced = new Set<string>();
  const referencedPdfs = new Set<string>();
  const referencedGeometries = new Set<string>();
  const referencedMedia = new Set<string>();
  for (const page of pages) {
    for (const image of page.images) {
      referenced.add(image.imageId);
      if (image.geometryId) referencedGeometries.add(image.geometryId);
      if (image.pdfSource) referencedPdfs.add(image.pdfSource.docId);
      if (image.videoId) referencedMedia.add(image.videoId);
    }
    for (const text of page.texts) {
      for (const imageId of textImageRefs(text.markdown)) referenced.add(imageId);
    }
    for (const audio of page.audios) referencedMedia.add(audio.audioId);
    if (page.pdfSource) referencedPdfs.add(page.pdfSource.docId);
  }
  const records = new Map<string, ImageRecord>();
  for (const imageId of referenced) {
    const record = await getImage(imageId);
    if (record) records.set(imageId, record);
  }
  const pdfRecords = new Map<string, PdfRecord>();
  for (const docId of referencedPdfs) {
    const record = await getPdf(docId);
    if (record) pdfRecords.set(docId, record);
  }
  const geometryRecords = new Map<string, GeometryRecord>();
  for (const geometryId of referencedGeometries) {
    const record = await getGeometry(geometryId);
    if (record) geometryRecords.set(geometryId, record);
  }
  const mediaRecords = new Map<string, MediaRecord>();
  for (const mediaId of referencedMedia) {
    const record = await getMedia(mediaId);
    if (record) mediaRecords.set(mediaId, record);
  }
  const cleanPages = pages.map((page) => ({
    ...page,
    images: page.images
      .filter((image) => records.has(image.imageId))
      .map((image) => {
        let clean = image;
        if (clean.geometryId && !geometryRecords.has(clean.geometryId)) {
          clean = { ...clean, geometryId: undefined };
        }
        if (clean.pdfSource && !pdfRecords.has(clean.pdfSource.docId)) {
          clean = { ...clean, pdfSource: undefined };
        }
        if (clean.videoId && !mediaRecords.has(clean.videoId)) {
          clean = { ...clean, videoId: undefined };
        }
        return clean;
      }),
    texts: page.texts.map((text) => ({
      ...text,
      markdown: dropUnknownTextImageRefs(text.markdown, (imageId) => records.has(imageId)),
    })),
    audios: page.audios.filter((audio) => mediaRecords.has(audio.audioId)),
    ...(page.pdfSource && !pdfRecords.has(page.pdfSource.docId) ? { pdfSource: undefined } : {}),
  }));
  const manifest: ImageManifestEntry[] = [...records.values()].map((record) => ({
    imageId: record.id,
    mimeType: record.mimeType,
  }));
  const pdfManifest: PdfManifestEntry[] = [...pdfRecords.keys()].map((docId) => ({ docId }));
  const geometryManifest: GeometryManifestEntry[] = [...geometryRecords.keys()].map(
    (geometryId) => ({ geometryId }),
  );
  const mediaManifest: MediaManifestEntry[] = [...mediaRecords.values()].map((record) => ({
    mediaId: record.id,
    kind: record.kind,
    mimeType: record.mimeType,
  }));
  const json = serializeNotebook(
    meta.title,
    cleanPages,
    manifest,
    meta.viewState,
    pdfManifest,
    geometryManifest,
    mediaManifest,
  );
  if (
    records.size === 0 &&
    pdfRecords.size === 0 &&
    geometryRecords.size === 0 &&
    mediaRecords.size === 0
  ) {
    downloadBlob(new Blob([json], { type: "application/json" }), `${meta.title}.vas.json`);
    return;
  }
  const files: { path: string; data: Uint8Array }[] = [];
  for (const record of records.values()) {
    files.push({
      path: imageEntryPath(record.id, record.mimeType),
      data: new Uint8Array(await record.blob.arrayBuffer()),
    });
  }
  for (const record of pdfRecords.values()) {
    files.push({
      path: pdfEntryPath(record.id),
      data: new Uint8Array(await record.blob.arrayBuffer()),
    });
  }
  for (const record of geometryRecords.values()) {
    files.push({
      path: geometryEntryPath(record.id),
      data: strToU8(record.document),
    });
  }
  for (const record of mediaRecords.values()) {
    files.push({
      path: mediaEntryPath(record.id, record.mimeType),
      data: new Uint8Array(await record.blob.arrayBuffer()),
    });
  }
  const zip = buildNotebookZip(json, files);
  downloadBlob(new Blob([zip.slice()], { type: "application/zip" }), `${meta.title}.vas.zip`);
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFileName(filename);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importNotebookFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return importNotebookZip(bytes);
  }
  const parsed = parseNotebookFile(strFromU8(bytes));
  if (parsed.images.length > 0 || parsed.pdfs.length > 0 || parsed.media.length > 0) {
    throw new Error(
      "This file references binary assets; import the original .vas.zip archive instead",
    );
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
    blob: new Blob([imageData[index].slice()], { type: entry.mimeType }),
  }));
  const pdfData = resolvePdfEntries(entries, parsed.pdfs);
  const pdfRecords: PdfRecord[] = parsed.pdfs.map((entry, index) => ({
    id: entry.docId,
    blob: new Blob([pdfData[index].slice()], { type: "application/pdf" }),
  }));
  const geometryData = resolveGeometryEntries(entries, parsed.geometries);
  const geometryRecords: GeometryRecord[] = parsed.geometries.map((entry, index) => ({
    id: entry.geometryId,
    document: strFromU8(geometryData[index]),
  }));
  const mediaData = resolveMediaEntries(entries, parsed.media);
  const mediaRecords: MediaRecord[] = parsed.media.map((entry, index) => ({
    id: entry.mediaId,
    kind: entry.kind,
    mimeType: entry.mimeType,
    blob: new Blob([mediaData[index].slice()], { type: entry.mimeType }),
  }));
  const releaseImages = retainImages(parsed.images.map((entry) => entry.imageId));
  const releasePdfs = retainPdfs(parsed.pdfs.map((entry) => entry.docId));
  const releaseMedias = retainMedias(parsed.media.map((entry) => entry.mediaId));
  try {
    const meta = await createNotebook(parsed.title);
    try {
      await saveImages(records);
      for (const record of pdfRecords) await savePdf(record);
      await saveGeometries(geometryRecords);
      await saveMedias(mediaRecords);
      await replacePages(meta.id, parsed.pages);
      if (parsed.viewState) await saveViewState(meta.id, parsed.viewState);
    } catch (error) {
      await deleteNotebook(meta.id);
      await deleteImages(records.map((record) => record.id)).catch(() => {});
      await deletePdfs(pdfRecords.map((record) => record.id)).catch(() => {});
      await deleteGeometries(geometryRecords.map((record) => record.id)).catch(() => {});
      await deleteMedias(mediaRecords.map((record) => record.id)).catch(() => {});
      throw error;
    }
    return meta.id;
  } finally {
    releaseImages();
    releasePdfs();
    releaseMedias();
  }
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

function parsePdfManifest(data: Record<string, unknown>): Required<PdfManifestEntry>[] {
  if (data.pdfs === undefined) return [];
  if (!Array.isArray(data.pdfs)) throw new Error("Invalid pdfs manifest");
  return data.pdfs.map((raw) => {
    if (!isRecord(raw) || typeof raw.docId !== "string" || raw.docId.length === 0) {
      throw new Error("Invalid pdf entry");
    }
    return { docId: newId(), sourceId: raw.docId };
  });
}

function parseGeometryManifest(data: Record<string, unknown>): Required<GeometryManifestEntry>[] {
  if (data.geometries === undefined) return [];
  if (!Array.isArray(data.geometries)) throw new Error("Invalid geometries manifest");
  return data.geometries.map((raw) => {
    if (!isRecord(raw) || typeof raw.geometryId !== "string" || raw.geometryId.length === 0) {
      throw new Error("Invalid geometry entry");
    }
    return { geometryId: newId(), sourceId: raw.geometryId };
  });
}

function parseMediaManifest(data: Record<string, unknown>): Required<MediaManifestEntry>[] {
  if (data.media === undefined) return [];
  if (!Array.isArray(data.media)) throw new Error("Invalid media manifest");
  return data.media.map((raw) => {
    if (!isRecord(raw) || typeof raw.mediaId !== "string" || raw.mediaId.length === 0) {
      throw new Error("Invalid media entry");
    }
    if (raw.kind !== "video" && raw.kind !== "audio") throw new Error("Invalid media kind");
    return {
      mediaId: newId(),
      kind: raw.kind,
      mimeType:
        typeof raw.mimeType === "string" && raw.mimeType.length > 0
          ? raw.mimeType
          : "application/octet-stream",
      sourceId: raw.mediaId,
    };
  });
}

function parsePdfSource(raw: unknown, pdfRemap: Map<string, string>): PdfSource | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || typeof raw.docId !== "string") throw new Error("Invalid pdf source");
  const docId = pdfRemap.get(raw.docId);
  if (!docId) throw new Error("Page references an unknown pdf");
  if (typeof raw.pageIndex !== "number" || !Number.isInteger(raw.pageIndex) || raw.pageIndex < 0) {
    throw new Error("Invalid pdf source page index");
  }
  return { docId, pageIndex: raw.pageIndex };
}

function parsePage(
  raw: unknown,
  remap: Map<string, string>,
  pdfRemap: Map<string, string>,
  geometryRemap: Map<string, string>,
  mediaRemap: Map<string, string>,
): Page {
  if (!isRecord(raw)) throw new Error("Invalid page");
  if (!Array.isArray(raw.strokes)) throw new Error("Invalid page strokes");
  return {
    id: newId(),
    width: parseOptionalPageSize(raw.width, PAGE_WIDTH, "page width"),
    height: parseOptionalPageSize(raw.height, PAGE_HEIGHT, "page height"),
    paperColor: parseColor(raw.paperColor, FALLBACK_PAPER),
    pattern: PAGE_PATTERNS.includes(raw.pattern as PagePattern)
      ? (raw.pattern as PagePattern)
      : "blank",
    strokes: raw.strokes.map(parseStroke),
    images: parsePageImages(raw.images, remap, pdfRemap, geometryRemap, mediaRemap),
    texts: parsePageTexts(raw.texts, remap),
    audios: parsePageAudios(raw.audios, mediaRemap),
    ...(raw.pdfSource !== undefined ? { pdfSource: parsePdfSource(raw.pdfSource, pdfRemap) } : {}),
  };
}

function parsePageAudios(raw: unknown, mediaRemap: Map<string, string>): AudioItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("Invalid page audios");
  return raw.map((entry) => {
    if (!isRecord(entry) || typeof entry.audioId !== "string") throw new Error("Invalid audio");
    const audioId = mediaRemap.get(entry.audioId);
    if (!audioId) throw new Error("Page references an unknown media");
    return {
      id: newId(),
      audioId,
      x: parseFiniteNumber(entry.x, "audio x"),
      y: parseFiniteNumber(entry.y, "audio y"),
      width: parsePositiveNumber(entry.width, "audio width"),
      height: parsePositiveNumber(entry.height, "audio height"),
    };
  });
}

function parsePageTexts(raw: unknown, remap: Map<string, string>): TextItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("Invalid page texts");
  return raw.map((entry) => {
    if (!isRecord(entry) || typeof entry.markdown !== "string") throw new Error("Invalid text");
    if (entry.markdown.length > MAX_TEXT_MARKDOWN_LENGTH) throw new Error("Text is too long");
    const fontSize = parseFiniteNumber(entry.fontSize, "text font size");
    if (fontSize < 6 || fontSize > 200) throw new Error("Invalid text font size");
    const width = parseFiniteNumber(entry.width, "text width");
    if (width < MIN_TEXT_WIDTH) throw new Error("Invalid text width");
    return {
      id: newId(),
      x: parseFiniteNumber(entry.x, "text x"),
      y: parseFiniteNumber(entry.y, "text y"),
      width,
      fontSize,
      color: parseColor(entry.color, FALLBACK_INK),
      markdown: remapTextImageRefs(entry.markdown, remap),
    };
  });
}

function parsePageImages(
  raw: unknown,
  remap: Map<string, string>,
  pdfRemap: Map<string, string>,
  geometryRemap: Map<string, string>,
  mediaRemap: Map<string, string>,
): ImageItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("Invalid page images");
  return raw.map((entry) => {
    if (!isRecord(entry) || typeof entry.imageId !== "string") throw new Error("Invalid image");
    const imageId = remap.get(entry.imageId);
    if (!imageId) throw new Error("Page references an unknown image");
    let geometryId: string | undefined;
    if (entry.geometryId !== undefined) {
      if (typeof entry.geometryId !== "string") throw new Error("Invalid image geometry reference");
      geometryId = geometryRemap.get(entry.geometryId);
      if (!geometryId) throw new Error("Image references an unknown geometry");
    }
    const pdfSource =
      entry.pdfSource !== undefined ? parsePdfSource(entry.pdfSource, pdfRemap) : undefined;
    let videoId: string | undefined;
    if (entry.videoId !== undefined) {
      if (typeof entry.videoId !== "string") throw new Error("Invalid image video reference");
      videoId = mediaRemap.get(entry.videoId);
      if (!videoId) throw new Error("Image references an unknown media");
    }
    return {
      id: newId(),
      imageId,
      x: parseFiniteNumber(entry.x, "image x"),
      y: parseFiniteNumber(entry.y, "image y"),
      width: parsePositiveNumber(entry.width, "image width"),
      height: parsePositiveNumber(entry.height, "image height"),
      ...(entry.locked === true ? { locked: true } : {}),
      ...(geometryId ? { geometryId } : {}),
      ...(pdfSource ? { pdfSource } : {}),
      ...(videoId ? { videoId } : {}),
    };
  });
}

function parseFiniteNumber(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new Error(`Invalid ${label}`);
  return raw;
}

function parseOptionalPageSize(raw: unknown, fallback: number, label: string): number {
  if (raw === undefined) return fallback;
  const value = parseFiniteNumber(raw, label);
  if (value < MIN_PAGE_SIZE || value > MAX_PAGE_SIZE) throw new Error(`Invalid ${label}`);
  return value;
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
