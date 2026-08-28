import type { XY } from "../model";

export interface LabelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelCandidate {
  center: XY;
  clearance: number;
}

export const LABEL_VIEW_MARGIN = 8;
export const LABEL_GAP = 6;

export const rectAround = (center: XY, halfWidth: number, halfHeight: number): LabelRect => ({
  left: center[0] - halfWidth,
  top: center[1] - halfHeight,
  right: center[0] + halfWidth,
  bottom: center[1] + halfHeight,
});

// Distance between two rectangles; 0 when they overlap or merely touch.
export const rectSeparation = (a: LabelRect, b: LabelRect): number => {
  const dx = Math.max(a.left - b.right, b.left - a.right, 0);
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
  return Math.hypot(dx, dy);
};

// Picks the candidate whose rect fits on-canvas and clears every obstacle by
// at least `gap`, preferring the most edge clearance (ties break rightward,
// then by candidate order). When every candidate collides, the least-crowded
// one wins; null means nothing fits on-canvas at all.
export const pickLabelSpot = (
  candidates: LabelCandidate[],
  halfWidth: number,
  halfHeight: number,
  obstacles: LabelRect[],
  view: { width: number; height: number },
  margin: number,
  gap: number,
): XY | null => {
  let bestFree: { center: XY; clearance: number } | null = null;
  let bestCrowded: { center: XY; separation: number; clearance: number } | null = null;
  for (const candidate of candidates) {
    const rect = rectAround(candidate.center, halfWidth, halfHeight);
    if (
      rect.left < margin ||
      rect.top < margin ||
      rect.right > view.width - margin ||
      rect.bottom > view.height - margin
    ) {
      continue;
    }
    let separation = Infinity;
    for (const obstacle of obstacles) {
      separation = Math.min(separation, rectSeparation(rect, obstacle));
    }
    if (separation >= gap) {
      if (
        !bestFree ||
        candidate.clearance > bestFree.clearance + 1e-6 ||
        (Math.abs(candidate.clearance - bestFree.clearance) <= 1e-6 &&
          candidate.center[0] > bestFree.center[0])
      ) {
        bestFree = { center: candidate.center, clearance: candidate.clearance };
      }
    } else if (
      !bestCrowded ||
      separation > bestCrowded.separation + 1e-6 ||
      (Math.abs(separation - bestCrowded.separation) <= 1e-6 &&
        candidate.clearance > bestCrowded.clearance)
    ) {
      bestCrowded = { center: candidate.center, separation, clearance: candidate.clearance };
    }
  }
  return (bestFree ?? bestCrowded)?.center ?? null;
};
