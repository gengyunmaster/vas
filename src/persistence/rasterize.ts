import { decodeBlob } from "../engine/imageCache";

const RASTER_SCALE = 3;

export async function rasterizeToPng(blob: Blob): Promise<Uint8Array | null> {
  try {
    const image = await decodeBlob(blob);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 300) * RASTER_SCALE));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 150) * RASTER_SCALE));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) return null;
    return new Uint8Array(await png.arrayBuffer());
  } catch {
    return null;
  }
}
