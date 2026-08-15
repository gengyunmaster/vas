import { useBoardStore } from "../store/useBoardStore";
import { db, type ImageRecord } from "./db";

export async function saveImage(record: ImageRecord): Promise<void> {
  await (await db()).put("images", record);
}

export async function saveImages(records: ImageRecord[]): Promise<void> {
  if (records.length === 0) return;
  const tx = (await db()).transaction("images", "readwrite");
  for (const record of records) await tx.store.put(record);
  await tx.done;
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

export async function gcUnreferencedImages(): Promise<void> {
  const database = await db();
  const keep = new Set<string>();
  for (const page of await database.getAll("pages")) {
    for (const image of page.images ?? []) keep.add(image.imageId);
  }
  const state = useBoardStore.getState();
  for (const page of state.pages) {
    for (const image of page.images) keep.add(image.imageId);
  }
  for (const image of state.clipboard.images) keep.add(image.imageId);
  const tx = database.transaction("images", "readwrite");
  const keys = await tx.store.getAllKeys();
  for (const key of keys) {
    if (!keep.has(key)) await tx.store.delete(key);
  }
  await tx.done;
}
