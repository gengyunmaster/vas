import type { GeoDocument } from "../model";
import { createDocument, parseDocument } from "../model";

export function parseDocumentSafely(text: string | null): GeoDocument {
  if (!text) return createDocument();
  try {
    return parseDocument(text);
  } catch {
    console.warn("Discarding unreadable geometry document");
    return createDocument();
  }
}

export function timestampedFilename(extension: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `webgeo-${stamp}.${extension}`;
}

export function downloadText(filename: string, text: string, mimeType: string): void {
  downloadBlob(filename, new Blob([text], { type: mimeType }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, reject);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
