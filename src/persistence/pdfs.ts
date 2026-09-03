import { useBoardStore } from "../store/useBoardStore";
import { db, type PdfRecord } from "./db";
import { sweepUnreferenced } from "./gc";

// Same content-addressable write contract as images.ts.
export async function savePdf(record: PdfRecord): Promise<boolean> {
  const database = await db();
  if (await database.get("pdfs", record.id)) return false;
  await database.put("pdfs", record);
  return true;
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
  const collect = (page: {
    pdfSource?: { docId: string };
    images?: { pdfSource?: { docId: string } }[];
  }) => {
    if (page.pdfSource) keep.add(page.pdfSource.docId);
    for (const image of page.images ?? []) {
      if (image.pdfSource) keep.add(image.pdfSource.docId);
    }
  };
  for (const page of await database.getAll("pages")) collect(page);
  for (const page of useBoardStore.getState().pages) collect(page);
  for (const image of useBoardStore.getState().clipboard.images) {
    if (image.pdfSource) keep.add(image.pdfSource.docId);
  }
  for (const id of retained) keep.add(id);
  await sweepUnreferenced("pdfs", keep);
}
