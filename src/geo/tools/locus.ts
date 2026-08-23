import type { ObjectId } from "../model";
import { addObject, locusOf } from "../model";
import { resolveAnchorPoint } from "./anchor";
import { PICK_TOLERANCE_PX } from "./constants";
import type { PointerInfo, Tool, ToolContext } from "./types";

const DRIVER_PROMPT = "Locus: click the driver point (must lie on a line, polygon or circle)";
const TARGET_PROMPT = "Locus: click the point that traces the locus";
const DRIVER_ROLES = new Set(["onLinear", "onCircle", "onPolygon"]);

export function createLocusTool(context: ToolContext): Tool {
  let driver: ObjectId | null = null;

  const tolerance = () => context.controller.pixelsToUnits(PICK_TOLERANCE_PX);

  const reset = () => {
    driver = null;
    context.controller.clearPreview();
  };

  return {
    id: "locus",
    activate() {
      context.setStatus(DRIVER_PROMPT);
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(DRIVER_PROMPT);
    },
    pointerDown(info: PointerInfo) {
      if (driver !== null && !context.getDocument().objects[driver]) {
        driver = null;
        context.setStatus(DRIVER_PROMPT);
      }
      let document = context.getDocument();
      let pointId = context.controller.pickPoint(
        context.snap(info).position,
        document,
        tolerance(),
      );
      if (!pointId && !driver) {
        const anchor = resolveAnchorPoint(info, context);
        const created = anchor.document.objects[anchor.pointId];
        if (created?.kind === "point" && DRIVER_ROLES.has(created.role)) {
          document = anchor.document;
          pointId = anchor.pointId;
        }
      }
      if (!pointId) {
        context.setStatus("No point there");
        return true;
      }
      if (!driver) {
        const point = document.objects[pointId];
        if (point?.kind !== "point" || !DRIVER_ROLES.has(point.role)) {
          context.setStatus("The driver must be a point on a line, polygon or circle");
          return true;
        }
        if (document !== context.getDocument()) context.commit(document);
        driver = pointId;
        context.setStatus(TARGET_PROMPT);
        return true;
      }
      if (pointId === driver) return true;
      context.commit(addObject(document, locusOf(driver, pointId)));
      reset();
      context.setStatus(DRIVER_PROMPT);
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}
