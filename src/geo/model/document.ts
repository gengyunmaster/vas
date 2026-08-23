import {
  circleTangentLines,
  conicFeatureLineFromParams,
  conicFeaturePointFromParams,
  conicParamsAt,
  conicPointPosition,
  conicTangentFromParams,
  parabolaThroughPoints,
} from "./conics";
import { expressionIndexReferences, remapIndexReferences } from "./expression";
import { evaluateLatex, variableScope } from "./functionEval";
import type { ResolvedShape, XY } from "./geometry";
import {
  bisectorDirection,
  derivedLineThrough,
  distance,
  intersectPointFunctions,
  intersectShapes,
  minimizeScalar,
  perpendicular,
  reflectPointAcrossLine,
  rotatePoint,
  scalePoint,
  translatePoint,
} from "./geometry";
import { findGraphRootNear, findRootsInDomain } from "./rootFinding";

export type ObjectId = string;

export interface FreePoint {
  kind: "point";
  role: "free";
  id: ObjectId;
  x: number;
  y: number;
  locked?: boolean;
}

export interface OnLinearPoint {
  kind: "point";
  role: "onLinear";
  id: ObjectId;
  host: ObjectId;
  t: number;
}

export interface OnPolygonPoint {
  kind: "point";
  role: "onPolygon";
  id: ObjectId;
  host: ObjectId;
  edge: number;
  t: number;
}

export interface OnFunctionPoint {
  kind: "point";
  role: "onFunction";
  id: ObjectId;
  host: ObjectId;
  x: number;
}

export interface OnConicPoint {
  kind: "point";
  role: "onConic";
  id: ObjectId;
  host: ObjectId;
  u: number;
  branch: number;
}

export interface OnParametricPoint {
  kind: "point";
  role: "onParametric";
  id: ObjectId;
  host: ObjectId;
  t: number;
}

export interface OnLocusPoint {
  kind: "point";
  role: "onLocus";
  id: ObjectId;
  host: ObjectId;
  u: number;
}

export interface OnCirclePoint {
  kind: "point";
  role: "onCircle";
  id: ObjectId;
  circle: ObjectId;
  angle: number;
}

export interface Midpoint {
  kind: "point";
  role: "midpoint";
  id: ObjectId;
  segment: ObjectId;
}

export interface IntersectionPoint {
  kind: "point";
  role: "intersection";
  id: ObjectId;
  a: ObjectId;
  b: ObjectId;
  near: XY;
}

export interface CircleCenterPoint {
  kind: "point";
  role: "circleCenter";
  id: ObjectId;
  circle: ObjectId;
}

export type TriangleCenterKind =
  | "incenter"
  | "circumcenter"
  | "centroid"
  | "orthocenter"
  | "excenter"
  | "ninePointCenter";

export interface TriangleCenterPoint {
  kind: "point";
  role: "triangleCenter";
  id: ObjectId;
  triangle: ObjectId;
  center: TriangleCenterKind;
  vertex?: number;
}

// Coordinate display is presentational only: coordinateAxes picks the frame
// the "(x, y)" label is expressed in (undefined = follow a function-plot
// host's binding, null = board coordinates) and never affects geometry.
export interface PointDisplay {
  showCoordinates?: boolean;
  coordinateAxes?: ObjectId | null;
}

export type PointObject = (
  | FreePoint
  | OnLinearPoint
  | OnPolygonPoint
  | OnFunctionPoint
  | OnConicPoint
  | OnParametricPoint
  | OnLocusPoint
  | OnCirclePoint
  | Midpoint
  | IntersectionPoint
  | CircleCenterPoint
  | TriangleCenterPoint
  | TransformedPoint
  | ConicFeaturePoint
) &
  PointDisplay;

export interface Segment {
  kind: "segment";
  id: ObjectId;
  p1: ObjectId;
  p2: ObjectId;
}

export interface Line {
  kind: "line";
  id: ObjectId;
  p1: ObjectId;
  p2: ObjectId;
}

export interface Ray {
  kind: "ray";
  id: ObjectId;
  p1: ObjectId;
  p2: ObjectId;
}

export interface Circle {
  kind: "circle";
  id: ObjectId;
  center: ObjectId;
  through: ObjectId;
}

export interface Circumcircle {
  kind: "circumcircle";
  id: ObjectId;
  p1: ObjectId;
  p2: ObjectId;
  p3: ObjectId;
}

export interface Polygon {
  kind: "polygon";
  id: ObjectId;
  points: ObjectId[];
}

export interface PerpendicularLine {
  kind: "perpendicularLine";
  id: ObjectId;
  through: ObjectId;
  reference: ObjectId;
}

export interface ParallelLine {
  kind: "parallelLine";
  id: ObjectId;
  through: ObjectId;
  reference: ObjectId;
}

export interface AngleBisector {
  kind: "angleBisector";
  id: ObjectId;
  p1: ObjectId;
  vertex: ObjectId;
  p2: ObjectId;
  external?: boolean;
}

export type MeasureQuantity = "length" | "distance" | "angle" | "area";

export interface Measurement {
  kind: "measurement";
  id: ObjectId;
  quantity: MeasureQuantity;
  target?: ObjectId;
  p1?: ObjectId;
  p2?: ObjectId;
  vertex?: ObjectId;
  position: XY;
  locked?: number;
}

export interface Variable {
  kind: "variable";
  id: ObjectId;
  value: number;
  position: XY;
  min?: number;
  max?: number;
}

export type TransformSpec =
  | { type: "translate"; from: ObjectId; to: ObjectId }
  | { type: "rotate"; center: ObjectId; angleDeg: number }
  | { type: "scale"; center: ObjectId; factor: number }
  | { type: "reflect"; mirror: ObjectId };

export interface TransformedPoint {
  kind: "point";
  role: "transformed";
  id: ObjectId;
  source: ObjectId;
  transform: TransformSpec;
}

export interface TransformedShape {
  kind: "transform";
  id: ObjectId;
  source: ObjectId;
  transform: TransformSpec;
}

export interface Calculation {
  kind: "calculation";
  id: ObjectId;
  expression: string;
  position: XY;
  locked?: number;
}

export interface Locus {
  kind: "locus";
  id: ObjectId;
  driver: ObjectId;
  target: ObjectId;
}

export type AnimationVariant = "driver" | "toggle" | "group" | "variable";
export type AnimationMode = "once" | "loop" | "pingpong";

export interface Animation {
  kind: "animation";
  id: ObjectId;
  variant: AnimationVariant;
  target?: ObjectId;
  children?: ObjectId[];
  duration?: number;
  mode?: AnimationMode;
  position: XY;
}

export interface AxisSystem {
  kind: "axisSystem";
  id: ObjectId;
  origin: ObjectId;
  unit: ObjectId;
}

export interface NumberAxis {
  kind: "numberAxis";
  id: ObjectId;
  origin: ObjectId;
  unit: ObjectId;
}

export interface FunctionPlot {
  kind: "functionPlot";
  id: ObjectId;
  latex: string;
  axis?: ObjectId;
  xMin?: number;
  xMax?: number;
}

export interface ParametricCurve {
  kind: "parametricCurve";
  id: ObjectId;
  xLatex: string;
  yLatex: string;
  tMin: number;
  tMax: number;
  axis?: ObjectId;
}

export interface Conic {
  kind: "conic";
  id: ObjectId;
  conicType: "ellipse" | "hyperbola" | "parabola" | "eccentric";
  focus1?: ObjectId;
  focus2?: ObjectId;
  pointOnCurve?: ObjectId;
  focus?: ObjectId;
  directrix?: ObjectId;
  eccentricity?: number;
}

export interface ThreePointParabola {
  kind: "threePointParabola";
  id: ObjectId;
  p1: ObjectId;
  p2: ObjectId;
  p3: ObjectId;
}

export interface TangentLine {
  kind: "tangentLine";
  id: ObjectId;
  point: ObjectId;
  target: ObjectId;
  index: number;
}

export interface ConicLine {
  kind: "conicLine";
  id: ObjectId;
  conic: ObjectId;
  feature: "directrix1" | "directrix2" | "asymptote1" | "asymptote2";
}

export interface Iteration {
  kind: "iteration";
  id: ObjectId;
  seed: ObjectId;
  transform: TransformSpec;
  count: number;
}

export type ConicFeatureName = "focus1" | "focus2" | "center" | "vertex1" | "vertex2";

export interface ConicFeaturePoint {
  kind: "point";
  role: "conicFeature";
  id: ObjectId;
  conic: ObjectId;
  feature: ConicFeatureName;
}

export interface ObjectStyle {
  strokeColor?: string;
  strokeWidth?: number;
  dash?: number;
  fillColor?: string;
  fillOpacity?: number;
  pointSize?: number;
}

export interface Presentable {
  name?: string;
  hidden?: boolean;
  traced?: boolean;
  style?: ObjectStyle;
}

export type GeoObject = (
  | PointObject
  | Segment
  | Line
  | Ray
  | Circle
  | Polygon
  | PerpendicularLine
  | ParallelLine
  | AngleBisector
  | TransformedShape
  | Circumcircle
  | Measurement
  | Variable
  | Calculation
  | Locus
  | Animation
  | AxisSystem
  | NumberAxis
  | FunctionPlot
  | ParametricCurve
  | Conic
  | ThreePointParabola
  | TangentLine
  | ConicLine
  | Iteration
) &
  Presentable;

export interface DocumentMarks {
  center?: ObjectId;
  mirror?: ObjectId;
}

export interface GeoDocument {
  version: 1;
  objects: Record<ObjectId, GeoObject>;
  marks?: DocumentMarks;
}

export const createDocument = (): GeoDocument => ({ version: 1, objects: {} });

export const createId = (): ObjectId =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const freePoint = (x: number, y: number): FreePoint => ({
  kind: "point",
  role: "free",
  id: createId(),
  x,
  y,
});

export const segment = (p1: ObjectId, p2: ObjectId): Segment => ({
  kind: "segment",
  id: createId(),
  p1,
  p2,
});

export const line = (p1: ObjectId, p2: ObjectId): Line => ({
  kind: "line",
  id: createId(),
  p1,
  p2,
});

export const ray = (p1: ObjectId, p2: ObjectId): Ray => ({
  kind: "ray",
  id: createId(),
  p1,
  p2,
});

export const circle = (center: ObjectId, through: ObjectId): Circle => ({
  kind: "circle",
  id: createId(),
  center,
  through,
});

export const polygon = (points: ObjectId[]): Polygon => ({
  kind: "polygon",
  id: createId(),
  points: [...points],
});

export const perpendicularLine = (through: ObjectId, reference: ObjectId): PerpendicularLine => ({
  kind: "perpendicularLine",
  id: createId(),
  through,
  reference,
});

export const parallelLine = (through: ObjectId, reference: ObjectId): ParallelLine => ({
  kind: "parallelLine",
  id: createId(),
  through,
  reference,
});

