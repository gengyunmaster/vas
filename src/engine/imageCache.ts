import { countGifFrames, decodeGifFrames, type GifFrames } from "../model/gif";
import { getImage } from "../persistence/images";
import { firstFrameBitmap } from "../persistence/rasterize";
import { get2dContext } from "./canvas";

// drawImage() only ever paints a GIF's first frame, so animations are decoded
// up front into per-frame canvases and getImageBitmap picks one by wall clock.
interface GifAnimation {
  frames: HTMLCanvasElement[];
  cumulative: number[];
  total: number;
}

const cache = new Map<string, HTMLImageElement>();
const failed = new Set<string>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();
const listeners = new Set<(imageId: string) => void>();
const gifAnimations = new Map<string, GifAnimation>();
const firstFrames = new Map<string, HTMLImageElement>();

export function getImageBitmap(imageId: string): HTMLImageElement | HTMLCanvasElement | null {
  const pinned = firstFrames.get(imageId);
  if (pinned) return pinned;
  const animation = gifAnimations.get(imageId);
  if (animation) return animation.frames[frameIndexAt(animation, performance.now())];
  const hit = cache.get(imageId);
  if (hit) return hit;
  if (!failed.has(imageId)) void ensureImageLoaded(imageId);
  return null;
}

export function isAnimatedGif(imageId: string): boolean {
  return gifAnimations.has(imageId);
}

// Milliseconds until the animation leaves the current frame; -1 when the
// image has no decoded animation (unknown timing).
export function nextGifFrameDelay(imageId: string): number {
  const animation = gifAnimations.get(imageId);
  if (!animation) return -1;
  const now = performance.now();
  const index = frameIndexAt(animation, now);
  const end =
    index === animation.cumulative.length - 1 ? animation.total : animation.cumulative[index + 1];
  return end - (now % animation.total);
}

function frameIndexAt(animation: GifAnimation, now: number): number {
  const t = now % animation.total;
  let lo = 0;
  let hi = animation.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (animation.cumulative[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
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

export function primeImage(imageId: string, image: HTMLImageElement, blob?: Blob): void {
  cache.set(imageId, image);
  for (const listener of listeners) listener(imageId);
  if (blob?.type === "image/gif") void analyzeGif(imageId, blob);
}

export function clearImageCache(): void {
  cache.clear();
  failed.clear();
  gifAnimations.clear();
  firstFrames.clear();
}

export function onImageLoaded(listener: (imageId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Bitmap export pins animated GIFs to their first frame: the cache otherwise
// returns whatever frame is current, so a decoded still shadows it until the
// returned release runs.
export async function acquireFirstFrames(imageIds: Iterable<string>): Promise<() => void> {
  const pinned: string[] = [];
  await Promise.all(
    [...new Set(imageIds)].map(async (imageId) => {
      try {
        const record = await getImage(imageId);
        if (record?.mimeType !== "image/gif") return;
        firstFrames.set(imageId, await decodeFirstFrame(record.blob));
        pinned.push(imageId);
      } catch {
        // keep the live frame; the export degrades to the current frame
      }
    }),
  );
  return () => {
    for (const imageId of pinned) firstFrames.delete(imageId);
  };
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

// The still must keep the GIF's natural size: text layout measures inline
// images through the cache, so a scaled raster would relayout them.
async function decodeFirstFrame(blob: Blob): Promise<HTMLImageElement> {
  const bitmap = await firstFrameBitmap(blob);
  if (!bitmap) throw new Error("Failed to decode image");
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("PNG encode failed");
    return await decodeBlob(png);
  } finally {
    bitmap.close();
  }
}

async function analyzeGif(imageId: string, blob: Blob): Promise<void> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (countGifFrames(bytes) <= 1) return;
    const decoded = decodeGifFrames(bytes);
    if (!decoded || decoded.frames.length < 2) return;
    gifAnimations.set(imageId, buildAnimation(decoded));
    // The static first frame was already painted; repaint and arm the ticker.
    for (const listener of listeners) listener(imageId);
  } catch {
    // oversized or malformed animations stay a static first frame
  }
}

function buildAnimation(decoded: GifFrames): GifAnimation {
  const cumulative: number[] = [];
  let total = 0;
  for (const frame of decoded.frames) {
    cumulative.push(total);
    total += frame.delayMs;
  }
  const frames = decoded.frames.map((frame) => {
    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    get2dContext(canvas).putImageData(
      new ImageData(frame.pixels, decoded.width, decoded.height),
      0,
      0,
    );
    return canvas;
  });
  return { frames, cumulative, total };
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
    if (record.mimeType === "image/gif") void analyzeGif(imageId, record.blob);
    return image;
  } catch {
    failed.add(imageId);
    return null;
  } finally {
    pending.delete(imageId);
  }
}
