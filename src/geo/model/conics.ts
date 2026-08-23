import type { Conic, GeoDocument, ObjectId } from "./document";
import { pointPosition, resolveShapePositions } from "./document";
import type { ResolvedShape, XY } from "./geometry";
import { distance, normalize, perpendicular } from "./geometry";

export interface ConicParams {
  type: "ellipse" | "hyperbola" | "parabola";
  center: XY;
  direction: XY;
  a: number;
  b: number;
}

const EPSILON = 1e-9;

type PointLookup = (id: ObjectId) => XY | null | undefined;
type ShapeLookup = (id: ObjectId) => ResolvedShape | null;

export function conicParamsAt(
  object: Conic,
  at: PointLookup,
  shapeAt: ShapeLookup,
): ConicParams | null {
  switch (object.conicType) {
    case "ellipse":
    case "hyperbola": {
      if (!object.focus1 || !object.focus2 || !object.pointOnCurve) return null;
      const f1 = at(object.focus1);
      const f2 = at(object.focus2);
      const p = at(object.pointOnCurve);
      if (!f1 || !f2 || !p) return null;
      const center: XY = [(f1[0] + f2[0]) / 2, (f1[1] + f2[1]) / 2];
      const c = distance(f1, f2) / 2;
      const direction = normalize([f2[0] - f1[0], f2[1] - f1[1]]);
      if (!direction || c < EPSILON) return null;
      const d1 = distance(p, f1);
      const d2 = distance(p, f2);
      if (object.conicType === "ellipse") {
        const a = (d1 + d2) / 2;
        if (a <= c + EPSILON) return null;
        return { type: "ellipse", center, direction, a, b: Math.sqrt(a * a - c * c) };
      }
      const a = Math.abs(d1 - d2) / 2;
      if (a < EPSILON || a >= c - EPSILON) return null;
      return { type: "hyperbola", center, direction, a, b: Math.sqrt(c * c - a * a) };
    }
    case "parabola": {
      if (!object.focus || !object.directrix) return null;
      const focus = at(object.focus);
      const line = shapeAt(object.directrix);
      if (!focus || !line || line.type === "circle") return null;
      return parabolaFromFocusDirectrix(focus, line.a, line.b);
    }
    case "eccentric": {
      if (!object.focus || !object.directrix || object.eccentricity === undefined) return null;
      const focus = at(object.focus);
      const line = shapeAt(object.directrix);
      if (!focus || !line || line.type === "circle") return null;
      const e = object.eccentricity;
      if (e <= 0) return null;
      const direction = normalize([line.b[0] - line.a[0], line.b[1] - line.a[1]]);
      if (!direction) return null;
      const normal = perpendicular(direction);
      const signed = (focus[0] - line.a[0]) * normal[0] + (focus[1] - line.a[1]) * normal[1];
      const d = Math.abs(signed);
      if (d < EPSILON) return null;
      const towardFocus: XY = [Math.sign(signed) * normal[0], Math.sign(signed) * normal[1]];
      if (Math.abs(e - 1) < EPSILON) {
        return parabolaFromFocusDirectrix(focus, line.a, line.b);
      }
      const a = (d * e) / Math.abs(1 - e * e);
      const c = a * e;
      const b = Math.sqrt(Math.abs(a * a - c * c));
      const sign = e < 1 ? 1 : -1;
      const center: XY = [
        focus[0] + sign * c * towardFocus[0],
        focus[1] + sign * c * towardFocus[1],
      ];
      return {
        type: e < 1 ? "ellipse" : "hyperbola",
        center,
        direction: towardFocus,
        a,
        b,
      };
    }
    default:
      return null;
  }
}

function parabolaFromFocusDirectrix(focus: XY, a: XY, b: XY): ConicParams | null {
  const direction = normalize([b[0] - a[0], b[1] - a[1]]);
  if (!direction) return null;
  const normal = perpendicular(direction);
  const signed = (focus[0] - a[0]) * normal[0] + (focus[1] - a[1]) * normal[1];
  const d = Math.abs(signed);
  if (d < EPSILON) return null;
  const towardFocus: XY = [Math.sign(signed) * normal[0], Math.sign(signed) * normal[1]];
  const vertex: XY = [focus[0] - (d / 2) * towardFocus[0], focus[1] - (d / 2) * towardFocus[1]];
  return { type: "parabola", center: vertex, direction: towardFocus, a: d / 2, b: d / 2 };
}

export function resolveConic(document: GeoDocument, id: ObjectId): ConicParams | null {
  const object = document.objects[id];
  if (object?.kind !== "conic") return null;
  return conicParamsAt(
    object,
    (pointId) => pointPosition(document, pointId),
    (shapeId) => resolveShapePositions(document, shapeId),
  );
}

export function sampleConic(document: GeoDocument, id: ObjectId, extent?: number): XY[][] | null {
  const params = resolveConic(document, id);
  if (!params) return null;
  return sampleConicParams(params, extent);
}

