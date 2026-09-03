import { decodeBlob, primeImage } from "../engine/imageCache";
import { useBoardStore } from "../store/useBoardStore";
import { hashBlob } from "./hash";
import { saveImage } from "./images";
import { deleteMedias, saveMedia } from "./media";

const POSTER_MAX_WIDTH = 1280;

export async function insertMediaFile(file: File): Promise<void> {
  if (file.type.startsWith("video/")) return insertVideoFile(file);
  if (file.type.startsWith("audio/")) return insertAudioFile(file);
  throw new Error("Not a media file");
}

async function insertVideoFile(file: File): Promise<void> {
  const poster = await capturePoster(file);
  const posterId = await hashBlob(poster.blob);
  const videoId = await hashBlob(file);
  const videoCreated = await saveMedia({
    id: videoId,
    kind: "video",
    mimeType: file.type,
    blob: file,
  });
  try {
    await saveImage({ id: posterId, mimeType: "image/png", blob: poster.blob });
  } catch (error) {
    if (videoCreated) await deleteMedias([videoId]).catch(() => {});
    throw error;
  }
  primeImage(posterId, poster.image, poster.blob);
  useBoardStore.getState().insertImage(posterId, poster.width, poster.height, { videoId });
}

async function insertAudioFile(file: File): Promise<void> {
  await probeAudio(file);
  const audioId = await hashBlob(file);
  await saveMedia({ id: audioId, kind: "audio", mimeType: file.type, blob: file });
  useBoardStore.getState().insertAudio(audioId);
}

// Seek a hair past t=0: some browsers have no paintable frame decoded at the
// exact start, and drawing then yields a black poster.
async function capturePoster(file: File): Promise<{
  blob: Blob;
  image: HTMLImageElement;
  width: number;
  height: number;
}> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const probed = new Promise<{ width: number; height: number }>((resolve, reject) => {
      video.onloadeddata = () => {
        video.currentTime = Math.min(0.1, Number.isFinite(video.duration) ? video.duration : 0);
      };
      video.onseeked = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          resolve({ width: video.videoWidth, height: video.videoHeight });
        } else {
          reject(new Error("Could not decode this video"));
        }
      };
      video.onerror = () => reject(new Error("Could not decode this video"));
    });
    video.src = url;
    const { width, height } = await probed;
    const scale = Math.min(1, POSTER_MAX_WIDTH / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not decode this video");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not decode this video");
    const image = await decodeBlob(blob);
    return { blob, image, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function probeAudio(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode this audio"));
    };
    audio.src = url;
  });
}
