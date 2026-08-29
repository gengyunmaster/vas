const RASTER_SCALE = 3;
const MIN_RENDER_SCALE = 0.5;
// iOS Safari silently blanks canvases past roughly 16M pixels
const MAX_RENDER_PIXELS = 16_777_216;

export function cappedRenderScale(scale: number, width: number, height: number): number {
  const fit = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
  return Math.max(MIN_RENDER_SCALE, Math.min(scale, fit));
}

// createImageBitmap settles on the first frame of animated images (GIF), while
// an HTMLImageElement keeps advancing frames between decode and draw.
export async function firstFrameBitmap(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export async function rasterizeToPng(blob: Blob): Promise<Uint8Array | null> {
  const bitmap = await firstFrameBitmap(blob);
  if (!bitmap) return null;
  try {
    const width = bitmap.width || 300;
    const height = bitmap.height || 150;
    const scale = cappedRenderScale(RASTER_SCALE, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) return null;
    return new Uint8Array(await png.arrayBuffer());
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