export function sampleConicParams(params: ConicParams, extent?: number): XY[][] {
  const { center, direction, a, b, type } = params;
  const perp = perpendicular(direction);
  const at = (along: number, across: number): XY => [
    center[0] + along * direction[0] + across * perp[0],
    center[1] + along * direction[1] + across * perp[1],
  ];
  const SAMPLES = 120;
  if (type === "ellipse") {
    const points: XY[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = (2 * Math.PI * i) / SAMPLES;
      points.push(at(a * Math.cos(t), b * Math.sin(t)));
    }
    return [points];
  }
  if (type === "hyperbola") {
    const tMax =
      extent === undefined
        ? 2
        : Math.max(2, Math.acosh(Math.max(1, extent / a)), Math.asinh(extent / b));
    const right: XY[] = [];
    const left: XY[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = -tMax + (2 * tMax * i) / SAMPLES;
      const cosh = Math.cosh(t);
      const sinh = Math.sinh(t);
      right.push(at(a * cosh, b * sinh));
      left.push(at(-a * cosh, b * sinh));
    }
    return [right, left];
  }
  const p = a;
  const points: XY[] = [];
  const span =
    extent === undefined
      ? 10 * Math.max(1, p)
      : Math.max(extent, Math.sqrt(Math.max(1, 4 * p * extent)));
  for (let i = 0; i <= SAMPLES; i++) {
    const t = -span + (2 * span * i) / SAMPLES;
    points.push(at((t * t) / (4 * p), t));
  }
  return [points];
}

export function parabolaThroughPoints(
  p1: XY,
  p2: XY,
  p3: XY,
): { a: number; b: number; c: number } | null {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  if (Math.abs(x1 - x2) < EPSILON || Math.abs(x2 - x3) < EPSILON || Math.abs(x1 - x3) < EPSILON) {
    return null;
  }
  const d12 = (y2 - y1) / (x2 - x1);
  const d23 = (y3 - y2) / (x3 - x2);
  const a = (d23 - d12) / (x3 - x1);
  const b = d12 - a * (x1 + x2);
  const c = y1 - a * x1 * x1 - b * x1;
  return { a, b, c };
}

export function sampleThreePointParabola(
  document: GeoDocument,
  id: ObjectId,
  view: readonly [number, number, number, number],
): XY[][] | null {
  const object = document.objects[id];
  if (object?.kind !== "threePointParabola") return null;
  const p1 = pointPosition(document, object.p1);
  const p2 = pointPosition(document, object.p2);
  const p3 = pointPosition(document, object.p3);
  if (!p1 || !p2 || !p3) return null;
  const coefficients = parabolaThroughPoints(p1, p2, p3);
  if (!coefficients) return null;
  const [left, , right] = view;
  const points: XY[] = [];
  for (let i = 0; i <= 240; i++) {
    const x = left + ((right - left) * i) / 240;
    points.push([x, coefficients.a * x * x + coefficients.b * x + coefficients.c]);
  }
  return [points];
}

export type ConicFeaturePoint = "focus1" | "focus2" | "center" | "vertex1" | "vertex2";
export type ConicFeatureLine = "directrix1" | "directrix2" | "asymptote1" | "asymptote2";

const focalDistance = (params: ConicParams): number =>
  params.type === "hyperbola"
    ? Math.hypot(params.a, params.b)
    : Math.sqrt(Math.abs(params.a * params.a - params.b * params.b));

export function conicFeaturePointFromParams(
  params: ConicParams,
  feature: ConicFeaturePoint,
): XY | null {
  const at = (along: number): XY => [
    params.center[0] + along * params.direction[0],
    params.center[1] + along * params.direction[1],
  ];
  switch (feature) {
    case "center":
      return params.center;
    case "focus1":
      return params.type === "parabola" ? at(params.a) : at(-focalDistance(params));
    case "focus2":
      return params.type === "parabola" ? null : at(focalDistance(params));
    case "vertex1":
      return params.type === "parabola" ? null : at(-params.a);
    case "vertex2":
      return params.type === "parabola" ? null : at(params.a);
  }
}

export function conicFeaturePointPosition(
  document: GeoDocument,
  conicId: ObjectId,
  feature: ConicFeaturePoint,
): XY | null {
  const params = resolveConic(document, conicId);
  return params ? conicFeaturePointFromParams(params, feature) : null;
}

export function conicFeatureLineFromParams(
  params: ConicParams,
  feature: ConicFeatureLine,
): { a: XY; b: XY } | null {
  const perp = perpendicular(params.direction);
  if (feature === "asymptote1" || feature === "asymptote2") {
    if (params.type !== "hyperbola") return null;
    const sign = feature === "asymptote1" ? 1 : -1;
    const slope: XY = [
      params.a * params.direction[0] + sign * params.b * perp[0],
      params.a * params.direction[1] + sign * params.b * perp[1],
    ];
    return {
      a: params.center,
      b: [params.center[0] + slope[0], params.center[1] + slope[1]],
    };
  }
  if (params.type === "parabola") {
    if (feature === "directrix2") return null;
    const foot: XY = [
      params.center[0] - params.a * params.direction[0],
      params.center[1] - params.a * params.direction[1],
    ];
    return { a: foot, b: [foot[0] + perp[0], foot[1] + perp[1]] };
  }
  const c = focalDistance(params);
  if (c < EPSILON) return null;
  const offset = (params.a * params.a) / c;
  const sign = feature === "directrix1" ? -1 : 1;
  const point: XY = [
    params.center[0] + sign * offset * params.direction[0],
    params.center[1] + sign * offset * params.direction[1],
  ];
  return { a: point, b: [point[0] + perp[0], point[1] + perp[1]] };
}

