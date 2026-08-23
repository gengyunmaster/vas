import type { ObjectId } from "../model";
import { addObject, axisSystemOf, numberAxisOf, pointPosition } from "../model";
import { resolveAnchorPoint } from "./anchor";
import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

type AxisToolId = Extract<ToolId, "axis" | "numberAxis">;

export function createAxisTool(id: AxisToolId, context: ToolContext): Tool {
  let originId: ObjectId | null = null;

  const prompt = () =>
    id === "axis" ? "Axes: click the origin point" : "Number axis: click the origin point";

  const reset = () => {
    originId = null;
    context.controller.clearPreview();
  };

  return {
    id,
    activate() {
      context.setStatus(prompt());
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(prompt());
    },
    pointerDown(info: PointerInfo) {
      if (originId !== null && !context.getDocument().objects[originId]) reset();
      const anchor = resolveAnchorPoint(info, context);
      if (!originId) {
        originId = anchor.pointId;
        context.commit(anchor.document);
        context.setStatus("Click the unit point (defines +x direction and unit length)");
        return true;
      }
      if (anchor.pointId === originId) return true;
      const axis =
        id === "axis"
          ? axisSystemOf(originId, anchor.pointId)
          : numberAxisOf(originId, anchor.pointId);
      context.commit(addObject(anchor.document, axis));
      reset();
      context.setStatus(prompt());
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (!originId) return;
      const origin = pointPosition(context.getDocument(), originId);
      if (!origin) {
        reset();
        return;
      }
      context.controller.setPreview("segment", origin, context.snap(info).position);
    },
    pointerUp(_info: PointerInfo) {},
  };
}
