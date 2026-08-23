import type { GeoDocument, ObjectId, XY } from "../model";
import { addObject, polygon, removeObject, resolvePositions } from "../model";
import { resolveAnchorPoint } from "./anchor";
import type { PointerInfo, Tool, ToolContext } from "./types";

const MIN_VERTICES = 3;

export function createPolygonTool(context: ToolContext): Tool {
  let vertexIds: ObjectId[] = [];
  let createdIds: ObjectId[] = [];

  const settle = () => {
    vertexIds = [];
    createdIds = [];
    context.controller.clearPreview();
  };

  const cleanup = (): GeoDocument => {
    let document = context.getDocument();
    for (const id of createdIds) document = removeObject(document, id);
    if (createdIds.length > 0) context.commit(document);
    settle();
    return document;
  };

  const finish = () => {
    context.commit(addObject(context.getDocument(), polygon(vertexIds)));
    settle();
  };

  return {
    id: "polygon",
    deactivate: cleanup,
    cancel: cleanup,
    pointerDown(info: PointerInfo) {
      let base = context.getDocument();
      if (vertexIds.some((id) => !base.objects[id])) base = cleanup();
      const anchor = resolveAnchorPoint(info, context, base);
      if (vertexIds.length > 0 && anchor.pointId === vertexIds[0]) {
        if (vertexIds.length >= MIN_VERTICES) finish();
        return true;
      }
      if (vertexIds.includes(anchor.pointId)) return true;
      context.commit(anchor.document);
      vertexIds.push(anchor.pointId);
      if (!base.objects[anchor.pointId]) createdIds.push(anchor.pointId);
      return true;
    },
    pointerMove(info: PointerInfo) {
      if (vertexIds.length === 0) return;
      const positions = resolvePositions(context.getDocument());
      const vertices: XY[] = [];
      for (const id of vertexIds) {
        const position = positions.get(id);
        if (!position) {
          cleanup();
          return;
        }
        vertices.push(position);
      }
      context.controller.setPolygonPreview(vertices, context.snap(info).position);
    },
    pointerUp(_info: PointerInfo) {},
  };
}
