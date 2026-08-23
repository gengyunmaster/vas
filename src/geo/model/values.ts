import type { GeoDocument, ObjectId } from "./document";
import { pointPosition, resolveShapePositions } from "./document";
import { CONSTANT_NAMES, evaluateExpression, FUNCTION_NAMES } from "./expression";
import type { XY } from "./geometry";
import { distance } from "./geometry";

const VALUE_KINDS = new Set(["measurement", "variable", "calculation"]);

const RESERVED_NAMES = new Set([...FUNCTION_NAMES, ...CONSTANT_NAMES]);

// Plot scopes inject x/t per sample, so a value with either name would be
// shadowed in plots yet resolve in Calculate. Point names never enter
// expressions, so the reservation covers value objects only.
const PLOT_PARAMETER_NAMES = new Set(["x", "t"]);

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const INDEX_PATTERN = /^v\d+$/;

export function objectNameError(document: GeoDocument, id: ObjectId, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!NAME_PATTERN.test(trimmed)) {
    return "Names must start with a letter and contain only letters, digits and _";
  }
  const lower = trimmed.toLowerCase();
  if (INDEX_PATTERN.test(lower)) return "Names in the v1, v2, ... format are reserved";
  if (RESERVED_NAMES.has(lower)) return `"${trimmed}" is a reserved keyword`;
  const target = document.objects[id];
  if (target && VALUE_KINDS.has(target.kind) && PLOT_PARAMETER_NAMES.has(lower)) {
    return `"${trimmed}" is a reserved keyword`;
  }
  for (const object of Object.values(document.objects)) {
    if (object.id !== id && VALUE_KINDS.has(object.kind) && object.name?.toLowerCase() === lower) {
      return `Name "${trimmed}" is already used by another value`;
    }
  }
  return null;
}

export function listValueObjects(document: GeoDocument): ObjectId[] {
  return Object.values(document.objects)
    .filter((object) => VALUE_KINDS.has(object.kind))
    .map((object) => object.id);
}

export function valueIndexOf(document: GeoDocument, id: ObjectId): number | null {
  const index = listValueObjects(document).indexOf(id);
  return index < 0 ? null : index + 1;
}

export function evaluateCalculationExpression(
  document: GeoDocument,
  expression: string,
  selfId?: ObjectId,
  depth = 0,
): number | null {
  return evaluateExpression(
    expression,
    (index) => {
      const targetId = listValueObjects(document)[index - 1];
      if (!targetId || targetId === selfId) return null;
      return computeValue(document, targetId, depth + 1);
    },
    (name) => {
      for (const candidate of Object.values(document.objects)) {
        if (
          candidate.id !== selfId &&
          VALUE_KINDS.has(candidate.kind) &&
          candidate.name?.toLowerCase() === name
        ) {
          return computeValue(document, candidate.id, depth + 1);
        }
      }
      return null;
    },
  );
}

export function computeValue(document: GeoDocument, id: ObjectId, depth = 0): number | null {
  if (depth > 32) return null;
  const object = document.objects[id];
  if (!object) return null;
  switch (object.kind) {
    case "variable":
      return object.value;
    case "calculation":
      return evaluateCalculationExpression(document, object.expression, id, depth);
    case "measurement":
      return computeMeasurement(document, object);
    default:
      return null;
  }
}

function computeMeasurement(
  document: GeoDocument,
  object: Extract<GeoDocument["objects"][string], { kind: "measurement" }>,
): number | null {
  switch (object.quantity) {
    case "length": {
      if (!object.target) return null;
      const shape = resolveShapePositions(document, object.target);
      if (!shape) return null;
      if (shape.type === "segment") return distance(shape.a, shape.b);
      if (shape.type === "circle") return 2 * Math.PI * shape.radius;
      return null;
    }
    case "distance": {
      if (!object.p1 || !object.p2) return null;
      const a = pointPosition(document, object.p1);
      const b = pointPosition(document, object.p2);
      return a && b ? distance(a, b) : null;
    }
    case "angle": {
      if (!object.p1 || !object.vertex || !object.p2) return null;
      const a = pointPosition(document, object.p1);
      const vertex = pointPosition(document, object.vertex);
      const b = pointPosition(document, object.p2);
      if (!a || !vertex || !b) return null;
      const u: XY = [a[0] - vertex[0], a[1] - vertex[1]];
      const v: XY = [b[0] - vertex[0], b[1] - vertex[1]];
      const lu = Math.hypot(u[0], u[1]);
      const lv = Math.hypot(v[0], v[1]);
      if (lu < 1e-12 || lv < 1e-12) return null;
      const cosine = (u[0] * v[0] + u[1] * v[1]) / (lu * lv);
      return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
    }
    case "area": {
      if (!object.target) return null;
      const target = document.objects[object.target];
      if (!target) return null;
      if (target.kind === "circle" || target.kind === "circumcircle") {
        const shape = resolveShapePositions(document, target.id);
        return shape?.type === "circle" ? Math.PI * shape.radius * shape.radius : null;
      }
      if (target.kind === "polygon") {
        const vertices: XY[] = [];
        for (const pointId of target.points) {
          const position = pointPosition(document, pointId);
          if (!position) return null;
          vertices.push(position);
        }
        let sum = 0;
        for (let i = 0; i < vertices.length; i++) {
          const [x1, y1] = vertices[i];
          const [x2, y2] = vertices[(i + 1) % vertices.length];
          sum += x1 * y2 - x2 * y1;
        }
        return Math.abs(sum) / 2;
      }
      return null;
    }
  }
}

export function formatValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "?";
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

export const isValueObject = (object: GeoDocument["objects"][string]): boolean =>
  VALUE_KINDS.has(object.kind);
