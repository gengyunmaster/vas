import { textImageRefs } from "../model/textItem";
import { useBoardStore } from "../store/useBoardStore";
import { db, type ImageRecord } from "./db";
import { sweepUnreferenced } from "./gc";

// Content-addressable records (see hash.ts): an existing id already holds the
// same bytes, so writes skip it and callers learn which ids they created —
// rollback paths must only delete records they created, never pre-existing
// ones shared with other notebooks.
export async function saveImage(record: ImageRecord): Promise<boolean> {
  const created = await saveImages([record]);
  return created.length > 0;
}

export async function saveImages(records: ImageRecord[]): Promise<string[]> {
  if (records.length === 0) return [];
  const tx = (await db()).transaction("images", "readwrite");
  const existing = new Set(await tx.store.getAllKeys());
  const created: string[] = [];
  for (const record of records) {
    if (existing.has(record.id)) continue;
    await tx.store.put(record);
    existing.add(record.id);
    created.push(record.id);
  }
  await tx.done;
  return created;
}

export async function getImage(id: string): Promise<ImageRecord | undefined> {
  return (await db()).get("images", id);
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const tx = (await db()).transaction("images", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

const retained = new Set<string>();

export function retainImages(ids: string[]): () => void {
  for (const id of ids) retained.add(id);
  return () => {
    for (const id of ids) retained.delete(id);
  };
}

export async function gcUnreferencedImages(): Promise<void> {
  const database = await db();
  const keep = new Set<string>();
  for (const page of await database.getAll("pages")) {
    for (const image of page.images ?? []) keep.add(image.imageId);
    for (const text of page.texts ?? []) {
      for (const id of textImageRefs(text.markdown)) keep.add(id);
    }
  }
  const state = useBoardStore.getState();
  for (const page of state.pages) {
    for (const image of page.images) keep.add(image.imageId);
    for (const text of page.texts) {
      for (const id of textImageRefs(text.markdown)) keep.add(id);
    }
  }
  for (const image of state.clipboard.images) keep.add(image.imageId);
  for (const text of state.clipboard.texts) {
    for (const id of textImageRefs(text.markdown)) keep.add(id);
  }
  for (const id of retained) keep.add(id);
  await sweepUnreferenced("images", keep);
}
