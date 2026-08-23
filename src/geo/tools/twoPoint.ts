import type { GeoObject, ObjectId } from "../model";
import { addObject, circle, line, pointPosition, ray, segment } from "../model";
import { resolveAnchorPoint } from "./anchor";
import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

type TwoPointShapeId = Extract<ToolId, "segment" | "line" | "ray" | "circle">;

const createShape = (id: TwoPointShapeId, p1: ObjectId, p2: ObjectId): GeoObject => {
  switch (id) {
    case "segment":
      return segment(p1, p2);
    case "line":
      return line(p1, p2);
    case "ray":
      return ray(p1, p2);
    case "circle":
      return circle(p1, p2);
  }
};

export function createTwoPointTool(id: TwoPointShapeId, context: ToolContext): Tool {
  let anchorId: ObjectId | null = null;

  const reset = () => {
    anchorId = null;
    context.controller.clearPreview();
  };

  return {
    id,
    deactivate: reset,
    cancel: reset,
    pointerDown(info: PointerInfo) {
      if (anchorId !== null && !context.getDocument().objects[anchorId]) reset();
      const anchor = resolveAnchorPoint(info, context);
      if (anchorId === null) {
        context.commit(anchor.document);
        anchorId = anchor.pointId;
        return true;
      }
      if (anchor.pointId === anchorId) return true;
      context.commit(addObject(anchor.document, createShape(id, anchorId, anchor.pointId)));
      reset();
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (anchorId === null) return;
      const from = pointPosition(context.getDocument(), anchorId);
      if (!from) {
        reset();
        return;
      }
      context.controller.setPreview(id, from, context.snap(info).position);
    },
    pointerUp(_info: PointerInfo) {},
  };
}
