import type { GeoDocument, ObjectId, XY } from "../model";
import {
  addObject,
  angleMeasure,
  areaOf,
  distanceBetween,
  distancePointToSegment,
  distanceToShape,
  lengthOf,
  listObjects,
  pointInPolygon,
  resolvePositions,
  resolveShapePositions,
  variableAt,
} from "../model";
import { PICK_TOLERANCE_PX } from "./constants";
import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

type MeasureToolId = Extract<
  ToolId,
  | "measureLength"
  | "measureDistance"
  | "measureAngle"
  | "measureArea"
  | "addVariable"
  | "addCalculation"
>;

const PROMPTS: Record<MeasureToolId, string> = {
  measureLength: "Length: click a segment or a circle",
  measureDistance: "Distance: click the first point",
  measureAngle: "Angle: click a point on one side",
  measureArea: "Area: click a circle or a polygon",
  addVariable: "Variable: click to place the value, edit it in the inspector",
  addCalculation: "Calculation: click to place the result",
};

export function createMeasureTool(id: MeasureToolId, context: ToolContext): Tool {
  let picked: ObjectId[] = [];

  const tolerance = () => context.controller.pixelsToUnits(PICK_TOLERANCE_PX);

  const reset = () => {
    picked = [];
    context.controller.clearPreview();
  };

  const pickExistingPoint = (info: PointerInfo): ObjectId | null =>
    context.controller.pickPoint(context.snap(info).position, context.getDocument(), tolerance());

  const finishSequence = (position: XY) => {
    const document = context.getDocument();
    if (id === "measureDistance" && picked.length === 2) {
      context.commit(addObject(document, distanceBetween(picked[0], picked[1], position)));
    } else if (id === "measureAngle" && picked.length === 3) {
      context.commit(addObject(document, angleMeasure(picked[0], picked[1], picked[2], position)));
    }
    reset();
    context.setStatus(PROMPTS[id]);
  };

  return {
    id,
    activate() {
      context.setStatus(PROMPTS[id]);
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(PROMPTS[id]);
    },
    pointerDown(info: PointerInfo) {
      const document = context.getDocument();
      if (picked.some((pointId) => !document.objects[pointId])) reset();
      if (id === "measureLength" || id === "measureArea") {
        const target = nearestMeasurable(info.position, document, tolerance(), id);
        if (!target) {
          context.setStatus(
            id === "measureLength" ? "No segment or circle there" : "No circle or polygon there",
          );
          return true;
        }
        const object =
          id === "measureLength" ? lengthOf(target, info.position) : areaOf(target, info.position);
        context.commit(addObject(document, object));
        context.setStatus(PROMPTS[id]);
        return true;
      }
      if (id === "addVariable") {
        context.commit(addObject(document, variableAt(1, info.position)));
        context.setStatus("Edit the value in the inspector");
        return true;
      }
      if (id === "addCalculation") {
        context.openDialog("calculation", info.position);
        return true;
      }
      const pointId = pickExistingPoint(info);
      if (!pointId) {
        context.setStatus("No point there");
        return true;
      }
      if (picked.includes(pointId)) return true;
      picked.push(pointId);
      const needed = id === "measureDistance" ? 2 : 3;
      if (picked.length < needed) {
        context.setStatus(
          id === "measureDistance"
            ? "Distance: click the second point"
            : picked.length === 1
              ? "Angle: click the vertex"
              : "Angle: click a point on the other side",
        );
        return true;
      }
      finishSequence(info.position);
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (picked.length === 0) return;
      const positions = resolvePositions(context.getDocument());
      const cursor = context.snap(info).position;
      if (picked.length === 1) {
        const first = positions.get(picked[0]);
        if (!first) {
          reset();
          return;
        }
        context.controller.setPreview("segment", first, cursor);
        return;
      }
      const a = positions.get(picked[0]);
      const b = positions.get(picked[1]);
      if (!a || !b) {
        reset();
        return;
      }
      context.controller.setPolygonPreview([a, b], cursor);
    },
    pointerUp(_info: PointerInfo) {},
  };
}

function nearestMeasurable(
  position: XY,
  document: GeoDocument,
  tolerance: number,
  mode: "measureLength" | "measureArea",
): ObjectId | null {
  let bestId: ObjectId | null = null;
  let bestDistance = Infinity;
  const consider = (id: ObjectId, d: number) => {
    if (d <= tolerance && d < bestDistance) {
      bestId = id;
      bestDistance = d;
    }
  };
  for (const segment of [
    ...listObjects(document, "segment"),
    ...(mode === "measureLength" ? listObjects(document, "transform") : []),
  ]) {
    if (segment.hidden) continue;
    const shape = resolveShapePositions(document, segment.id);
    if (shape?.type === "segment") consider(segment.id, distanceToShape(position, shape));
  }
  for (const circle of [
    ...listObjects(document, "circle"),
    ...listObjects(document, "circumcircle"),
    ...(mode === "measureLength" ? listObjects(document, "transform") : []),
  ]) {
    if (circle.hidden) continue;
    const shape = resolveShapePositions(document, circle.id);
    if (shape?.type === "circle") consider(circle.id, distanceToShape(position, shape));
  }
  if (mode === "measureArea") {
    const positions = resolvePositions(document);
    for (const polygon of listObjects(document, "polygon")) {
      if (polygon.hidden) continue;
      const vertices: XY[] = [];
      for (const pointId of polygon.points) {
        const vertex = positions.get(pointId);
        if (!vertex) break;
        vertices.push(vertex);
      }
      if (vertices.length !== polygon.points.length) continue;
      if (pointInPolygon(position, vertices)) {
        consider(polygon.id, 0);
        continue;
      }
      let d = Infinity;
      for (let i = 0; i < vertices.length; i++) {
        d = Math.min(
          d,
          distancePointToSegment(position, vertices[i], vertices[(i + 1) % vertices.length]),
        );
      }
      consider(polygon.id, d);
    }
  }
  return bestId;
}
