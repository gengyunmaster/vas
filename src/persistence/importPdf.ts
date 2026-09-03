import { decodeBlob, primeImage } from "../engine/imageCache";
import { placeImageCentered } from "../model/image";
import { PDF_PAGE_SCALE, pdfPageSize } from "../model/pageSize";
import { buildPdfPages, pdfInsertIndex } from "../model/pdfPage";
import { newId } from "../model/stroke";
import { askPrompt } from "../store/dialogs";
import { askPageRange } from "../store/pdfRangePrompt";
import { useBoardStore } from "../store/useBoardStore";
import { decryptPdf } from "./decryptPdf";
import { deleteImages, retainImages, saveImages } from "./images";
import { createNotebook, deleteNotebook, loadNotebook, replacePages } from "./notebooks";
import { deletePdfs, getPdf, retainPdfs, savePdf } from "./pdfs";
import { cappedRenderScale } from "./rasterize";

const PDF_RENDER_SCALE = 3;
const JPEG_QUALITY = 0.9;
// rasterization is pinned to the PDF's own point size, independent of the target page size
const BASE_RASTER_SCALE = PDF_RENDER_SCALE * PDF_PAGE_SCALE;

export interface RasterizedPdfPage {
  imageId: string;
  mimeType: string;
  blob: Blob;
  naturalWidth: number;
  naturalHeight: number;
  // 0-based page index into the source PDF, kept for the export-time vector embedding.
  pageIndex: number;
  // whether the raster was rendered onto an opaque white backdrop
  whiteBackground: boolean;
}

export interface RasterizedPdf {
  pages: RasterizedPdfPage[];
  sourceBytes: Uint8Array;
}

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  pdfjsPromise.catch(() => {
    pdfjsPromise = null;
  });
  return pdfjsPromise;
}

export async function saveRasterizedImages(rasterized: RasterizedPdfPage[]): Promise<void> {
  await saveImages(rasterized.map((raster) => ({ ...raster, id: raster.imageId })));
}

export async function saveSourcePdf(sourceBytes: Uint8Array): Promise<string> {
  const docId = newId();
  await savePdf({
    id: docId,
    blob: new Blob([sourceBytes.slice()], { type: "application/pdf" }),
  });
  return docId;
}

export async function rasterizePdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
  options: { promptMode?: "range" | "single" } = {},
): Promise<RasterizedPdf> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  let cancelled = false;
  let capturedPassword: string | undefined;
  // pdf.js detaches the buffer passed to getDocument; hand it a copy so `data` stays intact
  const task = pdfjs.getDocument({ data: data.slice() });
  task.onPassword = (updatePassword: (password: string) => void, reason: number) => {
    const message =
      reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD
        ? "Incorrect password. Please try again."
        : "This PDF is password protected. Enter its password to continue.";
    // pdf.js simply waits until updatePassword is called, so the prompt may be async.
    void askPrompt({
      title: "Password required",
      text: message,
      confirmLabel: "Unlock",
      password: true,
    }).then((password) => {
      if (password === null) {
        cancelled = true;
        void task.destroy();
        return;
      }
      capturedPassword = password;
      updatePassword(password);
    });
  };
  let doc: import("pdfjs-dist").PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (error) {
    if (cancelled) throw new Error("Import cancelled: password required");
    throw error;
  }
  try {
    if (doc.numPages < 1) throw new Error("This PDF contains no pages");
    const range = await askPageRange(doc.numPages, options.promptMode ?? "range");
    if (!range) throw new Error("Import cancelled");
    const transparent = !(range.whiteBackground ?? false);
    const pages: RasterizedPdfPage[] = [];
    const total = range.to - range.from + 1;
    for (let index = range.from; index <= range.to; index++) {
      pages.push(await rasterizePage(doc, index, transparent));
      onProgress?.(pages.length, total);
    }
    let sourceBytes: Uint8Array = data;
    try {
      sourceBytes = await decryptPdf(data, capturedPassword);
    } catch {
      // decryption failed: keep the original bytes, export falls back to the raster base image
    }
    return { pages, sourceBytes };
  } finally {
    void task.destroy();
  }
}

