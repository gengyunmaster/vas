import type { GeoDocument, ObjectId, ResolvedShape, XY } from "../model";
import {
  addObject,
  axisFrame,
  curveAxisIntersectionNear,
  distance,
  distancePointToLine,
  distanceToFragments,
  distanceToShape,
  freePoint,
  graphIntersectionNear,
  graphValueAt,
  intersectGraphWithLinear,
  intersectionOf,
  intersectShapes,
  invertConicParam,
  invertLocus,
  invertParametric,
  listObjects,
  locusPoints,
  midpointOf,
  parametricIntersectionNear,
  pointOnCircle,
  pointOnConic,
  pointOnFunction,
  pointOnLinear,
  pointOnLocus,
  pointOnParametric,
  pointOnPolygon,
  polygonVerticesOf,
  resolveConic,
  resolveShapePositions,
  sampleConic,
  sampleFunction,
  sampleParametric,
  sampleThreePointParabola,
} from "../model";
import { PICK_TOLERANCE_PX } from "./constants";
import { linearObjects } from "./pick";
import type { PointerInfo, ToolContext } from "./types";

export interface AnchorResolution {
  document: GeoDocument;
  pointId: ObjectId;
}

export function resolveAnchorPoint(
  info: PointerInfo,
  context: ToolContext,
  base?: GeoDocument,
): AnchorResolution {
  const snap = context.snap(info);
  const document = base ?? context.getDocument();
  const tolerance = context.controller.pixelsToUnits(PICK_TOLERANCE_PX);

  const existing = context.controller.pickPoint(snap.position, document, tolerance);
  if (existing) return { document, pointId: existing };

  if (snap.kind === "midpoint") {
    const point = midpointOf(snap.segmentId);
    return { document: addObject(document, point), pointId: point.id };
  }

  const crossing = nearestIntersection(
    snap.position,
    document,
    tolerance,
    context.controller.viewBox(),
  );
  if (crossing) {
    const point = intersectionOf(crossing.a, crossing.b, crossing.position);
    return { document: addObject(document, point), pointId: point.id };
  }

  const host = nearestHost(snap.position, document, tolerance, context.controller.viewBox());
  if (host) {
    const point =
      host.family === "linear"
        ? pointOnLinear(host.id, host.t)
        : host.family === "circle"
          ? pointOnCircle(host.id, host.angle)
          : host.family === "polygon"
            ? pointOnPolygon(host.id, host.edge, host.t)
            : host.family === "function"
              ? pointOnFunction(host.id, host.x)
              : host.family === "conic"
                ? pointOnConic(host.id, host.u, host.branch)
                : host.family === "parametric"
                  ? pointOnParametric(host.id, host.t)
                  : pointOnLocus(host.id, host.u);
    return { document: addObject(document, point), pointId: point.id };
  }

  const point = freePoint(snap.position[0], snap.position[1]);
  return { document: addObject(document, point), pointId: point.id };
}

