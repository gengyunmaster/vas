import { getImage } from "./images";
import { rasterizeToPng } from "./rasterize";

const PDF_NATIVE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

export async function collectImageDataUris(
  imageIds: Iterable<string>,
  forPdf = false,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(
    [...new Set(imageIds)].map(async (imageId) => {
      const dataUri = await loadImageDataUri(imageId, forPdf);
      if (dataUri) result.set(imageId, dataUri);
    }),
  );
  return result;
}

async function loadImageDataUri(imageId: string, forPdf: boolean): Promise<string | null> {
  try {
    const record = await getImage(imageId);
    if (!record) return null;
    if (forPdf && !PDF_NATIVE_MIME_TYPES.has(record.mimeType)) {
      const png = await rasterizeToPng(record.blob);
      return png ? `data:image/png;base64,${bytesToBase64(png)}` : null;
    }
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    return `data:${record.mimeType};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
