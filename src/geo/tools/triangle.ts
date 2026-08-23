import type { GeoDocument, ObjectId, TriangleCenterKind } from "../model";
import {
  addObject,
  circleCenterOf,
  circumcenterOf,
  circumcircleOf,
  distanceToShape,
  listObjects,
  resolvePositions,
  resolveShapePositions,
  triangleCenterOf,
} from "../model";
import { resolveAnchorPoint } from "./anchor";
import { PICK_TOLERANCE_PX } from "./constants";
import { restage } from "./staging";
import type { PointerInfo, Tool, ToolContext } from "./types";

const tolerance = (context: ToolContext) => context.controller.pixelsToUnits(PICK_TOLERANCE_PX);

export function createCircumcircleTool(context: ToolContext): Tool {
  let base: GeoDocument | null = null;
  let working: GeoDocument | null = null;
  let picked: ObjectId[] = [];

  const reset = () => {
    base = null;
    working = null;
    picked = [];
    context.controller.clearPreview();
  };

  return {
    id: "circumcircle",
    activate() {
      context.setStatus("Circumcircle: click three points");
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus("Circumcircle: click three points");
    },
    pointerDown(info: PointerInfo) {
      const anchor = resolveAnchorPoint(info, context, working ?? undefined);
      if (picked.includes(anchor.pointId)) return true;
      if (picked.length === 0) base = context.getDocument();
      working = anchor.document;
      picked.push(anchor.pointId);
      if (picked.length < 3) {
        context.setStatus(`Circumcircle: ${picked.length}/3 points selected`);
        return true;
      }
      const live = context.getDocument();
      const staged = restage(base ?? live, working ?? live, live);
      if (!staged || picked.some((pointId) => !staged.objects[pointId])) {
        reset();
        context.setStatus("The construction inputs no longer exist");
        return true;
      }
      const existing = listObjects(staged, "circumcircle").find((candidate) =>
        [candidate.p1, candidate.p2, candidate.p3].every((id) => picked.includes(id)),
      );
      if (existing) {
        context.setSelected(existing.id);
      } else {
        const positions = resolvePositions(staged);
        const [a, b, c] = picked.map((pointId) => positions.get(pointId));
        if (!a || !b || !c || !circumcenterOf(a, b, c)) {
          reset();
          context.setStatus("Points are collinear — no circumcircle");
          return true;
        }
        context.commit(addObject(staged, circumcircleOf(picked[0], picked[1], picked[2])));
      }
      reset();
      context.setStatus("Circumcircle: click three points");
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (!working || picked.length === 0) return;
      const positions = resolvePositions(working);
      const cursor = context.snap(info).position;
      const first = positions.get(picked[0]);
      if (!first) {
        reset();
        return;
      }
      if (picked.length === 1) {
        context.controller.setPreview("segment", first, cursor);
        return;
      }
      const second = positions.get(picked[1]);
      if (!second) {
        reset();
        return;
      }
      const center = circumcenterOf(first, second, cursor);
      if (center) context.controller.setPreview("circle", center, first);
      else context.controller.setPreview("segment", first, second);
    },
    pointerUp(_info: PointerInfo) {},
  };
}

export function createCircleCenterTool(context: ToolContext): Tool {
  return {
    id: "circleCenter",
    activate() {
      context.setStatus("Center: click a circle");
    },
    deactivate() {
      context.setStatus("");
    },
    cancel() {},
    pointerDown(info: PointerInfo) {
      const document = context.getDocument();
      const limit = tolerance(context);
      let best: { id: ObjectId; d: number } | null = null;
      for (const circle of [
        ...listObjects(document, "circle"),
        ...listObjects(document, "circumcircle"),
      ]) {
        if (circle.hidden) continue;
        const shape = resolveShapePositions(document, circle.id);
        if (shape?.type !== "circle") continue;
        const d = distanceToShape(info.position, shape);
        if (d <= limit && (!best || d < best.d)) best = { id: circle.id, d };
      }
      if (!best) {
        context.setStatus("Center: click a circle");
        return true;
      }
      const existing = listObjects(document, "point").find(
        (point) => point.role === "circleCenter" && point.circle === best.id,
      );
      if (existing) {
        context.setSelected(existing.id);
        return true;
      }
      context.commit(addObject(document, circleCenterOf(best.id)));
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}

const CENTER_LABELS: Record<TriangleCenterKind, string> = {
  incenter: "Incenter",
  circumcenter: "Circumcenter",
  centroid: "Centroid",
  orthocenter: "Orthocenter",
  excenter: "Excenter",
  ninePointCenter: "Nine-point center",
};

export function createTriangleCenterTool(center: TriangleCenterKind, context: ToolContext): Tool {
  let triangleId: ObjectId | null = null;
  const label = CENTER_LABELS[center];
  const prompt = `${label}: click a triangle polygon`;

  const reset = () => {
    triangleId = null;
  };

  const place = (document: GeoDocument, triangle: ObjectId, vertex?: number) => {
    const existing = listObjects(document, "point").find(
      (point) =>
        point.role === "triangleCenter" &&
        point.triangle === triangle &&
        point.center === center &&
        point.vertex === vertex,
    );
    if (existing) {
      context.setSelected(existing.id);
      return;
    }
    context.commit(addObject(document, triangleCenterOf(triangle, center, vertex)));
  };

  return {
    id: center,
    activate() {
      context.setStatus(prompt);
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(prompt);
    },
    pointerDown(info: PointerInfo) {
      const document = context.getDocument();
      const limit = tolerance(context);
      if (triangleId !== null && document.objects[triangleId]?.kind !== "polygon") reset();
      if (triangleId !== null) {
        const triangle = document.objects[triangleId];
        const vertexId = context.controller.pickPoint(context.snap(info).position, document, limit);
        const index =
          triangle?.kind === "polygon" && vertexId ? triangle.points.indexOf(vertexId) : -1;
        if (index < 0) {
          context.setStatus(`${label}: click one of the triangle's vertices`);
          return true;
        }
        place(document, triangleId, index);
        reset();
        context.setStatus(prompt);
        return true;
      }
      const picked = context.controller.pickObject(info.position, document, limit);
      const object = picked ? document.objects[picked] : undefined;
      if (object?.kind !== "polygon" || object.points.length !== 3) {
        context.setStatus(prompt);
        return true;
      }
      if (center === "excenter") {
        triangleId = object.id;
        context.setStatus("Excenter: click the opposite vertex");
        return true;
      }
      place(document, object.id);
      context.setStatus(prompt);
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}
