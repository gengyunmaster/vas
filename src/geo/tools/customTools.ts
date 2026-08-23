import type { GeoDocument, GeoObject, ObjectId } from "../model";
import { addObjects, createId, dependenciesOf, isGeoObject, remapObjectReferences } from "../model";
import { resolveAnchorPoint } from "./anchor";
import type { PointerInfo, Tool, ToolContext } from "./types";

export interface CustomToolDef {
  name: string;
  givens: ObjectId[];
  objects: GeoObject[];
}

export function collectClosure(document: GeoDocument, rootId: ObjectId): GeoObject[] {
  const collected = new Map<ObjectId, GeoObject>();
  const visit = (id: ObjectId) => {
    if (collected.has(id)) return;
    const object = document.objects[id];
    if (!object) return;
    for (const dependency of dependenciesOf(object)) visit(dependency);
    collected.set(id, object);
  };
  visit(rootId);
  return [...collected.values()];
}

export function buildToolDefinition(
  name: string,
  document: GeoDocument,
  rootId: ObjectId,
): CustomToolDef | null {
  const objects = collectClosure(document, rootId);
  const givens = objects
    .filter((object) => object.kind === "point" && object.role === "free")
    .map((object) => object.id);
  if (givens.length === 0 || objects.length < 2) return null;
  return { name, givens, objects };
}

export function instantiateTool(def: CustomToolDef, givenPoints: ObjectId[]): GeoObject[] {
  const map = new Map<ObjectId, ObjectId>();
  def.givens.forEach((id, index) => {
    map.set(id, givenPoints[index]);
  });
  for (const object of def.objects) {
    if (!map.has(object.id)) map.set(object.id, createId());
  }
  return def.objects
    .filter((object) => !def.givens.includes(object.id))
    .map((object) => remapObjectReferences(object, map));
}

export function createCustomTool(def: CustomToolDef, context: ToolContext): Tool {
  let picked: ObjectId[] = [];

  const reset = () => {
    picked = [];
    context.controller.clearPreview();
  };

  const id = `custom:${def.name}`;
  return {
    id,
    activate() {
      context.setStatus(`${def.name}: click given point 1 of ${def.givens.length}`);
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(`${def.name}: click given point 1 of ${def.givens.length}`);
    },
    pointerDown(info: PointerInfo) {
      if (picked.some((pointId) => !context.getDocument().objects[pointId])) reset();
      const anchor = resolveAnchorPoint(info, context);
      if (picked.includes(anchor.pointId)) return true;
      picked.push(anchor.pointId);
      if (picked.length < def.givens.length) {
        context.commit(anchor.document);
        context.setStatus(
          `${def.name}: click given point ${picked.length + 1} of ${def.givens.length}`,
        );
        return true;
      }
      const clones = instantiateTool(def, picked);
      context.commit(addObjects(anchor.document, clones));
      reset();
      context.setStatus(`${def.name}: click given point 1 of ${def.givens.length}`);
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}

const STORAGE_KEY = "webgeo.customTools";

export function isCustomToolDef(entry: unknown): entry is CustomToolDef {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as CustomToolDef;
  if (
    typeof candidate.name !== "string" ||
    !Array.isArray(candidate.givens) ||
    !candidate.givens.every((id) => typeof id === "string") ||
    !Array.isArray(candidate.objects) ||
    !candidate.objects.every(isGeoObject)
  ) {
    return false;
  }
  if (candidate.givens.length < 1 || candidate.objects.length < 2) return false;
  const ids = new Set(candidate.objects.map((object) => object.id));
  return (
    candidate.givens.every((id) =>
      candidate.objects.some(
        (object) => object.id === id && object.kind === "point" && object.role === "free",
      ),
    ) &&
    candidate.objects.every((object) =>
      dependenciesOf(object).every((dependency) => ids.has(dependency)),
    )
  );
}

export function loadCustomTools(): CustomToolDef[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isCustomToolDef);
  } catch {
    return [];
  }
}

export function saveCustomTools(tools: CustomToolDef[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch {
    // Storage may be blocked or full; custom tools are best-effort.
  }
}
