import { getImage } from "../persistence/images";

const cache = new Map<string, HTMLImageElement>();
const failed = new Set<string>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();
const listeners = new Set<(imageId: string) => void>();

export function getImageBitmap(imageId: string): HTMLImageElement | null {
  const hit = cache.get(imageId);
  if (hit) return hit;
  if (!failed.has(imageId)) void ensureImageLoaded(imageId);
  return null;
}

export function ensureImageLoaded(imageId: string): Promise<HTMLImageElement | null> {
  const hit = cache.get(imageId);
  if (hit) return Promise.resolve(hit);
  if (failed.has(imageId)) return Promise.resolve(null);
  const existing = pending.get(imageId);
  if (existing) return existing;
  const task = load(imageId);
  pending.set(imageId, task);
  return task;
}

export function primeImage(imageId: string, image: HTMLImageElement): void {
  cache.set(imageId, image);
  for (const listener of listeners) listener(imageId);
}

export function clearImageCache(): void {
  cache.clear();
  failed.clear();
}

export function onImageLoaded(listener: (imageId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function decodeBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    image.src = url;
  });
}

async function load(imageId: string): Promise<HTMLImageElement | null> {
  let record: Awaited<ReturnType<typeof getImage>>;
  try {
    record = await getImage(imageId);
  } catch {
    pending.delete(imageId);
    return null;
  }
  if (!record) {
    failed.add(imageId);
    pending.delete(imageId);
    return null;
  }
  try {
    const image = await decodeBlob(record.blob);
    cache.set(imageId, image);
    for (const listener of listeners) listener(imageId);
    return image;
  } catch {
    failed.add(imageId);
    return null;
  } finally {
    pending.delete(imageId);
  }
}
