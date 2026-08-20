import { useBoardStore } from "../store/useBoardStore";
import { db, type PdfRecord } from "./db";

export async function savePdf(record: PdfRecord): Promise<void> {
  await (await db()).put("pdfs", record);
}

export async function getPdf(id: string): Promise<PdfRecord | undefined> {
  return (await db()).get("pdfs", id);
}

export async function deletePdfs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const tx = (await db()).transaction("pdfs", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

const retained = new Set<string>();

export function retainPdfs(ids: string[]): () => void {
  for (const id of ids) retained.add(id);
  return () => {
    for (const id of ids) retained.delete(id);
  };
}

export async function gcUnreferencedPdfs(): Promise<void> {
  const database = await db();
  const keep = new Set<string>();
  for (const page of await database.getAll("pages")) {
    if (page.pdfSource) keep.add(page.pdfSource.docId);
  }
  for (const page of useBoardStore.getState().pages) {
    if (page.pdfSource) keep.add(page.pdfSource.docId);
  }
  for (const id of retained) keep.add(id);
  const tx = database.transaction("pdfs", "readwrite");
  const keys = await tx.store.getAllKeys();
  for (const key of keys) {
    if (!keep.has(key)) await tx.store.delete(key);
  }
  await tx.done;
}
