// Per-frame channel from the render engine to the media overlay, mirroring
// textFrameBus: positions must not round-trip through React state at 60fps.
import type { SelectionGestureSnapshot } from "../text/textFrameBus";

export interface MediaFrame {
  scale: number;
  // Screen-space origin of each page that has video or audio items.
  pages: { pageId: string; x: number; y: number }[];
  gesture: SelectionGestureSnapshot | null;
  selectedVideoIds: string[];
  selectedAudioIds: string[];
}

let current: MediaFrame = {
  scale: 1,
  pages: [],
  gesture: null,
  selectedVideoIds: [],
  selectedAudioIds: [],
};
const subscribers = new Set<(frame: MediaFrame) => void>();

export function publishMediaFrame(frame: MediaFrame): void {
  current = frame;
  for (const subscriber of subscribers) subscriber(frame);
}

export function currentMediaFrame(): MediaFrame {
  return current;
}

export function subscribeMediaFrame(subscriber: (frame: MediaFrame) => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}
