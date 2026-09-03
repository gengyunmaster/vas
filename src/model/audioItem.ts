import { PLACEMENT_MARGIN } from "./page";
import { newId } from "./stroke";

export interface AudioItem {
  id: string;
  // Points at the media table; the badge itself is drawn procedurally.
  audioId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AUDIO_BADGE_WIDTH = 240;
export const AUDIO_BADGE_HEIGHT = 44;

export function createAudioItem(audioId: string, pageWidth: number): AudioItem {
  const width = Math.max(120, Math.min(AUDIO_BADGE_WIDTH, pageWidth - PLACEMENT_MARGIN * 2));
  const height = (width / AUDIO_BADGE_WIDTH) * AUDIO_BADGE_HEIGHT;
  return { id: newId(), audioId, x: PLACEMENT_MARGIN, y: PLACEMENT_MARGIN, width, height };
}