export const angleBisector = (p1: ObjectId, vertex: ObjectId, p2: ObjectId): AngleBisector => ({
  kind: "angleBisector",
  id: createId(),
  p1,
  vertex,
  p2,
});

export const externalBisector = (p1: ObjectId, vertex: ObjectId, p2: ObjectId): AngleBisector => ({
  kind: "angleBisector",
  id: createId(),
  p1,
  vertex,
  p2,
  external: true,
});

export const circumcircleOf = (p1: ObjectId, p2: ObjectId, p3: ObjectId): Circumcircle => ({
  kind: "circumcircle",
  id: createId(),
  p1,
  p2,
  p3,
});

export const circleCenterOf = (circle: ObjectId): CircleCenterPoint => ({
  kind: "point",
  role: "circleCenter",
  id: createId(),
  circle,
});

export const triangleCenterOf = (
  triangle: ObjectId,
  center: TriangleCenterKind,
  vertex?: number,
): TriangleCenterPoint => ({
  kind: "point",
  role: "triangleCenter",
  id: createId(),
  triangle,
  center,
  vertex,
});

export const pointOnLinear = (host: ObjectId, t: number): OnLinearPoint => ({
  kind: "point",
  role: "onLinear",
  id: createId(),
  host,
  t,
});

export const pointOnPolygon = (host: ObjectId, edge: number, t: number): OnPolygonPoint => ({
  kind: "point",
  role: "onPolygon",
  id: createId(),
  host,
  edge: Math.max(0, Math.floor(edge)),
  t: Math.max(0, Math.min(1, t)),
});

export const pointOnFunction = (host: ObjectId, x: number): OnFunctionPoint => ({
  kind: "point",
  role: "onFunction",
  id: createId(),
  host,
  x,
});

export const pointOnConic = (host: ObjectId, u: number, branch: number): OnConicPoint => ({
  kind: "point",
  role: "onConic",
  id: createId(),
  host,
  u,
  branch: branch < 0 ? -1 : 1,
});

export const pointOnParametric = (host: ObjectId, t: number): OnParametricPoint => ({
  kind: "point",
  role: "onParametric",
  id: createId(),
  host,
  t,
});

export const pointOnLocus = (host: ObjectId, u: number): OnLocusPoint => ({
  kind: "point",
  role: "onLocus",
  id: createId(),
  host,
  u,
});

export const pointOnCircle = (circle: ObjectId, angle: number): OnCirclePoint => ({
  kind: "point",
  role: "onCircle",
  id: createId(),
  circle,
  angle,
});

export const midpointOf = (segment: ObjectId): Midpoint => ({
  kind: "point",
  role: "midpoint",
  id: createId(),
  segment,
});

export const intersectionOf = (a: ObjectId, b: ObjectId, near: XY): IntersectionPoint => ({
  kind: "point",
  role: "intersection",
  id: createId(),
  a,
  b,
  near,
});

export const lengthOf = (target: ObjectId, position: XY): Measurement => ({
  kind: "measurement",
  id: createId(),
  quantity: "length",
  target,
  position,
});

export const distanceBetween = (p1: ObjectId, p2: ObjectId, position: XY): Measurement => ({
  kind: "measurement",
  id: createId(),
  quantity: "distance",
  p1,
  p2,
  position,
});

export const angleMeasure = (
  p1: ObjectId,
  vertex: ObjectId,
  p2: ObjectId,
  position: XY,
): Measurement => ({
  kind: "measurement",
  id: createId(),
  quantity: "angle",
  p1,
  vertex,
  p2,
  position,
});

export const areaOf = (target: ObjectId, position: XY): Measurement => ({
  kind: "measurement",
  id: createId(),
  quantity: "area",
  target,
  position,
});

export const variableAt = (value: number, position: XY): Variable => ({
  kind: "variable",
  id: createId(),
  value,
  position,
});

export const transformedPoint = (source: ObjectId, transform: TransformSpec): TransformedPoint => ({
  kind: "point",
  role: "transformed",
  id: createId(),
  source,
  transform,
});

export const transformedShape = (source: ObjectId, transform: TransformSpec): TransformedShape => ({
  kind: "transform",
  id: createId(),
  source,
  transform,
});

export const locusOf = (driver: ObjectId, target: ObjectId): Locus => ({
  kind: "locus",
  id: createId(),
  driver,
  target,
});

export const driverAnimationOf = (target: ObjectId, position: XY): Animation => ({
  kind: "animation",
  id: createId(),
  variant: "driver",
  target,
  position,
});

export const toggleAnimationOf = (target: ObjectId, position: XY): Animation => ({
  kind: "animation",
  id: createId(),
  variant: "toggle",
  target,
  position,
});

export const variableAnimationOf = (target: ObjectId, position: XY): Animation => ({
  kind: "animation",
  id: createId(),
  variant: "variable",
  target,
  position,
});

export const groupAnimationOf = (children: ObjectId[], position: XY): Animation => ({
  kind: "animation",
  id: createId(),
  variant: "group",
  children: [...children],
  position,
});

export const axisSystemOf = (origin: ObjectId, unit: ObjectId): AxisSystem => ({
  kind: "axisSystem",
  id: createId(),
  origin,
  unit,
});

export const numberAxisOf = (origin: ObjectId, unit: ObjectId): NumberAxis => ({
  kind: "numberAxis",
  id: createId(),
  origin,
  unit,
});

export const functionPlotOf = (
  latex: string,
  axis?: ObjectId,
  xMin?: number,
  xMax?: number,
): FunctionPlot => ({
  kind: "functionPlot",
  id: createId(),
  latex,
  axis,
  xMin,
  xMax,
});

export const parametricCurveOf = (
  xLatex: string,
  yLatex: string,
  tMin: number,
  tMax: number,
  axis?: ObjectId,
): ParametricCurve => ({
  kind: "parametricCurve",
  id: createId(),
  xLatex,
  yLatex,
  tMin,
  tMax,
  axis,
});

export const conicOf = (
  conicType: Conic["conicType"],
  refs: Partial<
    Pick<Conic, "focus1" | "focus2" | "pointOnCurve" | "focus" | "directrix" | "eccentricity">
  >,
): Conic => ({
  kind: "conic",
  id: createId(),
  conicType,
  ...refs,
});

export const threePointParabolaOf = (
  p1: ObjectId,
  p2: ObjectId,
  p3: ObjectId,
): ThreePointParabola => ({
  kind: "threePointParabola",
  id: createId(),
  p1,
  p2,
  p3,
});

export const tangentLineOf = (point: ObjectId, target: ObjectId, index: number): TangentLine => ({
  kind: "tangentLine",
  id: createId(),
  point,
  target,
  index,
});

export const conicLineOf = (conic: ObjectId, feature: ConicLine["feature"]): ConicLine => ({
  kind: "conicLine",
  id: createId(),
  conic,
  feature,
});

export const conicFeaturePointOf = (
  conic: ObjectId,
  feature: ConicFeatureName,
): ConicFeaturePoint => ({
  kind: "point",
  role: "conicFeature",
  id: createId(),
  conic,
  feature,
});

export const iterationOf = (
  seed: ObjectId,
  transform: TransformSpec,
  count: number,
): Iteration => ({
  kind: "iteration",
  id: createId(),
  seed,
  transform,
  count: Math.min(500, Math.max(1, Math.floor(count))),
});

export const calculationAt = (expression: string, position: XY): Calculation => ({
  kind: "calculation",
  id: createId(),
  expression,
  position,
});

export function addObjects(document: GeoDocument, objects: GeoObject[]): GeoDocument {
  if (objects.length === 0) return document;
  const next = { ...document.objects };
  for (const object of objects) next[object.id] = object;
  return { ...document, objects: next };
}

export const addObject = (document: GeoDocument, object: GeoObject): GeoDocument =>
  addObjects(document, [object]);

export function movePoint(document: GeoDocument, id: ObjectId, x: number, y: number): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "point" || object.role !== "free" || object.locked) {
    return document;
  }
  if (object.x === x && object.y === y) return document;
  return { ...document, objects: { ...document.objects, [id]: { ...object, x, y } } };
}

export function setPointLocked(document: GeoDocument, id: ObjectId, locked: boolean): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "point" || object.role !== "free") return document;
  if ((object.locked ?? false) === locked) return document;
  const next = { ...object };
  if (locked) next.locked = true;
  else delete next.locked;
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function updatePointDisplay(
  document: GeoDocument,
  id: ObjectId,
  patch: { showCoordinates?: boolean; coordinateAxes?: ObjectId | null | "auto" },
): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "point") return document;
  const axes = patch.coordinateAxes;
  if (
    typeof axes === "string" &&
    axes !== "auto" &&
    document.objects[axes]?.kind !== "axisSystem"
  ) {
    return document;
  }
  const showChanged =
    patch.showCoordinates !== undefined &&
    patch.showCoordinates !== (object.showCoordinates ?? false);
  const axesChanged =
    axes !== undefined &&
    axes !== (object.coordinateAxes === undefined ? "auto" : object.coordinateAxes);
  if (!showChanged && !axesChanged) return document;
  const next = { ...object };
  if (patch.showCoordinates !== undefined) {
    if (patch.showCoordinates) next.showCoordinates = true;
    else delete next.showCoordinates;
  }
  if (axes !== undefined) {
    if (axes === "auto") delete next.coordinateAxes;
    else next.coordinateAxes = axes;
  }
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function renameObject(document: GeoDocument, id: ObjectId, name: string): GeoDocument {
  const object = document.objects[id];
  if (!object) return document;
  const trimmed = name.trim();
  if ((object.name ?? "") === trimmed) return document;
  const next = { ...object };
  if (trimmed) next.name = trimmed;
  else delete next.name;
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function setObjectHidden(document: GeoDocument, id: ObjectId, hidden: boolean): GeoDocument {
  const object = document.objects[id];
  if (!object || (object.hidden ?? false) === hidden) return document;
  const next = { ...object };
  if (hidden) next.hidden = true;
  else delete next.hidden;
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function setObjectTraced(document: GeoDocument, id: ObjectId, traced: boolean): GeoDocument {
  const object = document.objects[id];
  if (!object || (object.traced ?? false) === traced) return document;
  const next = { ...object };
  if (traced) next.traced = true;
  else delete next.traced;
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function updateAnimationSettings(
  document: GeoDocument,
  id: ObjectId,
  patch: { duration?: number; mode?: AnimationMode },
): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "animation") return document;
  if (
    (patch.duration === undefined || patch.duration === object.duration) &&
    (patch.mode === undefined || patch.mode === object.mode)
  ) {
    return document;
  }
  return { ...document, objects: { ...document.objects, [id]: { ...object, ...patch } } };
}

export function updatePlotExpressions(
  document: GeoDocument,
  id: ObjectId,
  patch: {
    latex?: string;
    xLatex?: string;
    yLatex?: string;
    tMin?: number;
    tMax?: number;
    axis?: ObjectId | null;
    xMin?: number | null;
    xMax?: number | null;
  },
): GeoDocument {
  const object = document.objects[id];
  if (!object || (object.kind !== "functionPlot" && object.kind !== "parametricCurve")) {
    return document;
  }
  const { axis, xMin, xMax, ...expressions } = patch;
  const record = object as unknown as Record<string, unknown>;
  const expressionsChanged = Object.entries(expressions).some(
    ([key, value]) => record[key] !== value,
  );
  const axisChanged =
    axis !== undefined && (axis === null ? object.axis !== undefined : object.axis !== axis);
  const rangeEntries =
    object.kind === "functionPlot"
      ? (
          [
            ["xMin", xMin],
            ["xMax", xMax],
          ] as const
        ).filter(
          (entry): entry is readonly ["xMin" | "xMax", number | null] => entry[1] !== undefined,
        )
      : [];
  const rangeChanged = rangeEntries.some(([key, value]) =>
    value === null ? record[key] !== undefined : record[key] !== value,
  );
  if (!expressionsChanged && !axisChanged && !rangeChanged) return document;
  const next = { ...object, ...expressions };
  if (axis !== undefined) {
    if (axis === null) delete next.axis;
    else if (document.objects[axis]?.kind === "axisSystem") next.axis = axis;
    else return document;
  }
  const target = next as unknown as Record<string, unknown>;
  for (const [key, value] of rangeEntries) {
    if (value === null) delete target[key];
    else target[key] = value;
  }
  const nextXMin = target.xMin as number | undefined;
  const nextXMax = target.xMax as number | undefined;
  if (nextXMin !== undefined && nextXMax !== undefined && nextXMin >= nextXMax) {
    return document;
  }
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function updateObjectStyle(
  document: GeoDocument,
  id: ObjectId,
  patch: ObjectStyle,
): GeoDocument {
  const object = document.objects[id];
  if (!object) return document;
  const changed = Object.entries(patch).some(
    ([key, value]) => (object.style as Record<string, unknown> | undefined)?.[key] !== value,
  );
  if (!changed) return document;
  return {
    ...document,
    objects: { ...document.objects, [id]: { ...object, style: { ...object.style, ...patch } } },
  };
}

export function setVariableValue(document: GeoDocument, id: ObjectId, value: number): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "variable" || object.value === value) return document;
  return { ...document, objects: { ...document.objects, [id]: { ...object, value } } };
}