export function conicFeatureLineShape(
  document: GeoDocument,
  conicId: ObjectId,
  feature: ConicFeatureLine,
): { a: XY; b: XY } | null {
  const params = resolveConic(document, conicId);
  return params ? conicFeatureLineFromParams(params, feature) : null;
}

export function circleTangentsFromPoint(center: XY, radius: number, p: XY): XY[] {
  const d = distance(center, p);
  if (d <= radius + EPSILON) return [];
  const base = Math.atan2(p[1] - center[1], p[0] - center[0]);
  const alpha = Math.acos(radius / d);
  return [base + alpha, base - alpha].map((angle) => [
    center[0] + radius * Math.cos(angle),
    center[1] + radius * Math.sin(angle),
  ]);
}

export function circleTangentLines(center: XY, radius: number, p: XY): { a: XY; b: XY }[] {
  const d = distance(center, p);
  if (d < radius - 1e-6) return [];
  if (d <= radius + 1e-6) {
    const radial = normalize([p[0] - center[0], p[1] - center[1]]);
    if (!radial) return [];
    const direction: XY = [-radial[1], radial[0]];
    return [{ a: p, b: [p[0] + direction[0], p[1] + direction[1]] }];
  }
  return circleTangentsFromPoint(center, radius, p).map((touch) => ({ a: p, b: touch }));
}

export function conicPointPosition(params: ConicParams, u: number, branch: number): XY {
  const perp = perpendicular(params.direction);
  const along =
    params.type === "ellipse"
      ? params.a * Math.cos(u)
      : params.type === "hyperbola"
        ? branch * params.a * Math.cosh(u)
        : (u * u) / (4 * params.a);
  const across =
    params.type === "ellipse"
      ? params.b * Math.sin(u)
      : params.type === "hyperbola"
        ? params.b * Math.sinh(u)
        : u;
  return [
    params.center[0] + along * params.direction[0] + across * perp[0],
    params.center[1] + along * params.direction[1] + across * perp[1],
  ];
}

export function invertConicParam(params: ConicParams, p: XY): { u: number; branch: number } | null {
  const perp = perpendicular(params.direction);
  const along =
    (p[0] - params.center[0]) * params.direction[0] +
    (p[1] - params.center[1]) * params.direction[1];
  const across = (p[0] - params.center[0]) * perp[0] + (p[1] - params.center[1]) * perp[1];
  if (params.type === "ellipse") {
    return { u: Math.atan2(across / params.b, along / params.a), branch: 1 };
  }
  if (params.type === "hyperbola") {
    if (Math.abs(along) < params.a) return null;
    return { u: Math.asinh(across / params.b), branch: along < 0 ? -1 : 1 };
  }
  return { u: across, branch: 1 };
}

export function conicTangentFromParams(params: ConicParams, p: XY): { a: XY; b: XY } | null {
  const perp = perpendicular(params.direction);
  const along =
    (p[0] - params.center[0]) * params.direction[0] +
    (p[1] - params.center[1]) * params.direction[1];
  const across = (p[0] - params.center[0]) * perp[0] + (p[1] - params.center[1]) * perp[1];
  const residual =
    params.type === "parabola"
      ? Math.abs(along - (across * across) / (4 * params.a)) /
        Math.max(1, Math.abs(along), Math.abs(across))
      : Math.abs(
          (along * along) / (params.a * params.a) +
            (params.type === "ellipse" ? 1 : -1) * ((across * across) / (params.b * params.b)) -
            1,
        );
  if (residual > 1e-6) return null;
  let gradient: XY;
  if (params.type === "ellipse") {
    gradient = [along / (params.a * params.a), across / (params.b * params.b)];
  } else if (params.type === "hyperbola") {
    gradient = [along / (params.a * params.a), -across / (params.b * params.b)];
  } else {
    const slope = across / (2 * params.a);
    gradient = [-1, slope];
  }
  const world: XY = [
    gradient[0] * params.direction[0] + gradient[1] * perp[0],
    gradient[0] * params.direction[1] + gradient[1] * perp[1],
  ];
  const direction = normalize([-world[1], world[0]]);
  if (!direction) return null;
  return { a: p, b: [p[0] + direction[0], p[1] + direction[1]] };
}

export function tangentToConicAt(
  document: GeoDocument,
  conicId: ObjectId,
  p: XY,
): { a: XY; b: XY } | null {
  const params = resolveConic(document, conicId);
  return params ? conicTangentFromParams(params, p) : null;
}
