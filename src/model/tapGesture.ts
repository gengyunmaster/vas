export const TAP_MAX_MS = 300;

export type TapAction = "undo" | "redo" | null;

// Multi-finger tap recognition: the whole group must land and lift quickly
// without any finger drifting (drift means the gesture is a pan or pinch).
export function tapAction(touches: number, durationMs: number, moved: boolean): TapAction {
  if (moved || durationMs > TAP_MAX_MS) return null;
  if (touches === 2) return "undo";
  if (touches === 3) return "redo";
  return null;
}
