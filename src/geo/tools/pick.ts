import type { GeoDocument, GeoObject, ObjectId, XY } from "../model";
import {
  distancePointToSegment,
  distanceToShape,
  listObjects,
  resolveShapePositions,
} from "../model";

export function nearestSegment(
  position: XY,
  document: GeoDocument,
  tolerance: number,
): ObjectId | null {
  let bestId: ObjectId | null = null;
  let bestDistance = Infinity;
  for (const segment of [
    ...listObjects(document, "segment"),
    ...listObjects(document, "transform"),
  ]) {
    if (segment.hidden) continue;
    const shape = resolveShapePositions(document, segment.id);
    if (shape?.type !== "segment") continue;
    const d = distancePointToSegment(position, shape.a, shape.b);
    if (d <= tolerance && d < bestDistance) {
      bestId = segment.id;
      bestDistance = d;
    }
  }
  return bestId;
}

export function nearestLinearShape(
  position: XY,
  document: GeoDocument,
  tolerance: number,
): ObjectId | null {
  let bestId: ObjectId | null = null;
  let bestDistance = Infinity;
  for (const shape of linearObjects(document)) {
    if (shape.hidden) continue;
    const resolved = resolveShapePositions(document, shape.id);
    if (!resolved || resolved.type === "circle") continue;
    const d = distanceToShape(position, resolved);
    if (d <= tolerance && d < bestDistance) {
      bestId = shape.id;
      bestDistance = d;
    }
  }
  return bestId;
}

export const linearObjects = (document: GeoDocument): GeoObject[] => [
  ...listObjects(document, "segment"),
  ...listObjects(document, "line"),
  ...listObjects(document, "ray"),
  ...listObjects(document, "perpendicularLine"),
  ...listObjects(document, "parallelLine"),
  ...listObjects(document, "angleBisector"),
  ...listObjects(document, "tangentLine"),
  ...listObjects(document, "conicLine"),
  ...listObjects(document, "transform"),
];
