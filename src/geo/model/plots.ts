import type { GeoDocument, ObjectId, ParametricCurve } from "./document";
import {
  axisFrame,
  coordinatesInFrame,
  graphIntersectionInFrame,
  graphValueInFrame,
  parametricPointEvaluator,
  plotRangeContains,
} from "./document";
import { evaluateLatex, variableScope } from "./functionEval";
import type { XY } from "./geometry";
import { distance, distancePointToSegment, minimizeScalar } from "./geometry";
import { findGraphRootNear } from "./rootFinding";

export type ViewBox = readonly [left: number, top: number, right: number, bottom: number];

const SAMPLES = 240;

export function sampleFunction(document: GeoDocument, id: ObjectId, view: ViewBox): XY[][] | null {
  const object = document.objects[id];
  if (object?.kind !== "functionPlot") return null;
  const frame = object.axis ? axisFrame(document, object.axis) : null;
  const scope = variableScope(document);
  const [left, top, right, bottom] = view;
  const fragments: XY[][] = [];
  let current: XY[] = [];
  const push = (point: XY | null) => {
    if (point) {
      current.push(point);
    } else if (current.length > 0) {
      fragments.push(current);
      current = [];
    }
  };

  if (frame) {
    const corners: XY[] = [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ];
    const usq = frame.ux[0] ** 2 + frame.ux[1] ** 2;
    let min = Infinity;
    let max = -Infinity;
    for (const corner of corners) {
      const ax =
        ((corner[0] - frame.origin[0]) * frame.ux[0] +
          (corner[1] - frame.origin[1]) * frame.ux[1]) /
        usq;
      min = Math.min(min, ax);
      max = Math.max(max, ax);
    }
    const lo = object.xMin === undefined ? min : Math.max(min, object.xMin);
    const hi = object.xMax === undefined ? max : Math.min(max, object.xMax);
    if (!(lo < hi)) return null;
    for (let i = 0; i <= SAMPLES; i++) {
      const ax = lo + ((hi - lo) * i) / SAMPLES;
      const ay = evaluateLatex(object.latex, { ...scope, x: ax });
      push(
        ay === null
          ? null
          : [
              frame.origin[0] + ax * frame.ux[0] + ay * frame.uy[0],
              frame.origin[1] + ax * frame.ux[1] + ay * frame.uy[1],
            ],
      );
    }
  } else {
    const lo = object.xMin === undefined ? left : Math.max(left, object.xMin);
    const hi = object.xMax === undefined ? right : Math.min(right, object.xMax);
    if (!(lo < hi)) return null;
    for (let i = 0; i <= SAMPLES; i++) {
      const x = lo + ((hi - lo) * i) / SAMPLES;
      const y = evaluateLatex(object.latex, { ...scope, x });
      push(y === null ? null : [x, y]);
    }
  }
  if (current.length > 0) fragments.push(current);
  return fragments.length > 0 ? fragments.slice(0, 16) : null;
}

export function graphValueAt(document: GeoDocument, id: ObjectId, x: number): number | null {
  const object = document.objects[id];
  if (object?.kind !== "functionPlot") return null;
  const frame = object.axis ? axisFrame(document, object.axis) : null;
  if (object.axis && !frame) return null;
  return graphValueInFrame(object, frame, variableScope(document), x);
}

export function graphIntersectionNear(
  document: GeoDocument,
  aId: ObjectId,
  bId: ObjectId,
  near: XY,
): XY | null {
  const a = document.objects[aId];
  const b = document.objects[bId];
  if (a?.kind !== "functionPlot" || b?.kind !== "functionPlot") return null;
  if (a.axis && a.axis === b.axis) {
    const frame = axisFrame(document, a.axis);
    if (!frame) return null;
    const hit = graphIntersectionInFrame(frame, a.latex, b.latex, variableScope(document), near);
    if (!hit) return null;
    const ax = coordinatesInFrame(frame, hit)[0];
    return plotRangeContains(a, ax) && plotRangeContains(b, ax) ? hit : null;
  }
  const root = findGraphRootNear((x) => {
    const av = graphValueAt(document, aId, x);
    const bv = graphValueAt(document, bId, x);
    return av === null || bv === null ? null : av - bv;
  }, near[0]);
  const y = root === null ? null : graphValueAt(document, aId, root);
  return root !== null && y !== null ? [root, y] : null;
}

export function distanceToFragments(point: XY, fragments: XY[][]): number {
  let best = Infinity;
  for (const fragment of fragments) {
    if (fragment.length === 1) {
      best = Math.min(best, distance(point, fragment[0]));
      continue;
    }
    for (let i = 0; i + 1 < fragment.length; i++) {
      best = Math.min(best, distancePointToSegment(point, fragment[i], fragment[i + 1]));
    }
  }
  return best;
}

function evaluatorFor(
  document: GeoDocument,
  object: ParametricCurve,
  scope: Record<string, number>,
): (t: number) => XY | null {
  return parametricPointEvaluator(
    object,
    object.axis ? axisFrame(document, object.axis) : null,
    scope,
  );
}

export function invertParametric(
  document: GeoDocument,
  id: ObjectId,
  position: XY,
  samples = 200,
): number | null {
  const object = document.objects[id];
  if (object?.kind !== "parametricCurve") return null;
  const pointAt = evaluatorFor(document, object, variableScope(document));
  const distanceAt = (t: number): number => {
    const point = pointAt(t);
    return point === null ? Infinity : distance(point, position);
  };
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = object.tMin + ((object.tMax - object.tMin) * i) / samples;
    const d = distanceAt(t);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return null;
  const step = (object.tMax - object.tMin) / samples;
  const center = object.tMin + ((object.tMax - object.tMin) * bestIndex) / samples;
  return minimizeScalar(
    distanceAt,
    Math.max(object.tMin, center - step),
    Math.min(object.tMax, center + step),
  );
}

export function sampleParametric(document: GeoDocument, id: ObjectId): XY[][] | null {
  const object = document.objects[id];
  if (object?.kind !== "parametricCurve") return null;
  const pointAt = evaluatorFor(document, object, variableScope(document));
  const fragments: XY[][] = [];
  let current: XY[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = object.tMin + ((object.tMax - object.tMin) * i) / SAMPLES;
    const point = pointAt(t);
    if (point === null) {
      if (current.length > 0) {
        fragments.push(current);
        current = [];
      }
    } else {
      current.push(point);
    }
  }
  if (current.length > 0) fragments.push(current);
  return fragments.length > 0 ? fragments.slice(0, 16) : null;
}
