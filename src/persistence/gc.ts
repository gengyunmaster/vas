import { db } from "./db";

type BlobStore = "images" | "pdfs" | "media" | "geometries";

export async function sweepUnreferenced(store: BlobStore, keep: Set<string>): Promise<void> {
  const database = await db();
  const tx = database.transaction(store, "readwrite");
  const keys = await tx.store.getAllKeys();
  for (const key of keys) {
    if (!keep.has(key)) await tx.store.delete(key);
  }
  await tx.done;
}
