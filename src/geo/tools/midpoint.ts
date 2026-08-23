import { addObject, listObjects, midpointOf } from "../model";
import { PICK_TOLERANCE_PX } from "./constants";
import { nearestSegment } from "./pick";
import type { PointerInfo, Tool, ToolContext } from "./types";

const PROMPT = "Midpoint: click a segment";

export function createMidpointTool(context: ToolContext): Tool {
  return {
    id: "midpoint",
    activate() {
      context.setStatus(PROMPT);
    },
    deactivate() {
      context.setStatus("");
    },
    cancel() {},
    pointerDown(info: PointerInfo) {
      const document = context.getDocument();
      const tolerance = context.controller.pixelsToUnits(PICK_TOLERANCE_PX);
      const segmentId = nearestSegment(info.position, document, tolerance);
      if (!segmentId) {
        context.setStatus(PROMPT);
        return true;
      }
      const existing = listObjects(document, "point").find(
        (point) => point.role === "midpoint" && point.segment === segmentId,
      );
      if (existing) {
        context.setSelected(existing.id);
        return true;
      }
      context.commit(addObject(document, midpointOf(segmentId)));
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}
