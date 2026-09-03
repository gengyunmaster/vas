import { useBoardStore } from "../store/useBoardStore";
import { db, type MediaRecord } from "./db";

export async function saveMedia(record: MediaRecord): Promise<void> {
  await (await db()).put("media", record);
}

export async function saveMedias(records: MediaRecord[]): Promise<void> {
  if (records.length === 0) return;
  const tx = (await db()).transaction("media", "readwrite");
  for (const record of records) await tx.store.put(record);
  await tx.done;
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  return (await db()).get("media", id);
}

export async function deleteMedias(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const tx = (await db()).transaction("media", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

const retained = new Set<string>();

export function retainMedias(ids: string[]): () => void {
  for (const id of ids) retained.add(id);
  return () => {
    for (const id of ids) retained.delete(id);
  };
}

type MediaRefPage = {
  images?: { videoId?: string }[];
  audios?: { audioId: string }[];
};

export function collectMediaRefs(pages: MediaRefPage[]): Set<string> {
  const keep = new Set<string>();
  for (const page of pages) {
    for (const image of page.images ?? []) {
      if (image.videoId) keep.add(image.videoId);
    }
    for (const audio of page.audios ?? []) keep.add(audio.audioId);
  }
  return keep;
}

export async function gcUnreferencedMedia(): Promise<void> {
  const database = await db();
  const state = useBoardStore.getState();
  const keep = collectMediaRefs([
    ...(await database.getAll("pages")),
    ...state.pages,
    { images: state.clipboard.images, audios: state.clipboard.audios },
  ]);
  for (const id of retained) keep.add(id);
  const tx = database.transaction("media", "readwrite");
  const keys = await tx.store.getAllKeys();
  for (const key of keys) {
    if (!keep.has(key)) await tx.store.delete(key);
  }
  await tx.done;
}