export function setVariableRange(
  document: GeoDocument,
  id: ObjectId,
  min: number | null,
  max: number | null,
): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "variable") return document;
  if (min !== null && max !== null && !(min < max)) return document;
  const nextMin = min ?? undefined;
  const nextMax = max ?? undefined;
  if (object.min === nextMin && object.max === nextMax) return document;
  const next = { ...object };
  if (nextMin === undefined) delete next.min;
  else next.min = nextMin;
  if (nextMax === undefined) delete next.max;
  else next.max = nextMax;
  if (next.min !== undefined && next.max !== undefined) {
    next.value = Math.max(next.min, Math.min(next.max, next.value));
  }
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function setValueLock(
  document: GeoDocument,
  id: ObjectId,
  locked: number | null,
): GeoDocument {
  const object = document.objects[id];
  if (!object || (object.kind !== "measurement" && object.kind !== "calculation")) {
    return document;
  }
  if (locked === null && object.locked === undefined) return document;
  if (locked !== null && object.locked === locked) return document;
  const next = { ...object };
  if (locked === null) delete next.locked;
  else next.locked = locked;
  return { ...document, objects: { ...document.objects, [id]: next } };
}

export function setCalculationExpression(
  document: GeoDocument,
  id: ObjectId,
  expression: string,
): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "calculation" || object.expression === expression) return document;
  return { ...document, objects: { ...document.objects, [id]: { ...object, expression } } };
}

export function moveTextPosition(document: GeoDocument, id: ObjectId, position: XY): GeoDocument {
  const object = document.objects[id];
  if (
    !object ||
    (object.kind !== "measurement" && object.kind !== "variable" && object.kind !== "calculation")
  ) {
    return document;
  }
  if (object.position[0] === position[0] && object.position[1] === position[1]) return document;
  return { ...document, objects: { ...document.objects, [id]: { ...object, position } } };
}

export function slidePoint(
  document: GeoDocument,
  id: ObjectId,
  value: number,
  branch?: number,
): GeoDocument {
  const object = document.objects[id];
  if (object?.kind !== "point") return document;
  if (object.role === "onLinear") {
    const t = clampLinearParameter(document, object.host, value);
    if (t === object.t) return document;
    return { ...document, objects: { ...document.objects, [id]: { ...object, t } } };
  }
  if (object.role === "onPolygon") {
    const edge = Math.max(0, Math.floor(value));
    const t = Math.max(0, Math.min(1, value - Math.floor(value)));
    if (edge === object.edge && t === object.t) return document;
    return { ...document, objects: { ...document.objects, [id]: { ...object, edge, t } } };
  }
  if (object.role === "onFunction") {
    if (value === object.x) return document;
    return { ...document, objects: { ...document.objects, [id]: { ...object, x: value } } };
  }
  if (object.role === "onConic") {
    const nextBranch = branch === undefined ? object.branch : branch < 0 ? -1 : 1;
    if (value === object.u && nextBranch === object.branch) return document;
    return {
      ...document,
      objects: { ...document.objects, [id]: { ...object, u: value, branch: nextBranch } },
    };
  }
  if (object.role === "onParametric") {
    if (value === object.t) return document;
    return { ...document, objects: { ...document.objects, [id]: { ...object, t: value } } };
  }
  if (object.role === "onLocus") {
    if (value === object.u) return document;
    return { ...document, objects: { ...document.objects, [id]: { ...object, u: value } } };
  }
  if (object.role === "onCircle") {
    if (value === object.angle) return document;
    return { ...document, objects: { ...document.objects, [id]: { ...object, angle: value } } };
  }
  return document;
}

function clampLinearParameter(document: GeoDocument, host: ObjectId, t: number): number {
  const shape = resolveShapePositions(document, host);
  if (shape?.type === "segment") return Math.max(0, Math.min(1, t));
  if (shape?.type === "ray") return Math.max(0, t);
  return t;
}

export function setMark(
  document: GeoDocument,
  key: keyof DocumentMarks,
  id: ObjectId | null,
): GeoDocument {
  const marks = { ...document.marks };
  if (id) marks[key] = id;
  else delete marks[key];
  return { ...document, marks };
}

export function removeObject(document: GeoDocument, id: ObjectId): GeoDocument {
  if (!document.objects[id]) return document;
  const removed = new Set<ObjectId>([id]);
  const valueOrder = Object.values(document.objects)
    .filter(
      (object) =>
        object.kind === "measurement" ||
        object.kind === "variable" ||
        object.kind === "calculation",
    )
    .map((object) => object.id);
  const removedValueIndices = (): Set<number> => {
    const indices = new Set<number>();
    valueOrder.forEach((valueId, position) => {
      if (removed.has(valueId)) indices.add(position + 1);
    });
    return indices;
  };
  // The value-index sweep can remove objects (calculations) that have their
  // own dependents, so both sweeps repeat until a joint fixpoint.
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of Object.values(document.objects)) {
      if (removed.has(object.id)) continue;
      if (dependenciesOf(object).some((dependency) => removed.has(dependency))) {
        removed.add(object.id);
        changed = true;
      }
    }
    const indices = removedValueIndices();
    if (indices.size > 0) {
      for (const object of Object.values(document.objects)) {
        if (removed.has(object.id) || object.kind !== "calculation") continue;
        if (expressionIndexReferences(object.expression).some((index) => indices.has(index))) {
          removed.add(object.id);
          changed = true;
        }
      }
    }
  }
  const indices = removedValueIndices();
  const rewritten = new Map<ObjectId, string>();
  if (indices.size > 0) {
    const remap = (index: number): number | null => {
      if (indices.has(index)) return null;
      let shift = 0;
      for (const removedIndex of indices) {
        if (removedIndex < index) shift++;
      }
      return index - shift;
    };
    for (const object of Object.values(document.objects)) {
      if (removed.has(object.id) || object.kind !== "calculation") continue;
      const expression = remapIndexReferences(object.expression, remap);
      if (expression !== null && expression !== object.expression) {
        rewritten.set(object.id, expression);
      }
    }
  }
  const next: Record<ObjectId, GeoObject> = {};
  for (const object of Object.values(document.objects)) {
    if (removed.has(object.id)) continue;
    let survivor = object;
    // Coordinate labels fall back to auto instead of cascading deletion.
    if (
      object.kind === "point" &&
      typeof object.coordinateAxes === "string" &&
      removed.has(object.coordinateAxes)
    ) {
      survivor = { ...object };
      delete survivor.coordinateAxes;
    }
    const expression = rewritten.get(object.id);
    if (expression !== undefined && survivor.kind === "calculation") {
      survivor = { ...survivor, expression };
    }
    next[object.id] = survivor;
  }
  let marks = document.marks;
  if (
    marks &&
    ((marks.center && removed.has(marks.center)) || (marks.mirror && removed.has(marks.mirror)))
  ) {
    marks = { ...marks };
    if (marks.center && removed.has(marks.center)) delete marks.center;
    if (marks.mirror && removed.has(marks.mirror)) delete marks.mirror;
  }
  return { ...document, objects: next, marks };
}

export function dependenciesOf(object: GeoObject): ObjectId[] {
  if (object.kind === "segment" || object.kind === "line" || object.kind === "ray") {
    return [object.p1, object.p2];
  }
  if (object.kind === "circle") return [object.center, object.through];
  if (object.kind === "circumcircle") return [object.p1, object.p2, object.p3];
  if (object.kind === "polygon") return object.points;
  if (object.kind === "perpendicularLine" || object.kind === "parallelLine") {
    return [object.through, object.reference];
  }
  if (object.kind === "angleBisector") return [object.p1, object.vertex, object.p2];
  if (object.kind === "measurement") {
    if (object.target) return [object.target];
    return [object.p1, object.vertex, object.p2].filter(
      (id): id is ObjectId => typeof id === "string",
    );
  }
  if (object.kind === "variable" || object.kind === "calculation") return [];
  if (object.kind === "locus") return [object.driver, object.target];
  if (object.kind === "animation") {
    if (object.variant === "group") return object.children ?? [];
    return object.target ? [object.target] : [];
  }
  if (object.kind === "axisSystem" || object.kind === "numberAxis") {
    return [object.origin, object.unit];
  }
  if (object.kind === "functionPlot") return object.axis ? [object.axis] : [];
  if (object.kind === "parametricCurve") return object.axis ? [object.axis] : [];
  if (object.kind === "conic") {
    return [
      object.focus1,
      object.focus2,
      object.pointOnCurve,
      object.focus,
      object.directrix,
    ].filter((id): id is ObjectId => typeof id === "string");
  }
  if (object.kind === "threePointParabola") return [object.p1, object.p2, object.p3];
  if (object.kind === "tangentLine") return [object.point, object.target];
  if (object.kind === "conicLine") return [object.conic];
  if (object.kind === "iteration") return [object.seed, ...transformRefs(object.transform)];
  if (object.kind === "transform") return [object.source, ...transformRefs(object.transform)];
  switch (object.role) {
    case "free":
      return [];
    case "onLinear":
    case "onPolygon":
    case "onFunction":
    case "onConic":
    case "onParametric":
    case "onLocus":
      return [object.host];
    case "midpoint":
      return [object.segment];
    case "onCircle":
      return [object.circle];
    case "circleCenter":
      return [object.circle];
    case "triangleCenter":
      return [object.triangle];
    case "intersection":
      return [object.a, object.b];
    case "transformed":
      return [object.source, ...transformRefs(object.transform)];
    case "conicFeature":
      return [object.conic];
  }
}

