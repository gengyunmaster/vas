import { useBoardStore } from "../store/useBoardStore";
import { db, type GeometryRecord } from "./db";
import { sweepUnreferenced } from "./gc";

export async function saveGeometry(record: GeometryRecord): Promise<void> {
  await (await db()).put("geometries", record);
}

export async function saveGeometries(records: GeometryRecord[]): Promise<void> {
  if (records.length === 0) return;
  const tx = (await db()).transaction("geometries", "readwrite");
  for (const record of records) await tx.store.put(record);
  await tx.done;
}

export async function getGeometry(id: string): Promise<GeometryRecord | undefined> {
  return (await db()).get("geometries", id);
}

export async function deleteGeometries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const tx = (await db()).transaction("geometries", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

export async function gcUnreferencedGeometries(): Promise<void> {
  const database = await db();
  const keep = new Set<string>();
  const collect = (images: { geometryId?: string }[]) => {
    for (const image of images) {
      if (image.geometryId) keep.add(image.geometryId);
    }
  };
  for (const page of await database.getAll("pages")) collect(page.images ?? []);
  const state = useBoardStore.getState();
  for (const page of state.pages) collect(page.images);
  collect(state.clipboard.images);
  await sweepUnreferenced("geometries", keep);
}
