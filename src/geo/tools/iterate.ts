import type { TransformSpec } from "../model";
import { addObject, iterationOf } from "../model";
import { PICK_TOLERANCE_PX } from "./constants";
import type { PointerInfo, Tool, ToolContext } from "./types";

const PROMPT = "Iterate: click the seed point (uses the marked center; set it with Mark Center)";

export function createIterationTool(context: ToolContext): Tool {
  return {
    id: "iterate",
    activate() {
      context.setStatus(PROMPT);
    },
    deactivate() {
      context.setStatus("");
    },
    cancel() {},
    pointerDown(info: PointerInfo) {
      const document = context.getDocument();
      const seed = context.controller.pickPoint(
        context.snap(info).position,
        document,
        context.controller.pixelsToUnits(PICK_TOLERANCE_PX),
      );
      if (!seed) {
        context.setStatus("No point there");
        return true;
      }
      const center = document.marks?.center;
      if (!center) {
        context.setStatus("Mark a center first (Mark Center tool)");
        return true;
      }
      const specRaw = window.prompt(
        "Transform per step: rotation angle in degrees (e.g. 30), or s + factor for scaling (e.g. s1.1)",
        "30",
      );
      if (specRaw === null) return true;
      let transform: TransformSpec;
      if (specRaw.trim().toLowerCase().startsWith("s")) {
        const factor = Number(specRaw.trim().slice(1));
        if (!Number.isFinite(factor) || factor === 0) {
          context.setStatus("Invalid factor");
          return true;
        }
        transform = { type: "scale", center, factor };
      } else {
        const angleDeg = Number(specRaw.trim());
        if (!Number.isFinite(angleDeg)) {
          context.setStatus("Invalid angle");
          return true;
        }
        transform = { type: "rotate", center, angleDeg };
      }
      const countRaw = window.prompt("Number of iterations", "20");
      if (countRaw === null) return true;
      const count = Number(countRaw);
      if (!Number.isFinite(count) || count < 1) {
        context.setStatus("Invalid count");
        return true;
      }
      context.commit(addObject(document, iterationOf(seed, transform, count)));
      context.setStatus(PROMPT);
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}
