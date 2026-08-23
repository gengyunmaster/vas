import type { ObjectId, TransformSpec } from "../model";
import { addObject, pointPosition, setMark, transformedPoint, transformedShape } from "../model";
import { PICK_TOLERANCE_PX } from "./constants";
import { nearestLinearShape } from "./pick";
import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

type TransformToolId = Extract<
  ToolId,
  "markCenter" | "markMirror" | "translate" | "rotate" | "scale" | "reflect"
>;

const TRANSFORMABLE_KINDS = new Set([
  "point",
  "segment",
  "line",
  "ray",
  "circle",
  "polygon",
  "perpendicularLine",
  "parallelLine",
  "angleBisector",
  "transform",
]);

const PROMPTS: Record<TransformToolId, string> = {
  markCenter: "Mark center: click a point to mark as the transform center",
  markMirror: "Mark mirror: click a line, ray or segment to mark as the mirror",
  translate: "Translate: click the vector start point",
  rotate: "Rotate: click the center point",
  scale: "Scale: click the center point",
  reflect: "Reflect: click the mirror line",
};

export function createTransformTool(id: TransformToolId, context: ToolContext): Tool {
  let picked: ObjectId[] = [];

  const tolerance = () => context.controller.pixelsToUnits(PICK_TOLERANCE_PX);

  const reset = () => {
    picked = [];
    context.controller.clearPreview();
  };

  const pickExistingPoint = (info: PointerInfo): ObjectId | null =>
    context.controller.pickPoint(context.snap(info).position, context.getDocument(), tolerance());

  const selectedTarget = (): ObjectId | null => {
    const selected = context.getSelected();
    const object = selected ? context.getDocument().objects[selected] : undefined;
    if (!object || !TRANSFORMABLE_KINDS.has(object.kind)) return null;
    return selected;
  };

  const createTransform = (source: ObjectId, spec: TransformSpec) => {
    const document = context.getDocument();
    const sourceObject = document.objects[source];
    if (!sourceObject) return;
    const object =
      sourceObject.kind === "point"
        ? transformedPoint(source, spec)
        : transformedShape(source, spec);
    context.commit(addObject(document, object));
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
      if (id === "markCenter") {
        const point = pickExistingPoint(info);
        if (!point) {
          context.setStatus("No point there");
          return true;
        }
        context.commit(setMark(document, "center", point));
        context.setStatus("Center marked");
        return true;
      }
      if (id === "markMirror") {
        const mirror = nearestLinearShape(info.position, document, tolerance());
        if (!mirror) {
          context.setStatus("No line there");
          return true;
        }
        context.commit(setMark(document, "mirror", mirror));
        context.setStatus("Mirror marked");
        return true;
      }

      const source = selectedTarget();
      if (!source) {
        context.setStatus("Select an object with the Select tool first");
        return true;
      }

      if (id === "translate") {
        const point = pickExistingPoint(info);
        if (!point) {
          context.setStatus("No point there");
          return true;
        }
        if (picked.includes(point)) {
          context.setStatus("Translate: click a different end point");
          return true;
        }
        picked.push(point);
        if (picked.length === 1) {
          context.setStatus("Translate: click the vector end point");
          return true;
        }
        createTransform(source, { type: "translate", from: picked[0], to: picked[1] });
        reset();
        context.setStatus(PROMPTS[id]);
        return true;
      }

      if (id === "reflect") {
        const marked = document.marks?.mirror;
        const mirror = marked ?? nearestLinearShape(info.position, document, tolerance());
        if (!mirror) {
          context.setStatus("No line there");
          return true;
        }
        createTransform(source, { type: "reflect", mirror });
        reset();
        context.setStatus(marked ? PROMPTS[id] : "Reflect: mirror used; mark one to reuse");
        return true;
      }

      const markedCenter = document.marks?.center;
      if (!markedCenter) {
        const center = pickExistingPoint(info);
        if (!center) {
          context.setStatus("No point there");
          return true;
        }
        picked.push(center);
      }
      const center = markedCenter ?? picked[0];
      if (id === "rotate") {
        const raw = window.prompt("Rotation angle in degrees", "90");
        if (raw === null) {
          reset();
          context.setStatus(PROMPTS[id]);
          return true;
        }
        const angleDeg = Number(raw);
        if (!Number.isFinite(angleDeg)) {
          context.setStatus("Invalid angle");
          reset();
          return true;
        }
        createTransform(source, { type: "rotate", center, angleDeg });
      } else {
        const raw = window.prompt("Scale factor", "2");
        if (raw === null) {
          reset();
          context.setStatus(PROMPTS[id]);
          return true;
        }
        const factor = Number(raw);
        if (!Number.isFinite(factor) || factor === 0) {
          context.setStatus("Invalid factor");
          reset();
          return true;
        }
        createTransform(source, { type: "scale", center, factor });
      }
      reset();
      context.setStatus(PROMPTS[id]);
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (picked.length === 0 || id !== "translate") return;
      const from = pointPosition(context.getDocument(), picked[0]);
      if (!from) {
        reset();
        return;
      }
      context.controller.setPreview("segment", from, context.snap(info).position);
    },
    pointerUp(_info: PointerInfo) {},
  };
}
