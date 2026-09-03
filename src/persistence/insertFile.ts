import { insertPdfImageFile } from "./importPdf";
import { insertImageFile } from "./insertImage";
import { insertMediaFile } from "./insertMedia";

// Shared dispatch for every file entry point (picker, clipboard paste).
export function isInsertableFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/") ||
    isPdfFile(file)
  );
}

export async function insertFile(file: File): Promise<void> {
  if (isPdfFile(file)) return insertPdfImageFile(file);
  if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
    return insertMediaFile(file);
  }
  if (file.type.startsWith("image/")) return insertImageFile(file);
  throw new Error("Unsupported file type.");
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
