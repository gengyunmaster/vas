import { clonePageWithNewIds, createPage, PAGE_HEIGHT, PAGE_WIDTH, type Page } from "../model/page";
import { newId } from "../model/stroke";
import type { ViewState } from "../model/viewState";
import { db, type NotebookRecord } from "./db";

const DEFAULT_PAPER_COLOR = "#ffffff";

export async function listNotebooks(): Promise<NotebookRecord[]> {
  const all = await (await db()).getAll("notebooks");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createNotebook(title: string): Promise<NotebookRecord> {
  const now = Date.now();
  const meta: NotebookRecord = { id: newId(), title, createdAt: now, updatedAt: now, pageCount: 1 };
  const tx = (await db()).transaction(["notebooks", "pages"], "readwrite");
  await tx.objectStore("notebooks").put(meta);
  await tx.objectStore("pages").put(toPageRecord(meta.id, 0, createPage(DEFAULT_PAPER_COLOR)));
  await tx.done;
  return meta;
}

function toPageRecord(notebookId: string, index: number, page: Page) {
  return {
    id: page.id,
    notebookId,
    index,
    width: page.width,
    height: page.height,
    paperColor: page.paperColor,
    pattern: page.pattern,
    strokes: page.strokes,
    images: page.images,
    texts: page.texts,
    audios: page.audios,
    ...(page.pdfSource ? { pdfSource: page.pdfSource } : {}),
  };
}

export async function loadNotebook(id: string): Promise<{ meta: NotebookRecord; pages: Page[] }> {
  const database = await db();
  const meta = await database.get("notebooks", id);
  if (!meta) throw new Error("Notebook not found");
  const records = await database.getAllFromIndex("pages", "by-notebook", id);
  records.sort((a, b) => a.index - b.index);
  const pages = records.map((record) => ({
    id: record.id,
    width: record.width ?? PAGE_WIDTH,
    height: record.height ?? PAGE_HEIGHT,
    paperColor: record.paperColor,
    pattern: record.pattern ?? "blank",
    strokes: record.strokes,
    images: record.images ?? [],
    texts: record.texts ?? [],
    audios: record.audios ?? [],
    ...(record.pdfSource ? { pdfSource: record.pdfSource } : {}),
  }));
  if (pages.length === 0) pages.push(createPage(DEFAULT_PAPER_COLOR));
  return { meta, pages };
}

export async function savePage(notebookId: string, index: number, page: Page): Promise<void> {
  const tx = (await db()).transaction(["notebooks", "pages"], "readwrite");
  await tx.objectStore("pages").put(toPageRecord(notebookId, index, page));
  const meta = await tx.objectStore("notebooks").get(notebookId);
  if (meta) {
    await tx.objectStore("notebooks").put({
      ...meta,
      updatedAt: Date.now(),
      pageCount: Math.max(meta.pageCount, index + 1),
    });
  }
  await tx.done;
}

export async function replacePages(notebookId: string, pages: Page[]): Promise<void> {
  const tx = (await db()).transaction(["notebooks", "pages"], "readwrite");
  const meta = await tx.objectStore("notebooks").get(notebookId);
  // the notebook may have been deleted while an import was in flight; writing
  // pages anyway would leave orphaned records behind
  if (!meta) return;
  const store = tx.objectStore("pages");
  const keys = await store.index("by-notebook").getAllKeys(notebookId);
  for (const key of keys) await store.delete(key);
  for (const [index, page] of pages.entries()) {
    await store.put(toPageRecord(notebookId, index, page));
  }
  await tx
    .objectStore("notebooks")
    .put({ ...meta, updatedAt: Date.now(), pageCount: pages.length });
  await tx.done;
}

export async function renameNotebook(id: string, title: string): Promise<void> {
  const tx = (await db()).transaction("notebooks", "readwrite");
  const meta = await tx.store.get(id);
  if (meta) await tx.store.put({ ...meta, title, updatedAt: Date.now() });
  await tx.done;
}

export async function saveViewState(id: string, viewState: ViewState): Promise<void> {
  const tx = (await db()).transaction("notebooks", "readwrite");
  const meta = await tx.store.get(id);
  if (meta) await tx.store.put({ ...meta, viewState });
  await tx.done;
}

export async function mergeNotebooks(ids: string[], title: string): Promise<string> {
  if (ids.length === 0) throw new Error("No notebooks selected");
  const sources: Page[] = [];
  for (const id of ids) {
    const { pages } = await loadNotebook(id);
    sources.push(...pages);
  }
  const meta = await createNotebook(title);
  try {
    await replacePages(meta.id, sources.map(clonePageWithNewIds));
  } catch (error) {
    await deleteNotebook(meta.id);
    throw error;
  }
  return meta.id;
}

export async function deleteNotebook(id: string): Promise<void> {
  const tx = (await db()).transaction(["notebooks", "pages"], "readwrite");
  await tx.objectStore("notebooks").delete(id);
  const keys = await tx.objectStore("pages").index("by-notebook").getAllKeys(id);
  for (const key of keys) await tx.objectStore("pages").delete(key);
  await tx.done;
}