export async function insertPdfImageFile(file: File): Promise<void> {
  const { pages, sourceBytes } = await rasterizePdf(file, undefined, {
    promptMode: "single",
  });
  const raster = pages[0];
  if (!raster) throw new Error("This PDF contains no pages");
  const releaseImage = retainImages([raster.imageId]);
  let releasePdf: (() => void) | undefined;
  let docId: string | undefined;
  try {
    docId = await saveSourcePdf(sourceBytes);
    releasePdf = retainPdfs([docId]);
    await saveRasterizedImages([raster]);
    primeImage(raster.imageId, await decodeBlob(raster.blob));
    useBoardStore
      .getState()
      .insertImage(
        raster.imageId,
        raster.naturalWidth * PDF_PAGE_SCALE,
        raster.naturalHeight * PDF_PAGE_SCALE,
        {
          pdfSource: {
            docId,
            pageIndex: raster.pageIndex,
            whiteBackground: raster.whiteBackground,
          },
        },
      );
  } catch (error) {
    await deleteImages([raster.imageId]).catch(() => {});
    if (docId) await deletePdfs([docId]).catch(() => {});
    throw error;
  } finally {
    releaseImage();
    releasePdf?.();
  }
}

export async function importPdfFile(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const { pages: rasterizedPages, sourceBytes } = await rasterizePdf(file, onProgress);
  const title = file.name.replace(/\.pdf$/i, "").trim() || "Imported PDF";
  const releaseImages = retainImages(rasterizedPages.map((raster) => raster.imageId));
  let releasePdf: (() => void) | undefined;
  try {
    const docId = await saveSourcePdf(sourceBytes);
    releasePdf = retainPdfs([docId]);
    const meta = await createNotebook(title);
    try {
      await saveRasterizedImages(rasterizedPages);
      await replacePages(
        meta.id,
        buildPdfPages(
          rasterizedPages,
          "#ffffff",
          "blank",
          (pdfPage) => pdfPageSize(pdfPage.naturalWidth, pdfPage.naturalHeight),
          docId,
        ),
      );
    } catch (error) {
      await deleteNotebook(meta.id);
      await deleteImages(rasterizedPages.map((raster) => raster.imageId));
      await deletePdfs([docId]);
      throw error;
    }
    return meta.id;
  } finally {
    releaseImages();
    releasePdf?.();
  }
}

export async function importPdfIntoNotebook(
  notebookId: string,
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { pages, sourceBytes } = await rasterizePdf(file, onProgress);
  const releaseImages = retainImages(pages.map((page) => page.imageId));
  let docId: string | undefined;
  let releasePdf: (() => void) | undefined;
  try {
    docId = await saveSourcePdf(sourceBytes);
    releasePdf = retainPdfs([docId]);
    await saveRasterizedImages(pages);
    const state = useBoardStore.getState();
    if (state.notebookId === notebookId) {
      state.insertPdfPages(pages, { docId });
      return;
    }
    const { meta, pages: existing } = await loadNotebook(notebookId);
    const insertIndex = pdfInsertIndex(meta.viewState, existing);
    const base = existing[insertIndex - 1] ?? existing[existing.length - 1];
    const next = [...existing];
    next.splice(
      insertIndex,
      0,
      ...buildPdfPages(
        pages,
        base.paperColor,
        base.pattern,
        () => ({ width: base.width, height: base.height }),
        docId,
      ),
    );
    // the user may have reopened the notebook while pages were loading
    const reopened = useBoardStore.getState();
    if (reopened.notebookId === notebookId) {
      reopened.insertPdfPages(pages, { docId });
      return;
    }
    await replacePages(notebookId, next);
  } catch (error) {
    await deleteImages(pages.map((page) => page.imageId)).catch(() => {});
    if (docId) await deletePdfs([docId]).catch(() => {});
    throw error;
  } finally {
    releaseImages();
    releasePdf?.();
  }
}

