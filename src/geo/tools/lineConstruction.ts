import type { GeoDocument, ObjectId } from "../model";
import {
  addObject,
  derivedLineThrough,
  parallelLine,
  perpendicularLine,
  resolvePositions,
  resolveShapePositions,
} from "../model";
import { resolveAnchorPoint } from "./anchor";
import { PICK_TOLERANCE_PX } from "./constants";
import { nearestLinearShape } from "./pick";
import { restage } from "./staging";
import type { PointerInfo, Tool, ToolContext } from "./types";

export function createLineConstructionTool(
  variant: "perpendicular" | "parallel",
  context: ToolContext,
): Tool {
  const noun = variant === "perpendicular" ? "Perpendicular" : "Parallel";
  const pointPrompt = `${noun}: select a point`;
  const linePrompt = `${noun}: select a segment, line or ray`;
  let base: GeoDocument | null = null;
  let working: GeoDocument | null = null;
  let throughId: ObjectId | null = null;

  const reset = () => {
    base = null;
    working = null;
    throughId = null;
    context.controller.clearPreview();
  };

  return {
    id: variant,
    activate() {
      context.setStatus(pointPrompt);
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(pointPrompt);
    },
    pointerDown(info: PointerInfo) {
      const tolerance = context.controller.pixelsToUnits(PICK_TOLERANCE_PX);
      if (throughId === null) {
        const anchor = resolveAnchorPoint(info, context, working ?? undefined);
        base = context.getDocument();
        working = anchor.document;
        throughId = anchor.pointId;
        context.setStatus(linePrompt);
        return true;
      }
      const live = context.getDocument();
      const staged = restage(base ?? live, working ?? live, live);
      if (!staged?.objects[throughId]) {
        reset();
        context.setStatus("The construction inputs no longer exist");
        return true;
      }
      const reference = nearestLinearShape(info.position, staged, tolerance);
      if (!reference) {
        context.setStatus(linePrompt);
        return true;
      }
      const shape =
        variant === "perpendicular"
          ? perpendicularLine(throughId, reference)
          : parallelLine(throughId, reference);
      context.commit(addObject(staged, shape));
      reset();
      context.setStatus(pointPrompt);
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (throughId === null || !working) return;
      const tolerance = context.controller.pixelsToUnits(PICK_TOLERANCE_PX);
      const through = resolvePositions(working).get(throughId);
      const reference = nearestLinearShape(info.position, working, tolerance);
      const resolved = reference ? resolveShapePositions(working, reference) : null;
      const preview = through && resolved ? derivedLineThrough(variant, through, resolved) : null;
      if (preview) context.controller.setPreview("line", preview.a, preview.b);
      else context.controller.clearShapePreview();
    },
    pointerUp(_info: PointerInfo) {},
  };
}
