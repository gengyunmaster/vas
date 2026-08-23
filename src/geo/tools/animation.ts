import type { ObjectId } from "../model";
import {
  addObject,
  driverAnimationOf,
  groupAnimationOf,
  pointPosition,
  toggleAnimationOf,
  variableAnimationOf,
} from "../model";
import { resolveAnchorPoint } from "./anchor";
import { PICK_TOLERANCE_PX } from "./constants";
import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

type AnimationToolId = Extract<ToolId, "animatePoint" | "toggleButton" | "groupAnimation">;

const PROMPTS: Record<AnimationToolId, string> = {
  animatePoint: "Animate: click a point on a line, polygon, circle or conic, or a slider variable",
  toggleButton: "Toggle button: click an object to show/hide",
  groupAnimation: "Group: click animation buttons one by one; click an added one again to finish",
};

const DRIVER_ROLES = new Set(["onLinear", "onCircle", "onPolygon", "onConic"]);

export function createAnimationTool(id: AnimationToolId, context: ToolContext): Tool {
  let children: ObjectId[] = [];

  const tolerance = () => context.controller.pixelsToUnits(PICK_TOLERANCE_PX);

  const reset = () => {
    children = [];
    context.controller.clearPreview();
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
    animationClicked(animationId: ObjectId) {
      if (id !== "groupAnimation") return false;
      children = children.filter((child) => context.getDocument().objects[child]);
      if (children.includes(animationId)) {
        if (children.length < 2) return true;
        const document = context.getDocument();
        const first = document.objects[children[0]];
        const position =
          first?.kind === "animation"
            ? ([first.position[0] + 1.2, first.position[1] + 0.8] as [number, number])
            : ([0, 0] as [number, number]);
        context.commit(addObject(document, groupAnimationOf(children, position)));
        context.setStatus(PROMPTS[id]);
        reset();
        return true;
      }
      children.push(animationId);
      context.setStatus(`Group: ${children.length} added; click an added one again to finish`);
      return true;
    },
    pointerDown(info: PointerInfo) {
      const document = context.getDocument();
      if (id === "animatePoint") {
        const pickedId = context.controller.pickObject(
          context.snap(info).position,
          document,
          tolerance(),
        );
        const picked = pickedId ? document.objects[pickedId] : undefined;
        if (picked?.kind === "variable") {
          if (picked.min === undefined || picked.max === undefined) {
            context.setStatus("Give the variable a slider range (min/max) before animating it");
            return true;
          }
          context.commit(
            addObject(
              document,
              variableAnimationOf(picked.id, [picked.position[0] + 1, picked.position[1] + 0.6]),
            ),
          );
          context.setStatus(PROMPTS[id]);
          return true;
        }
        let pointId = picked?.kind === "point" ? picked.id : null;
        let working = document;
        if (!pointId) {
          const anchor = resolveAnchorPoint(info, context);
          const created = anchor.document.objects[anchor.pointId];
          if (created?.kind === "point" && DRIVER_ROLES.has(created.role)) {
            working = anchor.document;
            pointId = anchor.pointId;
          }
        }
        if (!pointId) {
          context.setStatus("Click a point on a line, polygon, circle or conic");
          return true;
        }
        const point = working.objects[pointId];
        if (point?.kind !== "point" || !DRIVER_ROLES.has(point.role)) {
          context.setStatus("Only points on a line, polygon, circle or conic can be driven");
          return true;
        }
        const position = pointPosition(working, pointId) ?? info.position;
        context.commit(
          addObject(working, driverAnimationOf(pointId, [position[0] + 1, position[1] + 0.6])),
        );
        context.setStatus(PROMPTS[id]);
        return true;
      }
      if (id === "toggleButton") {
        const target = context.controller.pickObject(info.position, document, tolerance());
        if (!target) {
          context.setStatus("No object there");
          return true;
        }
        context.commit(
          addObject(
            document,
            toggleAnimationOf(target, [info.position[0] + 1, info.position[1] + 0.6]),
          ),
        );
        context.setStatus(PROMPTS[id]);
        return true;
      }
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}