async function rasterizePage(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  index: number,
  transparent: boolean,
): Promise<RasterizedPdfPage> {
  const pdfPage = await doc.getPage(index);
  const base = pdfPage.getViewport({ scale: 1 });
  const scale = cappedRenderScale(BASE_RASTER_SCALE, base.width, base.height);
  const { blob, mimeType } = await renderPdfPage(pdfPage, scale, transparent);
  return {
    imageId: newId(),
    mimeType,
    blob,
    naturalWidth: base.width,
    naturalHeight: base.height,
    pageIndex: index - 1,
    whiteBackground: !transparent,
  };
}

async function renderPdfPage(
  pdfPage: import("pdfjs-dist").PDFPageProxy,
  scale: number,
  transparent: boolean,
): Promise<{ blob: Blob; mimeType: string }> {
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  // pdf.js grabs the 2d context as alpha: false; claim it first on the
  // transparent path so the page can stay transparent where nothing is painted.
  if (transparent) canvas.getContext("2d", { willReadFrequently: true });
  await pdfPage.render({
    canvas,
    viewport,
    // pdf.js always fills a backdrop (white by default); an alpha-0 fill is a
    // no-op, so pages without their own painted background stay transparent
    // while real content — including white pixels inside embedded images — is
    // preserved, matching the vector embed used by PDF export.
    background: transparent ? "rgba(255,255,255,0)" : "#ffffff",
  }).promise;
  const alpha = transparent && canvasHasTransparency(canvas);
  const mimeType = alpha ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, JPEG_QUALITY),
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("Failed to rasterize PDF page");
  return { blob, mimeType };
}

function canvasHasTransparency(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 255) return true;
  }
  return false;
}

// After a page resize the stored base image may no longer cover the larger
// placement at 3x sharpness; re-render from the original PDF and swap the blob.
export async function reRasterizePdfBase(pageId: string): Promise<void> {
  const state = useBoardStore.getState();
  const page = state.pages.find((p) => p.id === pageId);
  const source = page?.pdfSource;
  if (!page || !source) return;
  const record = await getPdf(source.docId);
  if (!record) return;
  const data = new Uint8Array(await record.blob.arrayBuffer());
  let task: import("pdfjs-dist").PDFDocumentLoadingTask;
  let doc: import("pdfjs-dist").PDFDocumentProxy;
  try {
    const pdfjs = await loadPdfJs();
    task = pdfjs.getDocument({ data });
    task.onPassword = () => void task.destroy();
    doc = await task.promise;
  } catch {
    return;
  }
  try {
    const pdfPage = await doc.getPage(source.pageIndex + 1);
    const base = pdfPage.getViewport({ scale: 1 });
    const displayWidth = placeImageCentered(base.width, base.height, page.width, page.height).width;
    const scale = cappedRenderScale(
      (displayWidth * PDF_RENDER_SCALE) / base.width,
      base.width,
      base.height,
    );
    if (scale <= BASE_RASTER_SCALE) return;
    // legacy base pages predate the background choice and rendered opaque white
    const transparent = !(source.whiteBackground ?? true);
    const { blob, mimeType } = await renderPdfPage(pdfPage, scale, transparent);
    const fresh = useBoardStore.getState().pages.find((p) => p.id === pageId);
    if (
      !fresh ||
      fresh.pdfSource?.docId !== source.docId ||
      fresh.pdfSource.pageIndex !== source.pageIndex
    ) {
      return;
    }
    const imageId = newId();
    await saveImages([{ id: imageId, mimeType, blob }]);
    useBoardStore.getState().replacePdfBaseImage(pageId, imageId);
  } catch {
    // a failed re-render keeps the previous base image
  } finally {
    void task.destroy();
  }
}
