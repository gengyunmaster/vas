import { placeImageCentered } from "../model/image";
import { createPage, type Page } from "../model/page";
import { newId } from "../model/stroke";
import { decryptPdf } from "./decryptPdf";
import { deleteImages, saveImages } from "./images";
import { createNotebook, deleteNotebook, replacePages } from "./notebooks";
import { deletePdfs, savePdf } from "./pdfs";

const PDF_RENDER_SCALE = 3;
const JPEG_QUALITY = 0.9;

export interface RasterizedPdfPage {
  imageId: string;
  mimeType: string;
  blob: Blob;
  naturalWidth: number;
  naturalHeight: number;
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
    blob: new Blob([sourceBytes.buffer as ArrayBuffer], { type: "application/pdf" }),
  });
  return docId;
}

export async function rasterizePdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
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
        ? "Incorrect password. Please try again:"
        : "This PDF is password protected. Enter its password:";
    const password = window.prompt(message);
    if (password === null) {
      cancelled = true;
      void task.destroy();
      return;
    }
    capturedPassword = password;
    updatePassword(password);
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
    const pages: RasterizedPdfPage[] = [];
    for (let index = 1; index <= doc.numPages; index++) {
      pages.push(await rasterizePage(doc, index));
      onProgress?.(index, doc.numPages);
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

export async function importPdfFile(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const { pages: rasterizedPages, sourceBytes } = await rasterizePdf(file, onProgress);
  const docId = await saveSourcePdf(sourceBytes);
  const pages: Page[] = rasterizedPages.map((raster, index) => {
    const page = createPage("#ffffff", "blank");
    page.images = [
      {
        id: newId(),
        imageId: raster.imageId,
        ...placeImageCentered(raster.naturalWidth, raster.naturalHeight),
        locked: true,
      },
    ];
    page.pdfSource = { docId, pageIndex: index };
    return page;
  });
  const title = file.name.replace(/\.pdf$/i, "").trim() || "Imported PDF";
  const meta = await createNotebook(title);
  try {
    await saveRasterizedImages(rasterizedPages);
    await replacePages(meta.id, pages);
  } catch (error) {
    await deleteNotebook(meta.id);
    await deleteImages(rasterizedPages.map((raster) => raster.imageId));
    await deletePdfs([docId]);
    throw error;
  }
  return meta.id;
}

async function rasterizePage(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  index: number,
): Promise<RasterizedPdfPage> {
  const pdfPage = await doc.getPage(index);
  const base = pdfPage.getViewport({ scale: 1 });
  const displayWidth = placeImageCentered(base.width, base.height).width;
  const viewport = pdfPage.getViewport({ scale: (displayWidth * PDF_RENDER_SCALE) / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await pdfPage.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error(`Failed to rasterize page ${index}`);
  canvas.width = 0;
  canvas.height = 0;
  return {
    imageId: newId(),
    mimeType: "image/jpeg",
    blob,
    naturalWidth: base.width,
    naturalHeight: base.height,
  };
}