function nearestIntersection(
  position: XY,
  document: GeoDocument,
  tolerance: number,
  view: readonly [number, number, number, number],
): { a: ObjectId; b: ObjectId; position: XY; d: number } | null {
  const shapes = [
    ...linearObjects(document),
    ...listObjects(document, "circle"),
    ...listObjects(document, "circumcircle"),
  ].filter((object) => !object.hidden);
  // resolveShapePositions re-resolves the whole document per call, so cache
  // each shape once instead of paying O(shapes² x document) per click.
  const resolved = new Map<ObjectId, ResolvedShape | null>();
  for (const shape of shapes) resolved.set(shape.id, resolveShapePositions(document, shape.id));
  let best: { a: ObjectId; b: ObjectId; position: XY; d: number } | null = null;
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const first = resolved.get(shapes[i].id);
      const second = resolved.get(shapes[j].id);
      if (!first || !second) continue;
      for (const solution of intersectShapes(first, second)) {
        const d = distance(position, solution);
        if (d <= tolerance && (!best || d < best.d)) {
          best = { a: shapes[i].id, b: shapes[j].id, position: solution, d };
        }
      }
    }
  }

  const plots = listObjects(document, "functionPlot").filter((object) => !object.hidden);
  const graphDistance = (plotId: ObjectId): number => {
    const fragments = sampleFunction(document, plotId, view);
    return fragments ? distanceToFragments(position, fragments) : Infinity;
  };
  const nearbyPlots = plots.filter((plot) => graphDistance(plot.id) <= 4 * tolerance);
  const considerHit = (a: ObjectId, b: ObjectId, hit: XY | null) => {
    if (!hit) return;
    const d = distance(position, hit);
    if (d <= tolerance && (!best || d < best.d)) best = { a, b, position: hit, d };
  };
  for (let i = 0; i < nearbyPlots.length; i++) {
    for (let j = i + 1; j < nearbyPlots.length; j++) {
      considerHit(
        nearbyPlots[i].id,
        nearbyPlots[j].id,
        graphIntersectionNear(document, nearbyPlots[i].id, nearbyPlots[j].id, position),
      );
    }
  }
  for (const plot of nearbyPlots) {
    for (const host of shapes) {
      const shape = resolved.get(host.id);
      if (!shape || shape.type === "circle") continue;
      if (distanceToShape(position, shape) > 4 * tolerance) continue;
      considerHit(
        plot.id,
        host.id,
        intersectGraphWithLinear(
          (plotId, x) => graphValueAt(document, plotId, x),
          plot.id,
          shape,
          position,
        ),
      );
    }
  }
  const nearbyCurves = listObjects(document, "parametricCurve")
    .filter((object) => !object.hidden)
    .filter((curve) => {
      const fragments = sampleParametric(document, curve.id);
      return fragments !== null && distanceToFragments(position, fragments) <= 4 * tolerance;
    });
  for (let i = 0; i < nearbyCurves.length; i++) {
    for (let j = i + 1; j < nearbyCurves.length; j++) {
      considerHit(
        nearbyCurves[i].id,
        nearbyCurves[j].id,
        parametricIntersectionNear(document, nearbyCurves[i].id, nearbyCurves[j].id, position),
      );
    }
    for (const plot of nearbyPlots) {
      considerHit(
        nearbyCurves[i].id,
        plot.id,
        parametricIntersectionNear(document, nearbyCurves[i].id, plot.id, position),
      );
    }
  }
  for (const axes of listObjects(document, "axisSystem")) {
    if (axes.hidden) continue;
    const frame = axisFrame(document, axes.id);
    if (!frame) continue;
    const nearAxes =
      Math.min(
        distancePointToLine(position, frame.origin, [
          frame.origin[0] + frame.ux[0],
          frame.origin[1] + frame.ux[1],
        ]),
        distancePointToLine(position, frame.origin, [
          frame.origin[0] + frame.uy[0],
          frame.origin[1] + frame.uy[1],
        ]),
      ) <=
      4 * tolerance;
    if (!nearAxes) continue;
    for (const plot of nearbyPlots) {
      considerHit(
        plot.id,
        axes.id,
        curveAxisIntersectionNear(document, plot.id, axes.id, position),
      );
    }
    for (const curve of nearbyCurves) {
      considerHit(
        curve.id,
        axes.id,
        curveAxisIntersectionNear(document, curve.id, axes.id, position),
      );
    }
  }
  return best;
}

type HostCandidate =
  | { family: "linear"; id: ObjectId; t: number; d: number }
  | { family: "circle"; id: ObjectId; angle: number; d: number }
  | { family: "polygon"; id: ObjectId; edge: number; t: number; d: number }
  | { family: "function"; id: ObjectId; x: number; d: number }
  | { family: "conic"; id: ObjectId; u: number; branch: number; d: number }
  | { family: "parametric"; id: ObjectId; t: number; d: number }
  | { family: "locus"; id: ObjectId; u: number; d: number };

