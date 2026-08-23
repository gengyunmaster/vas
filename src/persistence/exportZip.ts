import { zipSync } from "fflate";
import { downloadBlob } from "./transfer";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  return zipSync(Object.fromEntries(entries.map((entry) => [entry.name, entry.data])));
}

export function downloadZip(title: string, entries: ZipEntry[]): void {
  const bytes = buildZip(entries);
  downloadBlob(new Blob([bytes.slice()], { type: "application/zip" }), `${title}.zip`);
}