export function transformRefs(spec: TransformSpec): ObjectId[] {
  switch (spec.type) {
    case "translate":
      return [spec.from, spec.to];
    case "rotate":
    case "scale":
      return [spec.center];
    case "reflect":
      return [spec.mirror];
  }
}

type PositionLookup = (id: ObjectId) => XY | null | undefined;
type ShapeLookup = (id: ObjectId) => ResolvedShape | null;

const applyTransformToPoint = (
  spec: TransformSpec,
  p: XY,
  at: PositionLookup,
  shapeAt: ShapeLookup,
): XY | null => {
  switch (spec.type) {
    case "translate": {
      const from = at(spec.from);
      const to = at(spec.to);
      if (!from || !to) return null;
      return translatePoint(p, [to[0] - from[0], to[1] - from[1]]);
    }
    case "rotate": {
      const center = at(spec.center);
      return center ? rotatePoint(p, center, (spec.angleDeg * Math.PI) / 180) : null;
    }
    case "scale": {
      const center = at(spec.center);
      return center ? scalePoint(p, center, spec.factor) : null;
    }
    case "reflect": {
      const mirror = shapeAt(spec.mirror);
      if (!mirror || mirror.type === "circle") return null;
      return reflectPointAcrossLine(p, mirror.a, mirror.b);
    }
  }
};

const applyTransformToShape = (
  shape: ResolvedShape,
  spec: TransformSpec,
  at: PositionLookup,
  shapeAt: ShapeLookup,
): ResolvedShape | null => {
  if (shape.type === "circle") {
    const center = applyTransformToPoint(spec, shape.center, at, shapeAt);
    if (!center) return null;
    const radius = spec.type === "scale" ? shape.radius * Math.abs(spec.factor) : shape.radius;
    return { type: "circle", center, radius };
  }
  const a = applyTransformToPoint(spec, shape.a, at, shapeAt);
  const b = applyTransformToPoint(spec, shape.b, at, shapeAt);
  return a && b ? { ...shape, a, b } : null;
};

const linearShape = (object: Segment | Line | Ray, at: PositionLookup): ResolvedShape | null => {
  const a = at(object.p1);
  const b = at(object.p2);
  if (!a || !b) return null;
  switch (object.kind) {
    case "segment":
      return { type: "segment", a, b };
    case "line":
      return { type: "line", a, b };
    case "ray":
      return { type: "ray", a, b };
  }
};

const circleShape = (object: Circle, at: PositionLookup): ResolvedShape | null => {
  const center = at(object.center);
  const through = at(object.through);
  return center && through ? { type: "circle", center, radius: distance(center, through) } : null;
};