function nearestHost(
  position: XY,
  document: GeoDocument,
  tolerance: number,
  view: readonly [number, number, number, number],
): HostCandidate | null {
  let best: HostCandidate | null = null;
  const consider = (candidate: HostCandidate) => {
    if (candidate.d <= tolerance && (!best || candidate.d < best.d)) best = candidate;
  };

  for (const host of linearObjects(document)) {
    if (host.hidden) continue;
    const shape = resolveShapePositions(document, host.id);
    if (!shape || shape.type === "circle") continue;
    const { a, b } = shape;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 1e-12) continue;
    let t = ((position[0] - a[0]) * dx + (position[1] - a[1]) * dy) / lengthSq;
    if (shape.type === "segment") t = Math.max(0, Math.min(1, t));
    else if (shape.type === "ray") t = Math.max(0, t);
    consider({
      family: "linear",
      id: host.id,
      t,
      d: distance(position, [a[0] + t * dx, a[1] + t * dy]),
    });
  }

  for (const circle of [
    ...listObjects(document, "circle"),
    ...listObjects(document, "circumcircle"),
    ...listObjects(document, "transform"),
  ]) {
    if (circle.hidden) continue;
    const shape = resolveShapePositions(document, circle.id);
    if (shape?.type !== "circle") continue;
    consider({
      family: "circle",
      id: circle.id,
      angle: Math.atan2(position[1] - shape.center[1], position[0] - shape.center[0]),
      d: Math.abs(distance(position, shape.center) - shape.radius),
    });
  }

  for (const host of [...listObjects(document, "polygon"), ...listObjects(document, "transform")]) {
    if (host.hidden) continue;
    const vertices = polygonVerticesOf(document, host.id);
    if (!vertices || vertices.length < 2) continue;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < 1e-12) continue;
      const t = Math.max(
        0,
        Math.min(1, ((position[0] - a[0]) * dx + (position[1] - a[1]) * dy) / lengthSq),
      );
      consider({
        family: "polygon",
        id: host.id,
        edge: i,
        t,
        d: distance(position, [a[0] + t * dx, a[1] + t * dy]),
      });
    }
  }

  for (const plot of [
    ...listObjects(document, "functionPlot"),
    ...listObjects(document, "threePointParabola"),
  ]) {
    if (plot.hidden) continue;
    const fragments =
      plot.kind === "functionPlot"
        ? sampleFunction(document, plot.id, view)
        : sampleThreePointParabola(document, plot.id, view);
    if (!fragments) continue;
    const d = distanceToFragments(position, fragments);
    if (d > tolerance) continue;
    let x = position[0];
    if (plot.kind === "functionPlot" && plot.axis) {
      const frame = axisFrame(document, plot.axis);
      if (!frame) continue;
      const usq = frame.ux[0] ** 2 + frame.ux[1] ** 2;
      x =
        ((position[0] - frame.origin[0]) * frame.ux[0] +
          (position[1] - frame.origin[1]) * frame.ux[1]) /
        usq;
    }
    consider({ family: "function", id: plot.id, x, d });
  }

  for (const conic of listObjects(document, "conic")) {
    if (conic.hidden) continue;
    const fragments = sampleConic(document, conic.id);
    if (!fragments) continue;
    const d = distanceToFragments(position, fragments);
    if (d > tolerance) continue;
    const params = resolveConic(document, conic.id);
    if (!params) continue;
    const inverted = invertConicParam(params, position);
    if (!inverted) continue;
    consider({ family: "conic", id: conic.id, u: inverted.u, branch: inverted.branch, d });
  }

  for (const curve of listObjects(document, "parametricCurve")) {
    if (curve.hidden) continue;
    const fragments = sampleParametric(document, curve.id);
    if (!fragments) continue;
    const d = distanceToFragments(position, fragments);
    if (d > tolerance) continue;
    const t = invertParametric(document, curve.id, position);
    if (t === null) continue;
    consider({ family: "parametric", id: curve.id, t, d });
  }

  for (const locus of listObjects(document, "locus")) {
    if (locus.hidden) continue;
    const samples = locusPoints(document, locus.driver, locus.target, 60);
    if (!samples) continue;
    const d = distanceToFragments(position, [samples]);
    if (d > tolerance) continue;
    const u = invertLocus(document, locus.id, position, 60);
    if (u === null) continue;
    consider({ family: "locus", id: locus.id, u, d });
  }

  return best;
}
