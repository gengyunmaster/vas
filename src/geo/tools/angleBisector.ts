import type { GeoDocument, ObjectId } from "../model";
import {
  addObject,
  angleBisector,
  bisectorDirection,
  externalBisector,
  resolvePositions,
} from "../model";
import { resolveAnchorPoint } from "./anchor";
import { restage } from "./staging";
import type { PointerInfo, Tool, ToolContext } from "./types";

const PROMPTS = {
  angleBisector: {
    first: "Bisector: select a point on one side",
    vertex: "Bisector: select the vertex",
    second: "Bisector: select a point on the other side",
  },
  externalBisector: {
    first: "External bisector: select a point on one side",
    vertex: "External bisector: select the vertex",
    second: "External bisector: select a point on the other side",
  },
} as const;

export function createAngleBisectorTool(
  context: ToolContext,
  variant: "angleBisector" | "externalBisector" = "angleBisector",
): Tool {
  let base: GeoDocument | null = null;
  let working: GeoDocument | null = null;
  let picked: ObjectId[] = [];
  const prompts = PROMPTS[variant];

  const reset = () => {
    base = null;
    working = null;
    picked = [];
    context.controller.clearPreview();
  };

  return {
    id: variant,
    activate() {
      context.setStatus(prompts.first);
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(prompts.first);
    },
    pointerDown(info: PointerInfo) {
      const anchor = resolveAnchorPoint(info, context, working ?? undefined);
      if (picked.includes(anchor.pointId)) return true;
      if (picked.length === 0) base = context.getDocument();
      working = anchor.document;
      picked.push(anchor.pointId);
      if (picked.length === 1) {
        context.setStatus(prompts.vertex);
        return true;
      }
      if (picked.length === 2) {
        context.setStatus(prompts.second);
        return true;
      }
      const live = context.getDocument();
      const staged = restage(base ?? live, working ?? live, live);
      if (!staged || picked.some((pointId) => !staged.objects[pointId])) {
        reset();
        context.setStatus("The construction inputs no longer exist");
        return true;
      }
      const [p1, vertex, p2] = picked;
      context.commit(
        addObject(
          staged,
          variant === "externalBisector"
            ? externalBisector(p1, vertex, p2)
            : angleBisector(p1, vertex, p2),
        ),
      );
      reset();
      context.setStatus(prompts.first);
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (picked.length === 0 || !working) return;
      const positions = resolvePositions(working);
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
      const vertex = positions.get(picked[1]);
      if (!a || !vertex) {
        reset();
        return;
      }
      context.controller.setPolygonPreview([a, vertex], cursor);
      const direction = bisectorDirection(a, vertex, cursor);
      if (direction) {
        if (variant === "externalBisector") {
          context.controller.setPreview(
            "line",
            [vertex[0] - direction[1], vertex[1] + direction[0]],
            [vertex[0] + direction[1], vertex[1] - direction[0]],
          );
        } else {
          context.controller.setPreview("ray", vertex, [
            vertex[0] + direction[0],
            vertex[1] + direction[1],
          ]);
        }
      } else {
        context.controller.clearShapePreview();
      }
    },
    pointerUp(_info: PointerInfo) {},
  };
}
