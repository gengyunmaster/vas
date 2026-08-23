import type { GeoDocument, ObjectId, XY } from "../model";
import {
  distance,
  listObjects,
  midpoint,
  nearestAngleStep,
  pointPosition,
  projectOntoDirectedLine,
} from "../model";

export interface SnapRequest {
  pointer: XY;
  ctrlKey: boolean;
  shiftKey: boolean;
  document: GeoDocument;
  tolerance: number;
}

export type SnapResult =
  | { kind: "none"; position: XY }
  | { kind: "midpoint"; position: XY; segmentId: ObjectId }
  | { kind: "angleLine"; position: XY; through: ObjectId; angle: number };

const ANGLE_STEP = Math.PI / 4;

export function resolveSnap(request: SnapRequest): SnapResult {
  const { pointer, document, tolerance } = request;
  if (request.ctrlKey) return snapToSegmentMidpoint(pointer, document, tolerance);
  if (request.shiftKey) return snapToAngledLine(pointer, document);
  return { kind: "none", position: pointer };
}

export function snapDisplacement(start: XY, current: XY): XY {
  const dx = current[0] - start[0];
  const dy = current[1] - start[1];
  if (Math.hypot(dx, dy) < 1e-9) return [0, 0];
  const angle = nearestAngleStep(Math.atan2(dy, dx), ANGLE_STEP);
  const projected = projectOntoDirectedLine(current, start, angle);
  return [projected[0] - start[0], projected[1] - start[1]];
}

function snapToSegmentMidpoint(pointer: XY, document: GeoDocument, tolerance: number): SnapResult {
  let best: { position: XY; segmentId: ObjectId; d: number } | null = null;
  for (const segment of listObjects(document, "segment")) {
    if (segment.hidden) continue;
    const a = pointPosition(document, segment.p1);
    const b = pointPosition(document, segment.p2);
    if (!a || !b) continue;
    const mid = midpoint(a, b);
    const d = distance(pointer, mid);
    if (d <= tolerance && (!best || d < best.d)) best = { position: mid, segmentId: segment.id, d };
  }
  return best
    ? { kind: "midpoint", position: best.position, segmentId: best.segmentId }
    : { kind: "none", position: pointer };
}

export function snapToAngledLine(
  pointer: XY,
  document: GeoDocument,
  exclude?: ObjectId,
): SnapResult {
  let nearest: { id: ObjectId; position: XY; d: number } | null = null;
  for (const point of listObjects(document, "point")) {
    if (point.hidden || point.id === exclude) continue;
    const position = pointPosition(document, point.id);
    if (!position) continue;
    const d = distance(pointer, position);
    if (!nearest || d < nearest.d) nearest = { id: point.id, position, d };
  }
  if (!nearest || nearest.d < 1e-9) return { kind: "none", position: pointer };
  const angle = nearestAngleStep(
    Math.atan2(pointer[1] - nearest.position[1], pointer[0] - nearest.position[0]),
    ANGLE_STEP,
  );
  return {
    kind: "angleLine",
    position: projectOntoDirectedLine(pointer, nearest.position, angle),
    through: nearest.id,
    angle,
  };
}