export const circumcenterOf = (a: XY, b: XY, c: XY): XY | null => {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  return [
    (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d,
    (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d,
  ];
};

const circumcircleShape = (object: Circumcircle, at: PositionLookup): ResolvedShape | null => {
  const a = at(object.p1);
  const b = at(object.p2);
  const c = at(object.p3);
  if (!a || !b || !c) return null;
  const center = circumcenterOf(a, b, c);
  return center ? { type: "circle", center, radius: distance(center, a) } : null;
};

const triangleCenterPosition = (
  vertices: XY[],
  center: TriangleCenterKind,
  vertex = 0,
): XY | null => {
  if (vertices.length !== 3) return null;
  const [a, b, c] = vertices;
  const sideA = distance(b, c);
  const sideB = distance(c, a);
  const sideC = distance(a, b);
  if (sideA < 1e-12 || sideB < 1e-12 || sideC < 1e-12) return null;
  switch (center) {
    case "centroid":
      return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    case "incenter": {
      const perimeter = sideA + sideB + sideC;
      return [
        (sideA * a[0] + sideB * b[0] + sideC * c[0]) / perimeter,
        (sideA * a[1] + sideB * b[1] + sideC * c[1]) / perimeter,
      ];
    }
    case "circumcenter":
      return circumcenterOf(a, b, c);
    case "orthocenter": {
      const o = circumcenterOf(a, b, c);
      return o ? [a[0] + b[0] + c[0] - 2 * o[0], a[1] + b[1] + c[1] - 2 * o[1]] : null;
    }
    case "ninePointCenter": {
      const o = circumcenterOf(a, b, c);
      return o ? [(a[0] + b[0] + c[0] - o[0]) / 2, (a[1] + b[1] + c[1] - o[1]) / 2] : null;
    }
    case "excenter": {
      const weights: [number, number, number][] = [
        [-sideA, sideB, sideC],
        [sideA, -sideB, sideC],
        [sideA, sideB, -sideC],
      ];
      const [wa, wb, wc] = weights[vertex] ?? weights[0];
      const sum = wa + wb + wc;
      if (Math.abs(sum) < 1e-12) return null;
      return [(wa * a[0] + wb * b[0] + wc * c[0]) / sum, (wa * a[1] + wb * b[1] + wc * c[1]) / sum];
    }
  }
};

const derivedLineShape = (
  object: PerpendicularLine | ParallelLine | AngleBisector,
  shapeAt: (id: ObjectId) => ResolvedShape | null,
  at: PositionLookup,
): ResolvedShape | null => {
  if (object.kind === "angleBisector") {
    const a = at(object.p1);
    const vertex = at(object.vertex);
    const b = at(object.p2);
    if (!a || !vertex || !b) return null;
    const direction = bisectorDirection(a, vertex, b);
    if (!direction) return null;
    if (object.external) {
      return {
        type: "line",
        a: [vertex[0] - direction[1], vertex[1] + direction[0]],
        b: [vertex[0] + direction[1], vertex[1] - direction[0]],
      };
    }
    return { type: "ray", a: vertex, b: [vertex[0] + direction[0], vertex[1] + direction[1]] };
  }
  const through = at(object.through);
  const reference = shapeAt(object.reference);
  if (!through || !reference) return null;
  const variant = object.kind === "perpendicularLine" ? "perpendicular" : "parallel";
  const resolved = derivedLineThrough(variant, through, reference);
  return resolved ? { type: "line", a: resolved.a, b: resolved.b } : null;
};

let onLocusResolutionDepth = 0;

export function resolvePositions(
  document: GeoDocument,
  overrides?: Map<ObjectId, number>,
): Map<ObjectId, XY> {
  const cache = new Map<ObjectId, XY>();
  const resolving = new Set<ObjectId>();
  let scopeCache: Record<string, number> | null = null;
  const currentScope = (): Record<string, number> => {
    scopeCache ??= variableScope(document);
    return scopeCache;
  };
  const resolvePoint = (id: ObjectId): XY | null => {
    const cached = cache.get(id);
    if (cached) return cached;
    const object = document.objects[id];
    if (object?.kind !== "point" || resolving.has(id)) return null;
    resolving.add(id);
    let position: XY | null = null;
    switch (object.role) {
      case "free":
        position = [object.x, object.y];
        break;
      case "onLinear": {
        const shape = resolveShape(object.host);
        if (shape && shape.type !== "circle") {
          const t = overrides?.get(object.id) ?? object.t;
          position = [
            shape.a[0] + (shape.b[0] - shape.a[0]) * t,
            shape.a[1] + (shape.b[1] - shape.a[1]) * t,
          ];
        }
        break;
      }
      case "onPolygon": {
        const vertices = resolvePolygonVertices(object.host);
        if (vertices && vertices.length > 1) {
          const combined = overrides?.get(object.id) ?? object.edge + object.t;
          const wrapped = ((combined % vertices.length) + vertices.length) % vertices.length;
          const edge = Math.floor(wrapped);
          const t = wrapped - edge;
          const a = vertices[edge];
          const b = vertices[(edge + 1) % vertices.length];
          position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }
        break;
      }
      case "onFunction": {
        const host = document.objects[object.host];
        const x = overrides?.get(object.id) ?? object.x;
        if (host?.kind === "functionPlot") {
          if (!plotRangeContains(host, x)) break;
          const y = evaluateLatex(host.latex, { ...currentScope(), x });
          if (y === null) break;
          if (host.axis) {
            const frame = resolveAxisFrame(host.axis);
            if (frame) {
              position = [
                frame.origin[0] + x * frame.ux[0] + y * frame.uy[0],
                frame.origin[1] + x * frame.ux[1] + y * frame.uy[1],
              ];
            }
          } else {
            position = [x, y];
          }
        } else if (host?.kind === "threePointParabola") {
          const coefficients = resolveThreePointCoefficients(host);
          if (coefficients) {
            position = [x, coefficients.a * x * x + coefficients.b * x + coefficients.c];
          }
        }
        break;
      }
      case "onConic": {
        const host = document.objects[object.host];
        if (host?.kind === "conic") {
          const params = conicParamsAt(host, resolvePoint, resolveShape);
          if (params) {
            const u = overrides?.get(object.id) ?? object.u;
            position = conicPointPosition(params, u, object.branch);
          }
        }
        break;
      }
      case "onParametric": {
        const host = document.objects[object.host];
        if (host?.kind === "parametricCurve") {
          const t = overrides?.get(object.id) ?? object.t;
          const pointAt = parametricPointEvaluator(
            host,
            host.axis ? resolveAxisFrame(host.axis) : null,
            currentScope(),
          );
          position = pointAt(t);
        }
        break;
      }
      case "onLocus": {
        const host = document.objects[object.host];
        if (host?.kind === "locus" && onLocusResolutionDepth === 0) {
          const u = overrides?.get(object.id) ?? object.u;
          onLocusResolutionDepth++;
          try {
            position =
              resolvePositions(document, new Map([[host.driver, u]])).get(host.target) ?? null;
          } finally {
            onLocusResolutionDepth--;
          }
        }
        break;
      }
      case "onCircle": {
        const shape = resolveShape(object.circle);
        if (shape?.type === "circle") {
          const angle = overrides?.get(object.id) ?? object.angle;
          position = [
            shape.center[0] + shape.radius * Math.cos(angle),
            shape.center[1] + shape.radius * Math.sin(angle),
          ];
        }
        break;
      }
      case "circleCenter": {
        const shape = resolveShape(object.circle);
        if (shape?.type === "circle") position = shape.center;
        break;
      }
      case "triangleCenter": {
        const vertices = resolvePolygonVertices(object.triangle);
        if (vertices) {
          position = triangleCenterPosition(vertices, object.center, object.vertex);
        }
        break;
      }
      case "midpoint": {
        const endpoints = resolveSegmentEndpoints(object.segment);
        if (endpoints) {
          const [a, b] = endpoints;
          position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        }
        break;
      }
      case "intersection": {
        const aObject = document.objects[object.a];
        const bObject = document.objects[object.b];
        if (aObject?.kind === "axisSystem" || bObject?.kind === "axisSystem") {
          const axes = aObject?.kind === "axisSystem" ? aObject : bObject;
          const other = axes === aObject ? bObject : aObject;
          if (
            axes?.kind === "axisSystem" &&
            (other?.kind === "functionPlot" || other?.kind === "parametricCurve")
          ) {
            position = curveAxisIntersection(
              other,
              axes,
              resolveAxisFrame,
              currentScope(),
              object.near,
            );
          }
          break;
        }
        if (aObject?.kind === "parametricCurve" || bObject?.kind === "parametricCurve") {
          if (aObject?.kind === "parametricCurve" && bObject?.kind === "parametricCurve") {
            position = parametricPairIntersection(
              aObject,
              bObject,
              resolveAxisFrame,
              currentScope(),
              object.near,
            );
          } else if (aObject?.kind === "parametricCurve" && bObject?.kind === "functionPlot") {
            position = parametricGraphIntersection(
              aObject,
              bObject,
              resolveAxisFrame,
              currentScope(),
              object.near,
            );
          } else if (aObject?.kind === "functionPlot" && bObject?.kind === "parametricCurve") {
            position = parametricGraphIntersection(
              bObject,
              aObject,
              resolveAxisFrame,
              currentScope(),
              object.near,
            );
          }
          break;
        }
        const plotId =
          aObject?.kind === "functionPlot"
            ? object.a
            : bObject?.kind === "functionPlot"
              ? object.b
              : null;
        if (plotId !== null) {
          const otherId = plotId === object.a ? object.b : object.a;
          const otherObject = document.objects[otherId];
          if (otherObject?.kind === "functionPlot") {
            const plot = document.objects[plotId];
            if (plot?.kind === "functionPlot" && plot.axis && plot.axis === otherObject.axis) {
              const frame = resolveAxisFrame(plot.axis);
              if (frame) {
                const hit = graphIntersectionInFrame(
                  frame,
                  plot.latex,
                  otherObject.latex,
                  currentScope(),
                  object.near,
                );
                if (hit) {
                  const ax = coordinatesInFrame(frame, hit)[0];
                  if (plotRangeContains(plot, ax) && plotRangeContains(otherObject, ax)) {
                    position = hit;
                  }
                }
              }
            } else {
              const root = findGraphRootNear((x) => {
                const av = graphValueAt(plotId, x);
                const bv = graphValueAt(otherId, x);
                return av === null || bv === null ? null : av - bv;
              }, object.near[0]);
              const y = root === null ? null : graphValueAt(plotId, root);
              if (root !== null && y !== null) position = [root, y];
            }
          } else {
            const shape = resolveShape(otherId);
            if (shape && shape.type !== "circle") {
              position = intersectGraphWithLinear(graphValueAt, plotId, shape, object.near);
            }
          }
          break;
        }
        const first = resolveShape(object.a);
        const second = resolveShape(object.b);
        if (first && second) {
          position = nearestSolution(intersectShapes(first, second), object.near);
        }
        break;
      }
      case "transformed": {
        const source = resolvePoint(object.source);
        position = source ? transformPointAt(object.transform, source) : null;
        break;
      }
      case "conicFeature": {
        const conic = document.objects[object.conic];
        if (conic?.kind === "conic") {
          const params = conicParamsAt(conic, resolvePoint, resolveShape);
          position = params ? conicFeaturePointFromParams(params, object.feature) : null;
        }
        break;
      }
    }
    resolving.delete(id);
    if (position) cache.set(id, position);
    return position;
  };

  const transformPointAt = (spec: TransformSpec, p: XY): XY | null =>
    applyTransformToPoint(spec, p, resolvePoint, resolveShape);

  const transformResolvedShape = (
    shape: ResolvedShape,
    spec: TransformSpec,
  ): ResolvedShape | null => applyTransformToShape(shape, spec, resolvePoint, resolveShape);

  const resolvingShapes = new Set<ObjectId>();

  const resolvePolygonVertices = (id: ObjectId): XY[] | null => {
    const object = document.objects[id];
    if (!object) return null;
    if (object.kind === "polygon") {
      const vertices: XY[] = [];
      for (const pointId of object.points) {
        const vertex = resolvePoint(pointId);
        if (!vertex) return null;
        vertices.push(vertex);
      }
      return vertices;
    }
    if (object.kind === "transform") {
      if (resolvingShapes.has(id)) return null;
      resolvingShapes.add(id);
      const base = resolvePolygonVertices(object.source);
      resolvingShapes.delete(id);
      if (!base) return null;
      const vertices: XY[] = [];
      for (const vertex of base) {
        const transformed = transformPointAt(object.transform, vertex);
        if (!transformed) return null;
        vertices.push(transformed);
      }
      return vertices;
    }
    return null;
  };

  const resolveAxisFrame = (id: ObjectId): AxisFrame | null => {
    const object = document.objects[id];
    if (!object || (object.kind !== "axisSystem" && object.kind !== "numberAxis")) return null;
    const origin = resolvePoint(object.origin);
    const unit = resolvePoint(object.unit);
    if (!origin || !unit) return null;
    const ux: XY = [unit[0] - origin[0], unit[1] - origin[1]];
    if (Math.hypot(ux[0], ux[1]) < 1e-12) return null;
    return { origin, ux, uy: perpendicular(ux) };
  };

  const graphValueAt = (plotId: ObjectId, x: number): number | null => {
    const plot = document.objects[plotId];
    if (plot?.kind !== "functionPlot") return null;
    const frame = plot.axis ? resolveAxisFrame(plot.axis) : null;
    if (plot.axis && !frame) return null;
    return graphValueInFrame(plot, frame, currentScope(), x);
  };

  const resolveThreePointCoefficients = (
    host: GeoDocument["objects"][string] & { kind: "threePointParabola" },
  ): { a: number; b: number; c: number } | null => {
    const p1 = resolvePoint(host.p1);
    const p2 = resolvePoint(host.p2);
    const p3 = resolvePoint(host.p3);
    if (!p1 || !p2 || !p3) return null;
    return parabolaThroughPoints(p1, p2, p3);
  };

  const resolveShape = (id: ObjectId): ResolvedShape | null => {
    const object = document.objects[id];
    if (!object) return null;
    if (object.kind === "circle") return circleShape(object, resolvePoint);
    if (object.kind === "circumcircle") return circumcircleShape(object, resolvePoint);
    if (object.kind === "segment" || object.kind === "line" || object.kind === "ray") {
      return linearShape(object, resolvePoint);
    }
    if (object.kind === "tangentLine") {
      const point = resolvePoint(object.point);
      if (!point) return null;
      const target = document.objects[object.target];
      if (target?.kind === "circle" || target?.kind === "circumcircle") {
        const shape = resolveShape(object.target);
        if (shape?.type !== "circle") return null;
        const touch = circleTangentLines(shape.center, shape.radius, point)[object.index];
        return touch ? { type: "line", a: touch.a, b: touch.b } : null;
      }
      if (target?.kind === "conic") {
        const params = conicParamsAt(target, resolvePoint, resolveShape);
        const tangent = params ? conicTangentFromParams(params, point) : null;
        return tangent ? { type: "line", a: tangent.a, b: tangent.b } : null;
      }
      return null;
    }
    if (object.kind === "conicLine") {
      const conic = document.objects[object.conic];
      if (conic?.kind !== "conic") return null;
      const params = conicParamsAt(conic, resolvePoint, resolveShape);
      const line = params ? conicFeatureLineFromParams(params, object.feature) : null;
      return line ? { type: "line", a: line.a, b: line.b } : null;
    }
    if (
      object.kind !== "perpendicularLine" &&
      object.kind !== "parallelLine" &&
      object.kind !== "angleBisector" &&
      object.kind !== "transform"
    ) {
      return null;
    }
    if (resolvingShapes.has(id)) return null;
    resolvingShapes.add(id);
    const shape =
      object.kind === "transform"
        ? (() => {
            const source = resolveShape(object.source);
            return source ? transformResolvedShape(source, object.transform) : null;
          })()
        : derivedLineShape(object, resolveShape, resolvePoint);
    resolvingShapes.delete(id);
    return shape;
  };

  const resolveSegmentEndpoints = (id: ObjectId): [XY, XY] | null => {
    const shape = resolveShape(id);
    return shape?.type === "segment" ? [shape.a, shape.b] : null;
  };

  for (const object of Object.values(document.objects)) {
    if (object.kind === "point") resolvePoint(object.id);
  }
  return cache;
}

const nearestSolution = (solutions: XY[], near: XY): XY | null => {
  let best: XY | null = null;
  let bestDistance = Infinity;
  for (const solution of solutions) {
    const d = distance(solution, near);
    if (d < bestDistance) {
      best = solution;
      bestDistance = d;
    }
  }
  return best;
};

export const intersectGraphWithLinear = (
  graphValueAt: (plotId: ObjectId, x: number) => number | null,
  plotId: ObjectId,
  shape: Exclude<ResolvedShape, { type: "circle" }>,
  near: XY,
): XY | null => {
  const { a, b } = shape;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.hypot(dx, dy) < 1e-12) return null;
  const withinBounds = (x: number, y: number): boolean => {
    if (shape.type === "line") return true;
    const t = Math.abs(dx) >= Math.abs(dy) ? (x - a[0]) / dx : (y - a[1]) / dy;
    return shape.type === "segment" ? t >= 0 && t <= 1 : t >= 0;
  };
  if (Math.abs(dx) < 1e-12) {
    const y = graphValueAt(plotId, a[0]);
    return y !== null && withinBounds(a[0], y) ? [a[0], y] : null;
  }
  const slope = dy / dx;
  const root = findGraphRootNear((x) => {
    const y = graphValueAt(plotId, x);
    return y === null ? null : y - (a[1] + (x - a[0]) * slope);
  }, near[0]);
  if (root === null) return null;
  const y = graphValueAt(plotId, root);
  return y !== null && withinBounds(root, y) ? [root, y] : null;
};

export function pointPosition(document: GeoDocument, id: ObjectId): XY | null {
  return resolvePositions(document).get(id) ?? null;
}

export function resolveShapePositions(document: GeoDocument, id: ObjectId): ResolvedShape | null {
  const positions = resolvePositions(document);
  const at = (pointId: ObjectId) => positions.get(pointId);
  const seen = new Set<ObjectId>();

  const transformResolved = (shape: ResolvedShape, spec: TransformSpec): ResolvedShape | null =>
    applyTransformToShape(shape, spec, at, resolve);

  const resolve = (objectId: ObjectId): ResolvedShape | null => {
    const object = document.objects[objectId];
    if (!object) return null;
    if (object.kind === "circle") return circleShape(object, at);
    if (object.kind === "circumcircle") return circumcircleShape(object, at);
    if (object.kind === "segment" || object.kind === "line" || object.kind === "ray") {
      return linearShape(object, at);
    }
    if (object.kind === "tangentLine") {
      const point = at(object.point);
      if (!point) return null;
      const target = document.objects[object.target];
      if (target?.kind === "circle" || target?.kind === "circumcircle") {
        const shape = resolve(object.target);
        if (shape?.type !== "circle") return null;
        const touch = circleTangentLines(shape.center, shape.radius, point)[object.index];
        return touch ? { type: "line", a: touch.a, b: touch.b } : null;
      }
      if (target?.kind === "conic") {
        const params = conicParamsAt(target, at, resolve);
        const tangent = params ? conicTangentFromParams(params, point) : null;
        return tangent ? { type: "line", a: tangent.a, b: tangent.b } : null;
      }
      return null;
    }
    if (object.kind === "conicLine") {
      const conic = document.objects[object.conic];
      if (conic?.kind !== "conic") return null;
      const params = conicParamsAt(conic, at, resolve);
      const line = params ? conicFeatureLineFromParams(params, object.feature) : null;
      return line ? { type: "line", a: line.a, b: line.b } : null;
    }
    if (
      object.kind !== "perpendicularLine" &&
      object.kind !== "parallelLine" &&
      object.kind !== "angleBisector" &&
      object.kind !== "transform"
    ) {
      return null;
    }
    if (seen.has(objectId)) return null;
    seen.add(objectId);
    let result: ResolvedShape | null;
    if (object.kind === "transform") {
      const source = resolve(object.source);
      result = source ? transformResolved(source, object.transform) : null;
    } else {
      result = derivedLineShape(object, resolve, at);
    }
    seen.delete(objectId);
    return result;
  };
  return resolve(id);
}

export function resolveTransformedPolygon(document: GeoDocument, id: ObjectId): XY[] | null {
  const object = document.objects[id];
  if (object?.kind !== "transform") return null;
  const source = document.objects[object.source];
  let base: XY[] | null = null;
  if (source?.kind === "polygon") {
    const positions = resolvePositions(document);
    base = [];
    for (const pointId of source.points) {
      const position = positions.get(pointId);
      if (!position) return null;
      base.push(position);
    }
  } else if (source?.kind === "transform") {
    base = resolveTransformedPolygon(document, source.id);
  }
  if (!base) return null;
  const vertices: XY[] = [];
  for (const vertex of base) {
    const transformed = applyTransform(document, object.transform, vertex);
    if (!transformed) return null;
    vertices.push(transformed);
  }
  return vertices;
}

function applyTransform(document: GeoDocument, spec: TransformSpec, p: XY): XY | null {
  return applyTransformToPoint(
    spec,
    p,
    (id) => pointPosition(document, id),
    (id) => resolveShapePositions(document, id),
  );
}

export interface AxisFrame {
  origin: XY;
  ux: XY;
  uy: XY;
}

export function axisFrame(document: GeoDocument, id: ObjectId): AxisFrame | null {
  const object = document.objects[id];
  if (!object || (object.kind !== "axisSystem" && object.kind !== "numberAxis")) return null;
  const origin = pointPosition(document, object.origin);
  const unit = pointPosition(document, object.unit);
  if (!origin || !unit) return null;
  const ux: XY = [unit[0] - origin[0], unit[1] - origin[1]];
  if (Math.hypot(ux[0], ux[1]) < 1e-12) return null;
  return { origin, ux, uy: perpendicular(ux) };
}

// An explicit coordinateAxes pick wins; otherwise a function-plot host's
// binding; board coordinates (null) when neither applies.
export function coordinateFrameFor(document: GeoDocument, point: PointObject): AxisFrame | null {
  if (point.coordinateAxes === null) return null;
  if (typeof point.coordinateAxes === "string") return axisFrame(document, point.coordinateAxes);
  const host = "host" in point ? document.objects[point.host] : undefined;
  if ((host?.kind === "functionPlot" || host?.kind === "parametricCurve") && host.axis) {
    return axisFrame(document, host.axis);
  }
  return null;
}

export function coordinatesInFrame(frame: AxisFrame | null, position: XY): XY {
  if (!frame) return position;
  const usq = frame.ux[0] ** 2 + frame.ux[1] ** 2;
  const dx = position[0] - frame.origin[0];
  const dy = position[1] - frame.origin[1];
  return [(dx * frame.ux[0] + dy * frame.ux[1]) / usq, (dx * frame.uy[0] + dy * frame.uy[1]) / usq];
}

export function plotRangeContains(plot: FunctionPlot, x: number): boolean {
  return (plot.xMin === undefined || x >= plot.xMin) && (plot.xMax === undefined || x <= plot.xMax);
}

// Evaluates a function plot in board coordinates, mapping through its bound
// axes frame when set. Like parametricPointEvaluator, the frame and scope are
// supplied by the caller so live resolution and outside lookups share one path;
// a null frame means board coordinates (callers reject unresolved bindings).
export function graphValueInFrame(
  plot: FunctionPlot,
  frame: AxisFrame | null,
  scope: Record<string, number>,
  x: number,
): number | null {
  if (frame) {
    if (Math.abs(frame.ux[1]) > 1e-9 || Math.abs(frame.ux[0]) < 1e-12) return null;
    const ax = (x - frame.origin[0]) / frame.ux[0];
    if (!plotRangeContains(plot, ax)) return null;
    const y = evaluateLatex(plot.latex, { ...scope, x: ax });
    return y === null ? null : frame.origin[1] + y * frame.uy[1];
  }
  if (!plotRangeContains(plot, x)) return null;
  return evaluateLatex(plot.latex, { ...scope, x });
}

export function graphIntersectionInFrame(
  frame: AxisFrame,
  latexA: string,
  latexB: string,
  scope: Record<string, number>,
  near: XY,
): XY | null {
  const usq = frame.ux[0] ** 2 + frame.ux[1] ** 2;
  const hint =
    ((near[0] - frame.origin[0]) * frame.ux[0] + (near[1] - frame.origin[1]) * frame.ux[1]) / usq;
  const evaluate = (latex: string, ax: number) => evaluateLatex(latex, { ...scope, x: ax });
  const root = findGraphRootNear((ax) => {
    const a = evaluate(latexA, ax);
    const b = evaluate(latexB, ax);
    return a === null || b === null ? null : a - b;
  }, hint);
  if (root === null) return null;
  const ay = evaluate(latexA, root);
  if (ay === null) return null;
  return [
    frame.origin[0] + root * frame.ux[0] + ay * frame.uy[0],
    frame.origin[1] + root * frame.ux[1] + ay * frame.uy[1],
  ];
}

// Evaluates a parametric curve in board coordinates, mapping through its bound
// axes frame when set. The frame is supplied by the caller so the same code
// serves live resolution (resolvePositions closures) and outside lookups.
export function parametricPointEvaluator(
  host: ParametricCurve,
  frame: AxisFrame | null,
  scope: Record<string, number>,
): (t: number) => XY | null {
  return (t) => {
    const x = evaluateLatex(host.xLatex, { ...scope, t });
    const y = evaluateLatex(host.yLatex, { ...scope, t });
    if (x === null || y === null) return null;
    return frame
      ? [
          frame.origin[0] + x * frame.ux[0] + y * frame.uy[0],
          frame.origin[1] + x * frame.ux[1] + y * frame.uy[1],
        ]
      : [x, y];
  };
}

type FrameResolver = (id: ObjectId) => AxisFrame | null;

const nearestOf = (candidates: (XY | null)[], near: XY): XY | null => {
  let best: XY | null = null;
  for (const candidate of candidates) {
    if (candidate && (!best || distance(candidate, near) < distance(best, near))) {
      best = candidate;
    }
  }
  return best;
};

function parametricPairIntersection(
  a: ParametricCurve,
  b: ParametricCurve,
  frameFor: FrameResolver,
  scope: Record<string, number>,
  near: XY,
): XY | null {
  const pa = parametricPointEvaluator(a, a.axis ? frameFor(a.axis) : null, scope);
  const pb = parametricPointEvaluator(b, b.axis ? frameFor(b.axis) : null, scope);
  return intersectPointFunctions(pa, [a.tMin, a.tMax], pb, [b.tMin, b.tMax], near);
}

function parametricGraphIntersection(
  curve: ParametricCurve,
  plot: FunctionPlot,
  frameFor: FrameResolver,
  scope: Record<string, number>,
  near: XY,
): XY | null {
  const p = parametricPointEvaluator(curve, curve.axis ? frameFor(curve.axis) : null, scope);
  const frame = plot.axis ? frameFor(plot.axis) : null;
  const f = (ax: number): number | null =>
    plotRangeContains(plot, ax) ? evaluateLatex(plot.latex, { ...scope, x: ax }) : null;
  const residual = (t: number): number | null => {
    const point = p(t);
    if (!point) return null;
    const [ax, ay] = frame ? coordinatesInFrame(frame, point) : point;
    const fy = f(ax);
    return fy === null ? null : ay - fy;
  };
  const roots = findRootsInDomain(residual, curve.tMin, curve.tMax);
  return nearestOf(
    roots.map((t) => p(t)),
    near,
  );
}

// Both partners share one code path: the axis line is mapped into the plot's
// own frame (board coordinates when unbound), where the plot is a plain graph.
function plotAxisIntersection(
  plot: FunctionPlot,
  axes: AxisSystem,
  frameFor: FrameResolver,
  scope: Record<string, number>,
  near: XY,
): XY | null {
  const axesFrame = frameFor(axes.id);
  if (!axesFrame) return null;
  const frame = plot.axis ? frameFor(plot.axis) : null;
  const toPlotFrame = (point: XY): XY => (frame ? coordinatesInFrame(frame, point) : point);
  const fromPlotFrame = (ax: number, ay: number): XY =>
    frame
      ? [
          frame.origin[0] + ax * frame.ux[0] + ay * frame.uy[0],
          frame.origin[1] + ax * frame.ux[1] + ay * frame.uy[1],
        ]
      : [ax, ay];
  const f = (ax: number): number | null =>
    plotRangeContains(plot, ax) ? evaluateLatex(plot.latex, { ...scope, x: ax }) : null;
  const hint = toPlotFrame(near)[0];
  const candidates: (XY | null)[] = [];
  for (const direction of [axesFrame.ux, axesFrame.uy]) {
    const a = toPlotFrame(axesFrame.origin);
    const b = toPlotFrame([axesFrame.origin[0] + direction[0], axesFrame.origin[1] + direction[1]]);
    const dx = b[0] - a[0];
    if (Math.abs(dx) < 1e-9) {
      const fy = f(a[0]);
      candidates.push(fy === null ? null : fromPlotFrame(a[0], fy));
      continue;
    }
    const slope = (b[1] - a[1]) / dx;
    const root = findGraphRootNear((ax) => {
      const fy = f(ax);
      return fy === null ? null : fy - (a[1] + (ax - a[0]) * slope);
    }, hint);
    const fy = root === null ? null : f(root);
    candidates.push(root === null || fy === null ? null : fromPlotFrame(root, fy));
  }
  return nearestOf(candidates, near);
}

function parametricAxisIntersection(
  curve: ParametricCurve,
  axes: AxisSystem,
  frameFor: FrameResolver,
  scope: Record<string, number>,
  near: XY,
): XY | null {
  const axesFrame = frameFor(axes.id);
  if (!axesFrame) return null;
  const p = parametricPointEvaluator(curve, curve.axis ? frameFor(curve.axis) : null, scope);
  const candidates: (XY | null)[] = [];
  for (const direction of [axesFrame.ux, axesFrame.uy]) {
    const length = Math.hypot(direction[0], direction[1]);
    if (length < 1e-12) continue;
    const normal: XY = [-direction[1] / length, direction[0] / length];
    const residual = (t: number): number | null => {
      const point = p(t);
      return point
        ? (point[0] - axesFrame.origin[0]) * normal[0] +
            (point[1] - axesFrame.origin[1]) * normal[1]
        : null;
    };
    for (const t of findRootsInDomain(residual, curve.tMin, curve.tMax)) {
      candidates.push(p(t));
    }
  }
  return nearestOf(candidates, near);
}

function curveAxisIntersection(
  curve: FunctionPlot | ParametricCurve,
  axes: AxisSystem,
  frameFor: FrameResolver,
  scope: Record<string, number>,
  near: XY,
): XY | null {
  return curve.kind === "functionPlot"
    ? plotAxisIntersection(curve, axes, frameFor, scope, near)
    : parametricAxisIntersection(curve, axes, frameFor, scope, near);
}

export function parametricIntersectionNear(
  document: GeoDocument,
  aId: ObjectId,
  bId: ObjectId,
  near: XY,
): XY | null {
  const a = document.objects[aId];
  const b = document.objects[bId];
  const frameFor: FrameResolver = (id) => axisFrame(document, id);
  const scope = variableScope(document);
  if (a?.kind === "parametricCurve" && b?.kind === "parametricCurve") {
    return parametricPairIntersection(a, b, frameFor, scope, near);
  }
  if (a?.kind === "parametricCurve" && b?.kind === "functionPlot") {
    return parametricGraphIntersection(a, b, frameFor, scope, near);
  }
  if (a?.kind === "functionPlot" && b?.kind === "parametricCurve") {
    return parametricGraphIntersection(b, a, frameFor, scope, near);
  }
  return null;
}

export function curveAxisIntersectionNear(
  document: GeoDocument,
  curveId: ObjectId,
  axesId: ObjectId,
  near: XY,
): XY | null {
  const curve = document.objects[curveId];
  const axes = document.objects[axesId];
  if (
    (curve?.kind !== "functionPlot" && curve?.kind !== "parametricCurve") ||
    axes?.kind !== "axisSystem"
  ) {
    return null;
  }
  return curveAxisIntersection(
    curve,
    axes,
    (id) => axisFrame(document, id),
    variableScope(document),
    near,
  );
}

export function remapObjectReferences(
  object: GeoObject,
  map: ReadonlyMap<ObjectId, ObjectId>,
): GeoObject {
  const remap = (id: ObjectId): ObjectId => map.get(id) ?? id;
  const remapSpec = (spec: TransformSpec): TransformSpec => {
    switch (spec.type) {
      case "translate":
        return { ...spec, from: remap(spec.from), to: remap(spec.to) };
      case "rotate":
      case "scale":
        return { ...spec, center: remap(spec.center) };
      case "reflect":
        return { ...spec, mirror: remap(spec.mirror) };
    }
  };
  const id = remap(object.id);
  switch (object.kind) {
    case "point": {
      // coordinateAxes is presentational and absent from dependenciesOf, so a
      // template's axes id is only kept when the map actually covers it.
      const patched = { ...object };
      if (typeof object.coordinateAxes === "string") {
        const axes = map.get(object.coordinateAxes);
        if (axes) patched.coordinateAxes = axes;
        else delete patched.coordinateAxes;
      }
      switch (patched.role) {
        case "free":
          return { ...patched, id };
        case "onLinear":
        case "onPolygon":
        case "onFunction":
        case "onConic":
        case "onParametric":
        case "onLocus":
          return { ...patched, id, host: remap(patched.host) };
        case "midpoint":
          return { ...patched, id, segment: remap(patched.segment) };
        case "onCircle":
          return { ...patched, id, circle: remap(patched.circle) };
        case "circleCenter":
          return { ...patched, id, circle: remap(patched.circle) };
        case "triangleCenter":
          return { ...patched, id, triangle: remap(patched.triangle) };
        case "intersection":
          return { ...patched, id, a: remap(patched.a), b: remap(patched.b) };
        case "transformed":
          return {
            ...patched,
            id,
            source: remap(patched.source),
            transform: remapSpec(patched.transform),
          };
        case "conicFeature":
          return { ...patched, id, conic: remap(patched.conic) };
      }
      break;
    }
    case "segment":
    case "line":
    case "ray":
      return { ...object, id, p1: remap(object.p1), p2: remap(object.p2) };
    case "circle":
      return { ...object, id, center: remap(object.center), through: remap(object.through) };
    case "circumcircle":
      return {
        ...object,
        id,
        p1: remap(object.p1),
        p2: remap(object.p2),
        p3: remap(object.p3),
      };
    case "polygon":
      return { ...object, id, points: object.points.map(remap) };
    case "perpendicularLine":
    case "parallelLine":
      return { ...object, id, through: remap(object.through), reference: remap(object.reference) };
    case "angleBisector":
      return {
        ...object,
        id,
        p1: remap(object.p1),
        vertex: remap(object.vertex),
        p2: remap(object.p2),
      };
    case "transform":
      return {
        ...object,
        id,
        source: remap(object.source),
        transform: remapSpec(object.transform),
      };
    case "measurement":
      return {
        ...object,
        id,
        target: object.target ? remap(object.target) : undefined,
        p1: object.p1 ? remap(object.p1) : undefined,
        p2: object.p2 ? remap(object.p2) : undefined,
        vertex: object.vertex ? remap(object.vertex) : undefined,
      };
    case "variable":
    case "calculation":
      return { ...object, id };
    case "locus":
      return { ...object, id, driver: remap(object.driver), target: remap(object.target) };
    case "animation":
      return {
        ...object,
        id,
        target: object.target ? remap(object.target) : undefined,
        children: object.children?.map(remap),
      };
    case "axisSystem":
    case "numberAxis":
      return { ...object, id, origin: remap(object.origin), unit: remap(object.unit) };
    case "functionPlot":
      return { ...object, id, axis: object.axis ? remap(object.axis) : undefined };
    case "parametricCurve":
      return { ...object, id, axis: object.axis ? remap(object.axis) : undefined };
    case "conic":
      return {
        ...object,
        id,
        focus1: object.focus1 ? remap(object.focus1) : undefined,
        focus2: object.focus2 ? remap(object.focus2) : undefined,
        pointOnCurve: object.pointOnCurve ? remap(object.pointOnCurve) : undefined,
        focus: object.focus ? remap(object.focus) : undefined,
        directrix: object.directrix ? remap(object.directrix) : undefined,
      };
    case "threePointParabola":
      return { ...object, id, p1: remap(object.p1), p2: remap(object.p2), p3: remap(object.p3) };
    case "tangentLine":
      return { ...object, id, point: remap(object.point), target: remap(object.target) };
    case "conicLine":
      return { ...object, id, conic: remap(object.conic) };
    case "iteration":
      return { ...object, id, seed: remap(object.seed), transform: remapSpec(object.transform) };
  }
}

export function iterationPoints(document: GeoDocument, id: ObjectId): XY[] | null {
  const object = document.objects[id];
  if (object?.kind !== "iteration") return null;
  const seedPosition = pointPosition(document, object.seed);
  if (!seedPosition) return null;
  const points: XY[] = [seedPosition];
  let current = seedPosition;
  const count = Math.min(500, Math.max(0, Math.floor(object.count)));
  for (let i = 0; i < count; i++) {
    const next = applyTransform(document, object.transform, current);
    if (!next) break;
    points.push(next);
    current = next;
  }
  return points;
}

// Driver sampling domain: circles run a full turn, polygons run the vertex
// cycle, segments and unresolved hosts keep [0, 1], and unbounded linear hosts
// span the caller-supplied view box projected onto the host's parameter.
function locusDriverRange(
  document: GeoDocument,
  driver: PointObject,
  view?: readonly [number, number, number, number],
): readonly [number, number] | null {
  if (driver.role === "onCircle") return [0, 2 * Math.PI];
  if (driver.role === "onPolygon") {
    const count = polygonVerticesOf(document, driver.host)?.length ?? 0;
    return count > 0 ? [0, count] : null;
  }
  if (driver.role !== "onLinear") return null;
  const shape = resolveShapePositions(document, driver.host);
  if (!shape || shape.type === "circle" || shape.type === "segment" || !view) return [0, 1];
  const dx = shape.b[0] - shape.a[0];
  const dy = shape.b[1] - shape.a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return [0, 1];
  const [left, top, right, bottom] = view;
  let lo = Infinity;
  let hi = -Infinity;
  for (const corner of [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ] as const) {
    const t = ((corner[0] - shape.a[0]) * dx + (corner[1] - shape.a[1]) * dy) / lengthSq;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  if (shape.type === "ray") return hi > 0 ? [0, hi] : [0, 1];
  return [lo, hi];
}

export function locusPoints(
  document: GeoDocument,
  driverId: ObjectId,
  targetId: ObjectId,
  samples = 120,
  view?: readonly [number, number, number, number],
): XY[] | null {
  const driver = document.objects[driverId];
  const target = document.objects[targetId];
  if (driver?.kind !== "point" || !target || target.kind !== "point") return null;
  const range = locusDriverRange(document, driver, view);
  if (!range) return null;
  const [lo, hi] = range;
  if (!(hi > lo)) return null;
  const points: XY[] = [];
  for (let i = 0; i <= samples; i++) {
    const parameter = lo + ((hi - lo) * i) / samples;
    const position = resolvePositions(document, new Map([[driverId, parameter]])).get(targetId);
    if (position) points.push(position);
  }
  return points.length >= 2 ? points : null;
}

export function invertLocus(
  document: GeoDocument,
  id: ObjectId,
  position: XY,
  samples = 120,
  view?: readonly [number, number, number, number],
): number | null {
  const host = document.objects[id];
  if (host?.kind !== "locus") return null;
  const driver = document.objects[host.driver];
  if (driver?.kind !== "point") return null;
  const range = locusDriverRange(document, driver, view);
  if (!range) return null;
  const [lo, hi] = range;
  if (!(hi > lo)) return null;
  const evaluate = (u: number): number => {
    const point = resolvePositions(document, new Map([[host.driver, u]])).get(host.target);
    return point ? distance(point, position) : Infinity;
  };
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i <= samples; i++) {
    const d = evaluate(lo + ((hi - lo) * i) / samples);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return null;
  const step = (hi - lo) / samples;
  const center = lo + ((hi - lo) * bestIndex) / samples;
  return minimizeScalar(evaluate, center - step, center + step);
}

export function polygonVerticesOf(document: GeoDocument, id: ObjectId): XY[] | null {
  const object = document.objects[id];
  if (object?.kind === "polygon") {
    const positions = resolvePositions(document);
    const vertices: XY[] = [];
    for (const pointId of object.points) {
      const position = positions.get(pointId);
      if (!position) return null;
      vertices.push(position);
    }
    return vertices;
  }
  if (object?.kind === "transform") return resolveTransformedPolygon(document, id);
  return null;
}

export function listObjects<K extends GeoObject["kind"]>(
  document: GeoDocument,
  kind: K,
): Extract<GeoObject, { kind: K }>[] {
  return Object.values(document.objects).filter(
    (object): object is Extract<GeoObject, { kind: K }> => object.kind === kind,
  );
}

export const serializeDocument = (document: GeoDocument): string => JSON.stringify(document);

export function parseDocument(raw: string): GeoDocument {
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.objects)) {
    throw new Error("Unsupported document format");
  }
  const objects: Record<ObjectId, GeoObject> = {};
  for (const [id, value] of Object.entries(data.objects)) {
    if (!isGeoObject(value) || value.id !== id) throw new Error("Invalid object in document");
    objects[id] = value;
  }
  for (const object of Object.values(objects)) {
    for (const dependency of dependenciesOf(object)) {
      if (!objects[dependency]) throw new Error("Dangling reference in document");
    }
  }
  const marks: DocumentMarks = {};
  if (data.marks !== undefined) {
    if (!isRecord(data.marks)) throw new Error("Invalid marks in document");
    if (data.marks.center !== undefined) {
      if (typeof data.marks.center !== "string" || !objects[data.marks.center]) {
        throw new Error("Invalid marks in document");
      }
      marks.center = data.marks.center;
    }
    if (data.marks.mirror !== undefined) {
      if (typeof data.marks.mirror !== "string" || !objects[data.marks.mirror]) {
        throw new Error("Invalid marks in document");
      }
      marks.mirror = data.marks.mirror;
    }
  }
  return { version: 1, objects, marks };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isXY = (value: unknown): value is XY =>
  Array.isArray(value) && value.length === 2 && isNumber(value[0]) && isNumber(value[1]);

const STYLE_FIELD_TYPES: Record<string, "string" | "number"> = {
  strokeColor: "string",
  strokeWidth: "number",
  dash: "number",
  fillColor: "string",
  fillOpacity: "number",
  pointSize: "number",
};

function hasValidPresentation(value: Record<string, unknown>): boolean {
  if (value.name !== undefined && typeof value.name !== "string") return false;
  if (value.hidden !== undefined && typeof value.hidden !== "boolean") return false;
  if (value.traced !== undefined && typeof value.traced !== "boolean") return false;
  if (value.style !== undefined) {
    if (!isRecord(value.style)) return false;
    for (const [key, type] of Object.entries(STYLE_FIELD_TYPES)) {
      const field = value.style[key];
      if (field !== undefined && typeof field !== type) return false;
    }
  }
  return true;
}

export function isGeoObject(value: unknown): value is GeoObject {
  if (!isRecord(value) || typeof value.id !== "string" || !hasValidPresentation(value)) {
    return false;
  }
  switch (value.kind) {
    case "point":
      if (
        (value.showCoordinates !== undefined && typeof value.showCoordinates !== "boolean") ||
        (value.coordinateAxes !== undefined &&
          value.coordinateAxes !== null &&
          typeof value.coordinateAxes !== "string")
      ) {
        return false;
      }
      switch (value.role) {
        case "free":
          return (
            isNumber(value.x) &&
            isNumber(value.y) &&
            (value.locked === undefined || typeof value.locked === "boolean")
          );
        case "onLinear":
          return typeof value.host === "string" && isNumber(value.t);
        case "onFunction":
          return typeof value.host === "string" && isNumber(value.x);
        case "onParametric":
          return typeof value.host === "string" && isNumber(value.t);
        case "onLocus":
          return typeof value.host === "string" && isNumber(value.u);
        case "onPolygon":
          return typeof value.host === "string" && isNumber(value.edge) && isNumber(value.t);
        case "onConic":
          return (
            typeof value.host === "string" &&
            isNumber(value.u) &&
            (value.branch === 1 || value.branch === -1)
          );
        case "onCircle":
          return typeof value.circle === "string" && isNumber(value.angle);
        case "circleCenter":
          return typeof value.circle === "string";
        case "triangleCenter":
          return (
            typeof value.triangle === "string" &&
            (value.center === "incenter" ||
              value.center === "circumcenter" ||
              value.center === "centroid" ||
              value.center === "orthocenter" ||
              value.center === "excenter" ||
              value.center === "ninePointCenter") &&
            (value.vertex === undefined ||
              (isNumber(value.vertex) &&
                Number.isInteger(value.vertex) &&
                value.vertex >= 0 &&
                value.vertex <= 2))
          );
        case "midpoint":
          return typeof value.segment === "string";
        case "intersection":
          return typeof value.a === "string" && typeof value.b === "string" && isXY(value.near);
        case "transformed":
          return typeof value.source === "string" && isTransformSpec(value.transform);
        case "conicFeature":
          return (
            typeof value.conic === "string" &&
            (value.feature === "focus1" ||
              value.feature === "focus2" ||
              value.feature === "center" ||
              value.feature === "vertex1" ||
              value.feature === "vertex2")
          );
        default:
          return false;
      }
    case "segment":
    case "line":
    case "ray":
      return typeof value.p1 === "string" && typeof value.p2 === "string";
    case "circle":
      return typeof value.center === "string" && typeof value.through === "string";
    case "polygon":
      return (
        Array.isArray(value.points) &&
        value.points.length >= 3 &&
        value.points.every((id: unknown) => typeof id === "string")
      );
    case "perpendicularLine":
    case "parallelLine":
      return typeof value.through === "string" && typeof value.reference === "string";
    case "angleBisector":
      return (
        typeof value.p1 === "string" &&
        typeof value.vertex === "string" &&
        typeof value.p2 === "string" &&
        (value.external === undefined || typeof value.external === "boolean")
      );
    case "circumcircle":
      return (
        typeof value.p1 === "string" && typeof value.p2 === "string" && typeof value.p3 === "string"
      );
    case "measurement":
      if (!isXY(value.position)) return false;
      if (value.locked !== undefined && !isNumber(value.locked)) return false;
      switch (value.quantity) {
        case "length":
        case "area":
          return typeof value.target === "string";
        case "distance":
          return typeof value.p1 === "string" && typeof value.p2 === "string";
        case "angle":
          return (
            typeof value.p1 === "string" &&
            typeof value.vertex === "string" &&
            typeof value.p2 === "string"
          );
        default:
          return false;
      }
    case "variable":
      return (
        isNumber(value.value) &&
        isXY(value.position) &&
        (value.min === undefined || isNumber(value.min)) &&
        (value.max === undefined || isNumber(value.max)) &&
        (value.min === undefined || value.max === undefined || value.min < value.max)
      );
    case "calculation":
      return (
        typeof value.expression === "string" &&
        isXY(value.position) &&
        (value.locked === undefined || isNumber(value.locked))
      );
    case "transform":
      return typeof value.source === "string" && isTransformSpec(value.transform);
    case "locus":
      return typeof value.driver === "string" && typeof value.target === "string";
    case "axisSystem":
    case "numberAxis":
      return typeof value.origin === "string" && typeof value.unit === "string";
    case "functionPlot":
      return (
        typeof value.latex === "string" &&
        (value.axis === undefined || typeof value.axis === "string") &&
        (value.xMin === undefined || isNumber(value.xMin)) &&
        (value.xMax === undefined || isNumber(value.xMax))
      );
    case "parametricCurve":
      return (
        typeof value.xLatex === "string" &&
        typeof value.yLatex === "string" &&
        isNumber(value.tMin) &&
        isNumber(value.tMax) &&
        (value.axis === undefined || typeof value.axis === "string")
      );
    case "conic":
      if (
        value.conicType !== "ellipse" &&
        value.conicType !== "hyperbola" &&
        value.conicType !== "parabola" &&
        value.conicType !== "eccentric"
      ) {
        return false;
      }
      if (value.eccentricity !== undefined && !isNumber(value.eccentricity)) return false;
      return [value.focus1, value.focus2, value.pointOnCurve, value.focus, value.directrix].every(
        (ref) => ref === undefined || typeof ref === "string",
      );
    case "threePointParabola":
      return (
        typeof value.p1 === "string" && typeof value.p2 === "string" && typeof value.p3 === "string"
      );
    case "tangentLine":
      return (
        typeof value.point === "string" && typeof value.target === "string" && isNumber(value.index)
      );
    case "conicLine":
      return (
        typeof value.conic === "string" &&
        (value.feature === "directrix1" ||
          value.feature === "directrix2" ||
          value.feature === "asymptote1" ||
          value.feature === "asymptote2")
      );
    case "iteration":
      return (
        typeof value.seed === "string" && isTransformSpec(value.transform) && isNumber(value.count)
      );
    case "animation":
      if (!isXY(value.position)) return false;
      if (value.duration !== undefined && !isNumber(value.duration)) return false;
      if (
        value.mode !== undefined &&
        value.mode !== "once" &&
        value.mode !== "loop" &&
        value.mode !== "pingpong"
      ) {
        return false;
      }
      switch (value.variant) {
        case "driver":
        case "toggle":
        case "variable":
          return typeof value.target === "string";
        case "group":
          return (
            Array.isArray(value.children) &&
            value.children.every((id: unknown) => typeof id === "string")
          );
        default:
          return false;
      }
    default:
      return false;
  }
}

function isTransformSpec(value: unknown): value is TransformSpec {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "translate":
      return typeof value.from === "string" && typeof value.to === "string";
    case "rotate":
      return typeof value.center === "string" && isNumber(value.angleDeg);
    case "scale":
      return typeof value.center === "string" && isNumber(value.factor);
    case "reflect":
      return typeof value.mirror === "string";
    default:
      return false;
  }
}
