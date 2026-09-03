import { decodeBlob, primeImage } from "../engine/imageCache";
import { useBoardStore } from "../store/useBoardStore";
import { hashBlob } from "./hash";
import { saveImage } from "./images";

export async function insertImageFile(file: File, geometryId?: string): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image file");
  const imageId = await hashBlob(file);
  const decoded = await decodeBlob(file);
  await saveImage({
    id: imageId,
    mimeType: file.type || "application/octet-stream",
    blob: file,
  });
  primeImage(imageId, decoded, file);
  useBoardStore
    .getState()
    .insertImage(imageId, decoded.naturalWidth, decoded.naturalHeight, { geometryId });
}
