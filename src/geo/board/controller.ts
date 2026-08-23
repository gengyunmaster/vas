import JXG from "jsxgraph";
import "./jsxgraph.css";
import { debugLog } from "../debug";
import type {
  Circumcircle,
  GeoDocument,
  GeoObject,
  ObjectId,
  PointObject,
  Polygon,
  Presentable,
  ResolvedShape,
  Variable,
  XY,
} from "../model";
import {
  axisFrame,
  circumcenterOf,
  computeValue,
  conicPointPosition,
  coordinateFrameFor,
  coordinatesInFrame,
  dependenciesOf,
  distance,
  distancePointToLine,
  distancePointToSegment,
  distanceToFragments,
  distanceToShape,
  formatValue,
  invertConicParam,
  invertLocus,
  invertParametric,
  iterationPoints,
  listObjects,
  locusPoints,
  pointInPolygon,
  polygonVerticesOf,
  resolveConic,
  resolvePositions,
  resolveShapePositions,
  resolveTransformedPolygon,
  sampleConic,
  sampleFunction,
  sampleParametric,
  sampleThreePointParabola,
  valueIndexOf,
} from "../model";
import { resolveSnap, snapDisplacement, snapToAngledLine } from "../snapping";
import { SNAP_TOLERANCE_PX } from "../tools/constants";
import { ensureKatex } from "./katex";
import { boardPalette } from "./palette";

export interface BoardCallbacks {
  getDocument: () => GeoDocument;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPointDragged: (id: ObjectId, x: number, y: number) => void;
  onPointSlid: (id: ObjectId, value: number, branch?: number) => void;
  onTextMoved: (id: ObjectId, position: XY) => void;
  onVariableSlid: (id: ObjectId, value: number) => void;
}

export type PreviewKind = "segment" | "line" | "ray" | "circle";

const POINT_ATTRIBUTES = {
  name: "",
  size: 3,
  face: "o",
  strokeColor: "#1f6feb",
  fillColor: "#1f6feb",
  highlight: true,
  withLabel: false,
  fixed: false,
} as const;

const shapeAttributes = () => ({
  strokeColor: boardPalette.shapeStroke,
  strokeWidth: 2,
  highlight: true,
  withLabel: false,
  fixed: false,
});

const RAY_ATTRIBUTES = {
  straightFirst: false,
  straightLast: true,
} as const;

const POLYGON_FILL = { fillColor: "#1f6feb", fillOpacity: 0.12 } as const;

const polygonAttributes = () => ({
  ...POLYGON_FILL,
  hasInnerPoints: true,
  withLabel: false,
  borders: {
    strokeColor: boardPalette.shapeStroke,
    strokeWidth: 2,
    highlight: true,
    fixed: true,
  },
});

const previewShapeAttributes = () => ({
  strokeColor: boardPalette.previewStroke,
  strokeWidth: 1.5,
  dash: 2,
  highlight: false,
  withLabel: false,
  fixed: true,
});

const HIDDEN_POINT_ATTRIBUTES = {
  name: "",
  size: 0,
  visible: false,
  fixed: true,
  withLabel: false,
} as const;

const SELECTED_COLOR = "#d97706";

interface PreviewState {
  kind: PreviewKind;
  a: JXG.Point;
  b: JXG.Point;
  shape: JXG.GeometryElement;
}

interface PolygonPreviewState {
  segments: { a: JXG.Point; b: JXG.Point; shape: JXG.Line }[];
}

interface DerivedLineState {
  a: JXG.Point;
  b: JXG.Point;
  shape: JXG.GeometryElement;
}

const DERIVED_LINE_KINDS = new Set([
  "perpendicularLine",
  "parallelLine",
  "angleBisector",
  "tangentLine",
  "conicLine",
]);

const TEXT_KINDS = new Set(["measurement", "variable", "calculation"]);

const AXIS_KINDS = new Set(["axisSystem", "numberAxis"]);

const axisLineAttributes = () => ({
  strokeColor: boardPalette.axisStroke,
  strokeWidth: 1,
  highlight: false,
  withLabel: false,
  fixed: true,
});

const iterationPointAttributes = () => ({
  name: "",
  size: 1,
  face: "o" as const,
  strokeColor: boardPalette.iterationPoint,
  fillColor: boardPalette.iterationPoint,
  highlight: false,
  withLabel: false,
  fixed: true,
});

const textAttributes = () => ({
  fontSize: 14,
  strokeColor: boardPalette.textStroke,
  highlight: false,
  fixed: false,
  withLabel: false,
});

const SLIDER_LENGTH = 3.2;
const SLIDER_DROP = 0.45;

const sliderTrackAttributes = () => ({
  strokeColor: boardPalette.sliderTrack,
  strokeWidth: 2,
  highlight: false,
  withLabel: false,
  fixed: true,
});

const sliderHandleAttributes = () => ({
  name: "",
  size: 3,
  face: "o" as const,
  strokeColor: "#1f6feb",
  fillColor: boardPalette.sliderHandleFill,
  highlight: true,
  withLabel: false,
  fixed: false,
});

const SLIDABLE_ROLES = new Set([
  "onLinear",
  "onPolygon",
  "onFunction",
  "onConic",
  "onCircle",
  "onParametric",
  "onLocus",
]);

const isSlidable = (object: PointObject): boolean => SLIDABLE_ROLES.has(object.role);

const isDraggable = (object: PointObject): boolean =>
  object.role === "free" ? !object.locked : isSlidable(object);

const allFree = (document: GeoDocument, pointIds: ObjectId[]): boolean =>
  pointIds.every((id) => {
    const endpoint = document.objects[id];
    return endpoint?.kind === "point" && endpoint.role === "free" && !endpoint.locked;
  });

const polygonPickDistance = (position: XY, vertices: XY[]): number => {
  let d = pointInPolygon(position, vertices) ? 0 : Infinity;
  for (let i = 0; i < vertices.length; i++) {
    d = Math.min(
      d,
      distancePointToSegment(position, vertices[i], vertices[(i + 1) % vertices.length]),
    );
  }
  return d;
};

const MATH_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

const GREEK_LETTERS: Record<string, string> = {
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  delta: "\\delta",
  epsilon: "\\varepsilon",
  zeta: "\\zeta",
  eta: "\\eta",
  theta: "\\theta",
  iota: "\\iota",
  kappa: "\\kappa",
  lambda: "\\lambda",
  mu: "\\mu",
  nu: "\\nu",
  xi: "\\xi",
  rho: "\\rho",
  sigma: "\\sigma",
  tau: "\\tau",
  phi: "\\phi",
  chi: "\\chi",
  psi: "\\psi",
  omega: "\\omega",
  Gamma: "\\Gamma",
  Delta: "\\Delta",
  Theta: "\\Theta",
  Lambda: "\\Lambda",
  Xi: "\\Xi",
  Pi: "\\Pi",
  Sigma: "\\Sigma",
  Phi: "\\Phi",
  Psi: "\\Psi",
  Omega: "\\Omega",
};

// Model names flow into JSXGraph text nodes rendered via innerHTML, so any
// markup characters from hand-edited project files must be neutralized. The
// KaTeX channel (plot labels, variable texts) escapes on its own.
const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Identifier-style names render in math mode: underscore segments become
// nested subscripts (a_1 -> a_{1}, a_1_2 -> a_{1_{2}}) and Greek letter names
// map to their glyphs. Anything else falls back to upright \text with the
// underscore escaped.
const texName = (name: string): string => {
  if (!MATH_IDENTIFIER.test(name)) return `\\text{${name.replace(/_/g, "\\_")}}`;
  const parts = name.split("_").map((part) => GREEK_LETTERS[part] ?? part);
  if (parts.length === 1) return parts[0];
  let sub = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 1; i--) sub = `${parts[i]}_{${sub}}`;
  return `${parts[0]}_{${sub}}`;
};

const plotLabelText = (object: GeoDocument["objects"][string]): string => {
  if (object.name) return texName(object.name);
  if (object.kind === "functionPlot") return `y = ${object.latex}`;
  if (object.kind === "parametricCurve")
    return `x(t) = ${object.xLatex},\\; y(t) = ${object.yLatex}`;
  return "";
};

export class BoardController {
  private readonly board: JXG.Board;
  private readonly container: HTMLElement;
  private readonly callbacks: BoardCallbacks;
  private readonly points = new Map<ObjectId, JXG.Point>();
  private readonly shapes = new Map<ObjectId, JXG.GeometryElement>();
  private readonly derivedLines = new Map<ObjectId, DerivedLineState>();
  private readonly transforms = new Map<ObjectId, DerivedLineState>();
  private readonly polygonTransforms = new Map<
    ObjectId,
    { points: JXG.Point[]; shape: JXG.GeometryElement }
  >();
  private readonly loci = new Map<ObjectId, { curve: JXG.Curve; samples: XY[] }>();
  private readonly axisStates = new Map<
    ObjectId,
    {
      helper: JXG.Point;
      lines: JXG.Line[];
      tickDistance: number;
      labels: { text: JXG.Text; origin: JXG.Point; through: JXG.Point }[];
    }
  >();
  private readonly sliders = new Map<
    ObjectId,
    { a: JXG.Point; b: JXG.Point; track: JXG.Line; handle: JXG.Point }
  >();
  private readonly circumcircleHelpers = new Map<ObjectId, JXG.Point>();
  private readonly plots = new Map<
    ObjectId,
    { curves: JXG.Curve[]; fragments: XY[][]; label: JXG.Text | null; labelContent: string | null }
  >();
  private readonly iterations = new Map<ObjectId, { points: JXG.Point[] }>();
  private readonly texts = new Map<ObjectId, JXG.Text>();
  private readonly textContents = new Map<ObjectId, string>();
  private readonly coordinateLabels = new Map<ObjectId, { text: JXG.Text; content: string }>();
  private preview: PreviewState | null = null;
  private polygonPreview: PolygonPreviewState | null = null;
  private selectedId: ObjectId | null = null;
  private readonly dragStart = new Map<JXG.GeometryElement, Map<JXG.Point, XY>>();

  constructor(container: HTMLElement, callbacks: BoardCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    // JSXGraph's SVG renderer forces inline position:relative on an
    // unpositioned container, which would break the absolute sizing from CSS.
    container.style.position = "absolute";
    this.board = JXG.JSXGraph.initBoard(container, {
      boundingbox: [-8, 5, 8, -5],
      keepaspectratio: true,
      axis: false,
      showCopyright: false,
      showNavigation: false,
      pan: { enabled: false },
    });
    debugLog(`board init container=${container.offsetWidth}x${container.offsetHeight}`);
    this.board.on("up", () => {
      // JSXGraph fires board-level "up" before element-level "up"; defer so the
      // element handlers finish the drag session before this safety net closes it.
      window.setTimeout(() => this.callbacks.onDragEnd(), 0);
    });
    this.board.on("boundingbox", () => {
      this.layoutListener?.();
      const document = this.callbacks.getDocument();
      for (const object of Object.values(document.objects)) {
        if (
          object.kind === "functionPlot" ||
          object.kind === "threePointParabola" ||
          object.kind === "conic"
        ) {
          this.syncPlot(object.id, document);
        }
      }
      for (const state of this.axisStates.values()) this.positionAxisLabels(state);
      for (const state of this.plots.values()) this.positionPlotLabel(state);
      for (const [id, state] of this.coordinateLabels) {
        const point = this.points.get(id);
        const object = document.objects[id];
        if (!point || object?.kind !== "point") continue;
        if (object.showCoordinates && !object.hidden) {
          this.positionCoordinateLabel(point, state.text, object);
        }
      }
      this.board.update();
    });
    // KaTeX loads as an async chunk. JSXGraph skips text re-rendering when the
    // content is unchanged (htmlStr diff), so labels created before the global
    // arrives would stay plain forever; invalidate their cache and re-render.
    void ensureKatex()
      .then(() => {
        if (this.destroyed) return;
        for (const element of this.board.objectsList) {
          const text = element as unknown as {
            htmlStr?: string;
            visProp?: Record<string, unknown>;
          };
          if (text.visProp?.usekatex === true && typeof text.htmlStr === "string") {
            text.htmlStr = "";
          }
        }
        this.board.fullUpdate();
      })
      .catch(() => {
        // Chunk load failed; labels stay plain and the next controller retries.
      });
  }

  private destroyed = false;

  destroy(): void {
    this.destroyed = true;
    this.dragStart.clear();
    JXG.JSXGraph.freeBoard(this.board);
  }

  hostElement(): HTMLElement {
    return this.container;
  }

  pixelsToUnits(pixels: number): number {
    return pixels / this.board.unitX;
  }

  pointerPosition(event: PointerEvent): XY {
    const [x, y] = this.board.getUsrCoordsOfMouse(event);
    return [x, y];
  }

  sync(document: GeoDocument): void {
    const positions = resolvePositions(document);
    for (const [id, point] of this.points) {
      if (!document.objects[id]) {
        this.board.removeObject(point);
        this.points.delete(id);
        this.dragStart.delete(point);
      }
    }
    for (const [id, shape] of this.shapes) {
      if (!document.objects[id]) {
        this.board.removeObject(shape);
        this.shapes.delete(id);
        this.dragStart.delete(shape);
      }
    }
    this.removeStaleDerivedStates(this.derivedLines, document);
    for (const [id, text] of this.texts) {
      if (!document.objects[id]) {
        this.board.removeObject(text);
        this.texts.delete(id);
        this.textContents.delete(id);
      }
    }
    for (const [id, state] of this.coordinateLabels) {
      if (!document.objects[id]) {
        this.board.removeObject(state.text);
        this.coordinateLabels.delete(id);
      }
    }
    this.removeStaleDerivedStates(this.transforms, document);
    for (const [id, state] of this.polygonTransforms) {
      if (!document.objects[id]) {
        this.board.removeObject([state.shape, ...state.points]);
        this.polygonTransforms.delete(id);
      }
    }
    for (const [id, state] of this.loci) {
      if (!document.objects[id]) {
        this.board.removeObject(state.curve);
        this.loci.delete(id);
      }
    }
    for (const [id, state] of this.axisStates) {
      if (!document.objects[id]) {
        this.board.removeObject([
          ...state.lines,
          state.helper,
          ...state.labels.map((label) => label.text),
        ]);
        this.axisStates.delete(id);
        for (const line of state.lines) this.dragStart.delete(line);
      }
    }
    for (const [id, state] of this.sliders) {
      const object = document.objects[id];
      const ranged =
        object?.kind === "variable" && object.min !== undefined && object.max !== undefined;
      if (!ranged) {
        this.board.removeObject([state.track, state.handle, state.a, state.b]);
        this.sliders.delete(id);
      }
    }
    for (const [id, helper] of this.circumcircleHelpers) {
      if (!document.objects[id]) {
        this.board.removeObject(helper);
        this.circumcircleHelpers.delete(id);
      }
    }
    for (const [id, state] of this.plots) {
      if (!document.objects[id]) {
        this.board.removeObject(state.label ? [...state.curves, state.label] : state.curves);
        this.plots.delete(id);
      }
    }
    for (const [id, state] of this.iterations) {
      if (!document.objects[id]) {
        this.board.removeObject(state.points);
        this.iterations.delete(id);
      }
    }
    // Points first: shape creation below depends on their JSXGraph elements,
    // so hand-edited files that list a shape before its points still render.
    for (const object of Object.values(document.objects)) {
      if (object.kind !== "point") continue;
      const position = positions.get(object.id);
      const point = this.points.get(object.id);
      if (point) {
        point.setAttribute({
          visible: position !== undefined && !object.hidden,
          fixed: !isDraggable(object),
        });
        if (position) this.syncPointPosition(point, position[0], position[1]);
        this.syncLabel(point, object);
        this.restyle(object.id, this.selectedId === object.id);
      } else if (position) {
        this.createPoint(object.id, position, object);
      }
      const element = this.points.get(object.id);
      if (element) this.syncCoordinateLabel(document, object, element, position);
    }
    for (const object of Object.values(document.objects)) {
      if (object.kind === "point") continue;
      if (DERIVED_LINE_KINDS.has(object.kind)) {
        this.syncDerivedLine(object.id, document);
        continue;
      }
      if (object.kind === "transform") {
        this.syncTransform(object.id, document);
        continue;
      }
      if (object.kind === "locus") {
        this.syncLocus(object.id, document);
        continue;
      }
      if (object.kind === "animation") continue;
      if (AXIS_KINDS.has(object.kind)) {
        this.syncAxis(object.id, document);
        continue;
      }
      if (object.kind === "functionPlot" || object.kind === "parametricCurve") {
        this.syncPlot(object.id, document);
        continue;
      }
      if (object.kind === "conic" || object.kind === "threePointParabola") {
        this.syncPlot(object.id, document);
        continue;
      }
      if (object.kind === "iteration") {
        this.syncIteration(object.id, document);
        continue;
      }
      if (TEXT_KINDS.has(object.kind)) {
        this.syncText(object, document);
        if (object.kind === "variable") this.syncSlider(object);
        continue;
      }
      if (!this.shapes.has(object.id)) this.createShape(object.id, document);
      this.syncShapeVisibility(object.id, document, positions);
      if (object.kind === "circumcircle") this.syncCircumcircleCenter(object, positions);
      const shape = this.shapes.get(object.id);
      if (shape) {
        this.syncLabel(shape, object);
        this.restyle(object.id, this.selectedId === object.id);
      }
    }
    this.board.update();
    debugLog(
      `sync objects=${Object.keys(document.objects).length} points=${this.points.size} shapes=${this.shapes.size}`,
    );
    this.layoutListener?.();
  }

  setSelected(id: ObjectId | null): void {
    if (this.selectedId === id) return;
    const previousId = this.selectedId;
    this.selectedId = id;
    if (previousId) this.restyle(previousId, false);
    if (id) this.restyle(id, true);
  }

  setPreview(kind: PreviewKind, from: XY, to: XY): void {
    if (!this.preview || this.preview.kind !== kind) this.createPreview(kind);
    const preview = this.preview;
    if (!preview) return;
    preview.a.setPosition(JXG.COORDS_BY_USER, from);
    preview.b.setPosition(JXG.COORDS_BY_USER, to);
    this.board.update();
  }

  setPolygonPreview(vertices: XY[], cursor: XY): void {
    const parts: { from: XY; to: XY; dashed: boolean }[] = [];
    for (let i = 0; i + 1 < vertices.length; i++) {
      parts.push({ from: vertices[i], to: vertices[i + 1], dashed: false });
    }
    if (vertices.length > 0) {
      parts.push({ from: vertices[vertices.length - 1], to: cursor, dashed: true });
    }
    if (vertices.length >= 3) {
      parts.push({ from: cursor, to: vertices[0], dashed: true });
    }
    const state = this.polygonPreview ?? { segments: [] };
    while (state.segments.length < parts.length) {
      const a = this.board.create("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES });
      const b = this.board.create("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES });
      const shape = this.board.create<JXG.Line>("segment", [a, b], { ...previewShapeAttributes() });
      state.segments.push({ a, b, shape });
    }
    for (let i = 0; i < state.segments.length; i++) {
      const segment = state.segments[i];
      const part = parts[i];
      if (part) {
        segment.a.setPosition(JXG.COORDS_BY_USER, part.from);
        segment.b.setPosition(JXG.COORDS_BY_USER, part.to);
        segment.shape.setAttribute({ visible: true, dash: part.dashed ? 2 : 0 });
      } else {
        segment.shape.setAttribute({ visible: false });
      }
    }
    this.polygonPreview = state;
    this.board.update();
  }

  clearShapePreview(): void {
    if (!this.preview) return;
    this.board.removeObject([this.preview.shape, this.preview.a, this.preview.b]);
    this.preview = null;
  }

  clearPreview(): void {
    this.clearShapePreview();
    if (this.polygonPreview) {
      for (const segment of this.polygonPreview.segments) {
        this.board.removeObject([segment.shape, segment.a, segment.b]);
      }
      this.polygonPreview = null;
    }
  }

  pickPoint(position: XY, document: GeoDocument, tolerance: number): ObjectId | null {
    const positions = resolvePositions(document);
    let best: { id: ObjectId; d: number } | null = null;
    for (const point of listObjects(document, "point")) {
      if (point.hidden) continue;
      const resolved = positions.get(point.id);
      if (!resolved) continue;
      const d = distance(position, resolved);
      if (d <= tolerance && (!best || d < best.d)) best = { id: point.id, d };
    }
    return best ? best.id : null;
  }

  pickObject(position: XY, document: GeoDocument, tolerance: number): ObjectId | null {
    const point = this.pickPoint(position, document, tolerance);
    if (point) return point;
    const positions = resolvePositions(document);
    let bestId: ObjectId | null = null;
    let bestDistance = Infinity;
    const consider = (id: ObjectId, d: number) => {
      if (d <= tolerance && d < bestDistance) {
        bestId = id;
        bestDistance = d;
      }
    };
    for (const linear of [
      ...listObjects(document, "segment"),
      ...listObjects(document, "line"),
      ...listObjects(document, "ray"),
      ...listObjects(document, "perpendicularLine"),
      ...listObjects(document, "parallelLine"),
      ...listObjects(document, "angleBisector"),
      ...listObjects(document, "tangentLine"),
      ...listObjects(document, "conicLine"),
      ...listObjects(document, "transform"),
    ]) {
      if (linear.hidden) continue;
      const shape = resolveShapePositions(document, linear.id);
      if (!shape || shape.type === "circle") continue;
      consider(linear.id, distanceToShape(position, shape));
    }
    for (const circle of [
      ...listObjects(document, "circle"),
      ...listObjects(document, "circumcircle"),
      ...listObjects(document, "transform"),
    ]) {
      if (circle.hidden) continue;
      const shape = resolveShapePositions(document, circle.id);
      if (shape?.type === "circle") {
        consider(circle.id, distanceToShape(position, shape));
      }
    }
    for (const polygon of listObjects(document, "polygon")) {
      if (polygon.hidden) continue;
      const vertices: XY[] = [];
      let complete = true;
      for (const pointId of polygon.points) {
        const vertex = positions.get(pointId);
        if (!vertex) {
          complete = false;
          break;
        }
        vertices.push(vertex);
      }
      if (!complete) continue;
      consider(polygon.id, polygonPickDistance(position, vertices));
    }
    for (const transform of listObjects(document, "transform")) {
      if (transform.hidden) continue;
      const source = document.objects[transform.source];
      if (source?.kind !== "polygon") continue;
      const vertices = resolveTransformedPolygon(document, transform.id);
      if (!vertices) continue;
      consider(transform.id, polygonPickDistance(position, vertices));
    }
    for (const textObject of [
      ...listObjects(document, "measurement"),
      ...listObjects(document, "variable"),
      ...listObjects(document, "calculation"),
    ]) {
      if (textObject.hidden) continue;
      consider(textObject.id, distance(position, textObject.position) / 3);
    }
    for (const locus of listObjects(document, "locus")) {
      if (locus.hidden) continue;
      const samples = locusPoints(
        document,
        locus.driver,
        locus.target,
        60,
        this.board.getBoundingBox(),
      );
      if (!samples) continue;
      consider(locus.id, distanceToFragments(position, [samples]));
    }
    for (const axis of [
      ...listObjects(document, "axisSystem"),
      ...listObjects(document, "numberAxis"),
    ]) {
      if (axis.hidden) continue;
      const frame = axisFrame(document, axis.id);
      if (!frame) continue;
      let d = distancePointToLine(position, frame.origin, [
        frame.origin[0] + frame.ux[0],
        frame.origin[1] + frame.ux[1],
      ]);
      if (axis.kind === "axisSystem") {
        d = Math.min(
          d,
          distancePointToLine(position, frame.origin, [
            frame.origin[0] + frame.uy[0],
            frame.origin[1] + frame.uy[1],
          ]),
        );
      }
      consider(axis.id, d);
    }
    for (const plot of [
      ...listObjects(document, "functionPlot"),
      ...listObjects(document, "parametricCurve"),
      ...listObjects(document, "conic"),
      ...listObjects(document, "threePointParabola"),
    ]) {
      if (plot.hidden) continue;
      const fragments =
        plot.kind === "functionPlot"
          ? sampleFunction(document, plot.id, this.board.getBoundingBox())
          : plot.kind === "parametricCurve"
            ? sampleParametric(document, plot.id)
            : plot.kind === "conic"
              ? sampleConic(document, plot.id)
              : sampleThreePointParabola(document, plot.id, this.board.getBoundingBox());
      if (!fragments) continue;
      consider(plot.id, distanceToFragments(position, fragments));
    }
    for (const iteration of listObjects(document, "iteration")) {
      if (iteration.hidden) continue;
      const points = iterationPoints(document, iteration.id);
      if (!points) continue;
      let d = Infinity;
      for (const point of points) d = Math.min(d, distance(position, point));
      consider(iteration.id, d);
    }
    return bestId;
  }

  private createPoint(id: ObjectId, position: XY, object: PointObject & Presentable): void {
    const draggable = isDraggable(object);
    const point = this.board.create<JXG.Point>("point", position, {
      ...POINT_ATTRIBUTES,
      fixed: !draggable,
      visible: !object.hidden,
      withLabel: true,
      name: escapeHtml(object.name ?? ""),
    });
    this.points.set(id, point);
    this.attachWriteback(point, object);
    this.restyle(id, this.selectedId === id);
  }

  private createShape(id: ObjectId, document: GeoDocument): void {
    const object = document.objects[id];
    if (!object || object.kind === "point") return;
    if (object.kind === "polygon") {
      this.createPolygonShape(object, document);
      return;
    }
    if (object.kind === "circumcircle") {
      this.createCircumcircleShape(object);
      return;
    }
    const endpointIds = dependenciesOf(object);
    const first = this.points.get(endpointIds[0]);
    const second = this.points.get(endpointIds[1]);
    if (!first || !second) return;
    const draggable = allFree(document, endpointIds);
    let shape: JXG.GeometryElement;
    if (object.kind === "circle") {
      shape = this.board.create<JXG.Circle>("circle", [first, second], {
        ...shapeAttributes(),
        fixed: !draggable,
        withLabel: true,
        name: escapeHtml(object.name ?? ""),
      });
    } else {
      const isRay = object.kind === "ray";
      const attributes = isRay
        ? { ...shapeAttributes(), ...RAY_ATTRIBUTES, fixed: !draggable }
        : { ...shapeAttributes(), fixed: !draggable };
      shape = this.board.create<JXG.Line>(isRay ? "line" : object.kind, [first, second], {
        ...attributes,
        withLabel: true,
        name: escapeHtml(object.name ?? ""),
      });
    }
    this.shapes.set(id, shape);
    this.attachShapeWriteback(shape, object);
    this.restyle(id, this.selectedId === id);
  }

  private createPolygonShape(object: Polygon & Presentable, document: GeoDocument): void {
    const vertices: JXG.Point[] = [];
    for (const pointId of object.points) {
      const point = this.points.get(pointId);
      if (!point) return;
      vertices.push(point);
    }
    const draggable = allFree(document, object.points);
    const shape = this.board.create<JXG.Polygon>("polygon", vertices, {
      ...polygonAttributes(),
      fixed: !draggable,
      withLabel: true,
      name: escapeHtml(object.name ?? ""),
    });
    this.shapes.set(object.id, shape);
    this.attachShapeWriteback(shape, object);
    this.restyle(object.id, this.selectedId === object.id);
  }

  private createCircumcircleShape(object: Circumcircle & Presentable): void {
    const through = this.points.get(object.p1);
    if (!through) return;
    const helper = this.board.create<JXG.Point>("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES });
    const shape = this.board.create<JXG.Circle>("circle", [helper, through], {
      ...shapeAttributes(),
      fixed: true,
      withLabel: true,
      name: escapeHtml(object.name ?? ""),
    });
    this.circumcircleHelpers.set(object.id, helper);
    this.shapes.set(object.id, shape);
    this.restyle(object.id, this.selectedId === object.id);
  }

  private syncCircumcircleCenter(
    object: Circumcircle & Presentable,
    positions: Map<ObjectId, XY>,
  ): void {
    const helper = this.circumcircleHelpers.get(object.id);
    if (!helper) return;
    const a = positions.get(object.p1);
    const b = positions.get(object.p2);
    const c = positions.get(object.p3);
    const center = a && b && c ? circumcenterOf(a, b, c) : null;
    if (center) helper.setPosition(JXG.COORDS_BY_USER, center);
  }

  private syncDerivedLine(id: ObjectId, document: GeoDocument): void {
    const object = document.objects[id];
    if (!object) return;
    const resolved = resolveShapePositions(document, id);
    const endpoints = resolved && resolved.type !== "circle" ? [resolved.a, resolved.b] : null;
    let state = this.derivedLines.get(id);
    if (!state) {
      if (!endpoints) return;
      state = this.createDerivedLineState(object, resolved?.type === "ray");
    }
    if (!endpoints) {
      state.shape.setAttribute({ visible: false });
      return;
    }
    state.a.setPosition(JXG.COORDS_BY_USER, endpoints[0]);
    state.b.setPosition(JXG.COORDS_BY_USER, endpoints[1]);
    state.shape.setAttribute({ visible: !object.hidden });
    this.syncLabel(state.shape, object);
    this.restyle(id, this.selectedId === id);
  }

  private createDerivedLineState(
    object: GeoDocument["objects"][string],
    ray: boolean,
  ): DerivedLineState {
    return this.createHiddenPairState(object, this.derivedLines, (a, b) =>
      this.board.create<JXG.Line>("line", [a, b], {
        ...shapeAttributes(),
        ...(ray ? RAY_ATTRIBUTES : {}),
        fixed: true,
        withLabel: true,
        name: escapeHtml(object.name ?? ""),
      }),
    );
  }

  private createHiddenPairState(
    object: GeoDocument["objects"][string],
    map: Map<ObjectId, DerivedLineState>,
    createShape: (a: JXG.Point, b: JXG.Point) => JXG.GeometryElement,
  ): DerivedLineState {
    const a = this.board.create("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES });
    const b = this.board.create("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES });
    const state: DerivedLineState = { a, b, shape: createShape(a, b) };
    map.set(object.id, state);
    return state;
  }

  private removeStaleDerivedStates(
    map: Map<ObjectId, DerivedLineState>,
    document: GeoDocument,
  ): void {
    for (const [id, state] of map) {
      if (!document.objects[id]) {
        this.board.removeObject([state.shape, state.a, state.b]);
        map.delete(id);
      }
    }
  }

  private syncTransform(id: ObjectId, document: GeoDocument): void {
    const object = document.objects[id];
    if (object?.kind !== "transform") return;
    const source = document.objects[object.source];
    if (
      source?.kind === "polygon" ||
      (source?.kind === "transform" && resolveTransformedPolygon(document, id) !== null)
    ) {
      this.syncTransformedPolygon(object, document);
      return;
    }
    const resolved = resolveShapePositions(document, id);
    let state = this.transforms.get(id);
    if (!state) {
      if (!resolved) return;
      state = this.createTransformState(object, resolved);
    }
    if (!resolved) {
      state.shape.setAttribute({ visible: false });
      return;
    }
    if (resolved.type === "circle") {
      state.a.setPosition(JXG.COORDS_BY_USER, resolved.center);
      state.b.setPosition(JXG.COORDS_BY_USER, [
        resolved.center[0] + resolved.radius,
        resolved.center[1],
      ]);
    } else {
      state.a.setPosition(JXG.COORDS_BY_USER, resolved.a);
      state.b.setPosition(JXG.COORDS_BY_USER, resolved.b);
    }
    state.shape.setAttribute({ visible: !object.hidden });
    this.syncLabel(state.shape, object);
    this.restyle(id, this.selectedId === id);
  }

  private createTransformState(
    object: GeoDocument["objects"][string],
    resolved: ResolvedShape,
  ): DerivedLineState {
    return this.createHiddenPairState(object, this.transforms, (a, b) => {
      const attributes = {
        ...shapeAttributes(),
        fixed: true,
        withLabel: true,
        name: escapeHtml(object.name ?? ""),
      };
      if (resolved.type === "circle") {
        return this.board.create<JXG.Circle>("circle", [a, b], attributes);
      }
      if (resolved.type === "segment") {
        return this.board.create<JXG.Line>("segment", [a, b], attributes);
      }
      return this.board.create<JXG.Line>("line", [a, b], {
        ...attributes,
        ...(resolved.type === "ray" ? RAY_ATTRIBUTES : {}),
      });
    });
  }

  private syncTransformedPolygon(
    object: GeoDocument["objects"][string],
    document: GeoDocument,
  ): void {
    const vertices = resolveTransformedPolygon(document, object.id);
    let state = this.polygonTransforms.get(object.id);
    if (!state) {
      if (!vertices) return;
      const points = vertices.map(() =>
        this.board.create("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES }),
      );
      const shape = this.board.create<JXG.Polygon>("polygon", points, {
        ...polygonAttributes(),
        fixed: true,
        withLabel: true,
        name: escapeHtml(object.name ?? ""),
      });
      state = { points, shape };
      this.polygonTransforms.set(object.id, state);
    }
    if (!vertices || vertices.length !== state.points.length) {
      state.shape.setAttribute({ visible: false });
      return;
    }
    state.points.forEach((point, index) => {
      point.setPosition(JXG.COORDS_BY_USER, vertices[index]);
    });
    state.shape.setAttribute({ visible: !object.hidden });
    this.syncLabel(state.shape, object);
    this.restyle(object.id, this.selectedId === object.id);
  }

  private syncLocus(id: ObjectId, document: GeoDocument): void {
    const object = document.objects[id];
    if (object?.kind !== "locus") return;
    const samples = locusPoints(
      document,
      object.driver,
      object.target,
      120,
      this.board.getBoundingBox(),
    );
    let state = this.loci.get(id);
    if (!state) {
      if (!samples) return;
      const curve = this.board.create<JXG.Curve>("curve", [[0], [0]], {
        ...shapeAttributes(),
        fixed: true,
        withLabel: true,
        name: escapeHtml(object.name ?? ""),
      });
      const created = { curve, samples: [] as XY[] };
      curve.updateDataArray = () => {
        curve.dataX = created.samples.map((p) => p[0]);
        curve.dataY = created.samples.map((p) => p[1]);
      };
      this.loci.set(id, created);
      state = created;
    }
    state.samples = samples ?? [];
    state.curve.setAttribute({ visible: samples !== null && !object.hidden });
    this.syncLabel(state.curve, object);
    this.restyle(id, this.selectedId === id);
  }

  private syncAxis(id: ObjectId, document: GeoDocument): void {
    const object = document.objects[id];
    if (!object || (object.kind !== "axisSystem" && object.kind !== "numberAxis")) return;
    const frame = axisFrame(document, id);
    const originPoint = this.points.get(object.origin);
    const unitPoint = this.points.get(object.unit);
    const tickDistance = frame ? Math.hypot(frame.ux[0], frame.ux[1]) : null;
    const draggable = allFree(document, [object.origin, object.unit]);
    let state = this.axisStates.get(id);
    if (state && tickDistance !== null && Math.abs(state.tickDistance - tickDistance) > 1e-9) {
      this.board.removeObject([
        ...state.lines,
        state.helper,
        ...state.labels.map((label) => label.text),
      ]);
      this.axisStates.delete(id);
      state = undefined;
    }
    if (!state) {
      if (!frame || !originPoint || !unitPoint || tickDistance === null) return;
      const helper = this.board.create("point", [0, 0], {
        ...HIDDEN_POINT_ATTRIBUTES,
        fixed: false,
      });
      const lines: JXG.Line[] = [this.createAxisLine(originPoint, unitPoint, tickDistance)];
      const labels: { text: JXG.Text; origin: JXG.Point; through: JXG.Point }[] = [];
      if (object.kind === "axisSystem") {
        lines.push(this.createAxisLine(originPoint, helper, tickDistance));
        labels.push(
          { text: this.createFloatingLabel("x"), origin: originPoint, through: unitPoint },
          { text: this.createFloatingLabel("y"), origin: originPoint, through: helper },
        );
      }
      for (const line of lines) {
        // A lone origin/unit point drag fans "down"/"up" out to the line but
        // never "drag"; only an actual line drag may translate the axis.
        let lineDragged = false;
        line.on("down", () => {
          lineDragged = false;
        });
        line.on("drag", () => {
          lineDragged = true;
        });
        this.attachDragLifecycle(
          line,
          (event) => {
            if (lineDragged) this.writeAxisDrag(id, line, helper, event);
          },
          [originPoint, unitPoint, helper],
        );
      }
      state = { helper, lines, tickDistance, labels };
      this.axisStates.set(id, state);
    }
    const visible = frame !== null && originPoint !== undefined && !object.hidden;
    if (frame) {
      state.helper.setPosition(JXG.COORDS_BY_USER, [
        frame.origin[0] + frame.uy[0],
        frame.origin[1] + frame.uy[1],
      ]);
    }
    for (const line of state.lines) {
      line.setAttribute({ visible, fixed: !draggable });
      (line as unknown as { defaultTicks: JXG.Ticks }).defaultTicks.setAttribute({ visible });
    }
    for (const label of state.labels) {
      label.text.setAttribute({ visible, strokeColor: boardPalette.textStroke });
    }
    this.restyle(id, this.selectedId === id);
    this.positionAxisLabels(state);
  }

  private writeAxisDrag(
    id: ObjectId,
    line: JXG.Line,
    helper: JXG.Point,
    event?: PointerEvent,
  ): void {
    const document = this.callbacks.getDocument();
    const object = document.objects[id];
    if (!object || (object.kind !== "axisSystem" && object.kind !== "numberAxis")) return;
    const originModel = document.objects[object.origin];
    const unitModel = document.objects[object.unit];
    const originPoint = this.points.get(object.origin);
    const unitPoint = this.points.get(object.unit);
    if (
      !originPoint ||
      !unitPoint ||
      originModel?.kind !== "point" ||
      unitModel?.kind !== "point" ||
      originModel.role !== "free" ||
      unitModel.role !== "free"
    ) {
      return;
    }
    const starts = this.dragStart.get(line);
    const startOrigin = starts?.get(originPoint);
    const startUnit = starts?.get(unitPoint);
    const startHelper = starts?.get(helper);
    if (!startOrigin || !startUnit || !startHelper) return;
    const dOrigin: XY = [originPoint.X() - startOrigin[0], originPoint.Y() - startOrigin[1]];
    const dUnit: XY = [unitPoint.X() - startUnit[0], unitPoint.Y() - startUnit[1]];
    const dHelper: XY = [helper.X() - startHelper[0], helper.Y() - startHelper[1]];
    const same = (p: XY, q: XY) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
    // The caller gates on an actual line drag, so the origin plus exactly one
    // companion should have moved together: the unit point (x line) or the
    // hidden helper (y line). Anything else means a partial drag; do not move.
    const isLineDrag = !same(dOrigin, [0, 0]) && (same(dOrigin, dUnit) || same(dOrigin, dHelper));
    if (!isLineDrag) return;
    const delta = event?.shiftKey ? snapDisplacement([0, 0], dOrigin) : dOrigin;
    const originTarget: XY = [startOrigin[0] + delta[0], startOrigin[1] + delta[1]];
    const unitTarget: XY = [startUnit[0] + delta[0], startUnit[1] + delta[1]];
    originPoint.setPosition(JXG.COORDS_BY_USER, originTarget);
    unitPoint.setPosition(JXG.COORDS_BY_USER, unitTarget);
    this.board.update();
    this.callbacks.onPointDragged(object.origin, originTarget[0], originTarget[1]);
    this.callbacks.onPointDragged(object.unit, unitTarget[0], unitTarget[1]);
  }

  private createAxisLine(origin: JXG.Point, through: JXG.Point, tickDistance: number): JXG.Line {
    const line = this.board.create<JXG.Line>("axis", [origin, through], {
      ...axisLineAttributes(),
      fixed: false,
      withLabel: false,
      ticks: {
        ticksDistance: tickDistance,
        drawLabels: true,
        drawZero: false,
        minorTicks: 0,
        insertTicks: false,
        strokeColor: boardPalette.axisStroke,
        label: { fontSize: 10, offset: [4, 4], strokeColor: boardPalette.tickLabel },
        generateLabelText: (tick: JXG.Coords) => {
          const ux = through.X() - origin.X();
          const uy = through.Y() - origin.Y();
          const len2 = ux * ux + uy * uy;
          if (len2 < 1e-12) return "";
          const dx = tick.usrCoords[1] - origin.X();
          const dy = tick.usrCoords[2] - origin.Y();
          return String(Math.round((dx * ux + dy * uy) / len2));
        },
      },
    });
    // JXG.createAxis force-marks the axis line and both parent points as
    // non-draggable; undo that so the axis can be dragged and its origin/unit
    // points stay adjustable. The fixed attribute still gates dragging per sync.
    for (const element of [line, origin, through]) {
      (element as unknown as { isDraggable: boolean }).isDraggable = true;
    }
    // Anchor ticks at the axis origin (JSXGraph defaults to the projection of the
    // board origin), so positions and labels follow the axis frame's own units.
    const ticks = (line as unknown as { defaultTicks: { getZeroCoordinates: () => JXG.Coords } })
      .defaultTicks;
    ticks.getZeroCoordinates = () => origin.coords;
    return line;
  }

  private syncPlot(id: ObjectId, document: GeoDocument): void {
    const object = document.objects[id];
    if (!object) return;
    const [left, top, right, bottom] = this.board.getBoundingBox();
    const viewExtent = Math.hypot(right - left, top - bottom);
    const fragments =
      object.kind === "functionPlot"
        ? sampleFunction(document, id, this.board.getBoundingBox())
        : object.kind === "parametricCurve"
          ? sampleParametric(document, id)
          : object.kind === "conic"
            ? sampleConic(document, id, viewExtent)
            : object.kind === "threePointParabola"
              ? sampleThreePointParabola(document, id, this.board.getBoundingBox())
              : null;
    let state = this.plots.get(id);
    if (!state) {
      state = { curves: [], fragments: [], label: null, labelContent: null };
      this.plots.set(id, state);
    }
    const plotState = state;
    const count = fragments?.length ?? 0;
    while (plotState.curves.length < count) {
      const index = plotState.curves.length;
      const curve = this.board.create<JXG.Curve>("curve", [[0], [0]], {
        ...shapeAttributes(),
        fixed: true,
        withLabel: false,
        name: "",
      });
      curve.updateDataArray = () => {
        const points = plotState.fragments[index] ?? [];
        curve.dataX = points.map((p) => p[0]);
        curve.dataY = points.map((p) => p[1]);
      };
      plotState.curves.push(curve);
    }
    plotState.fragments = fragments ?? [];
    plotState.curves.forEach((curve, index) => {
      curve.setAttribute({ visible: index < count && !object.hidden });
    });
    this.syncPlotLabel(object, plotState);
    this.restyle(id, this.selectedId === id);
  }

  private createFloatingLabel(content: string): JXG.Text {
    return this.board.create<JXG.Text>("text", [0, 0, content], {
      ...textAttributes(),
      useKatex: true,
      fontSize: 15,
      fixed: true,
      anchorX: "middle",
      anchorY: "middle",
    });
  }

  private clampLabelToView(label: JXG.Text, px: XY): XY {
    const node = (label as unknown as { rendNode?: HTMLElement }).rendNode;
    const halfWidth = (node?.offsetWidth ?? 0) / 2;
    const halfHeight = (node?.offsetHeight ?? 0) / 2;
    const margin = 8;
    const width = this.board.canvasWidth;
    const height = this.board.canvasHeight;
    return [
      Math.min(
        Math.max(px[0], margin + halfWidth),
        Math.max(margin + halfWidth, width - margin - halfWidth),
      ),
      Math.min(
        Math.max(px[1], margin + halfHeight),
        Math.max(margin + halfHeight, height - margin - halfHeight),
      ),
    ];
  }

  // Axis arrowheads sit exactly on the view boundary, so the x/y labels are
  // floating texts repositioned on every sync and pan/zoom: at the ray's exit
  // point, pulled inward along the axis and lifted sideways, clamped on-canvas.
  private positionAxisLabels(state: {
    labels: { text: JXG.Text; origin: JXG.Point; through: JXG.Point }[];
  }): void {
    const [left, top, right, bottom] = this.board.getBoundingBox();
    for (const { text, origin, through } of state.labels) {
      const dx = through.X() - origin.X();
      const dy = through.Y() - origin.Y();
      const length = Math.hypot(dx, dy);
      if (length < 1e-12) continue;
      const direction: XY = [dx / length, dy / length];
      const o: XY = [origin.X(), origin.Y()];
      let exit = Infinity;
      if (direction[0] > 1e-12) exit = Math.min(exit, (right - o[0]) / direction[0]);
      else if (direction[0] < -1e-12) exit = Math.min(exit, (left - o[0]) / direction[0]);
      if (direction[1] > 1e-12) exit = Math.min(exit, (top - o[1]) / direction[1]);
      else if (direction[1] < -1e-12) exit = Math.min(exit, (bottom - o[1]) / direction[1]);
      if (!Number.isFinite(exit) || exit <= 0) continue;
      const originPx = this.toScreen(o);
      const tipPx = this.toScreen([o[0] + direction[0] * exit, o[1] + direction[1] * exit]);
      const spanPx = Math.hypot(tipPx[0] - originPx[0], tipPx[1] - originPx[1]);
      if (spanPx < 1e-6) continue;
      const dirPx: XY = [(tipPx[0] - originPx[0]) / spanPx, (tipPx[1] - originPx[1]) / spanPx];
      let lift: XY = [-dirPx[1], dirPx[0]];
      if (lift[1] > 0) lift = [-lift[0], -lift[1]];
      text.setPosition(
        JXG.COORDS_BY_SCREEN,
        this.clampLabelToView(text, [
          tipPx[0] - dirPx[0] * 22 + lift[0] * 12,
          tipPx[1] - dirPx[1] * 22 + lift[1] * 12,
        ]),
      );
    }
  }

  private syncPlotLabel(
    object: GeoDocument["objects"][string],
    state: { fragments: XY[][]; label: JXG.Text | null; labelContent: string | null },
  ): void {
    const content = plotLabelText(object);
    const show =
      content !== "" && !object.hidden && state.fragments.some((fragment) => fragment.length > 0);
    if (show && !state.label) {
      state.label = this.createFloatingLabel("");
      state.labelContent = null;
    }
    const label = state.label;
    if (!label) return;
    if (show && state.labelContent !== content) {
      label.setText(content);
      state.labelContent = content;
    }
    label.setAttribute({ visible: show, strokeColor: boardPalette.textStroke });
    if (show) this.positionPlotLabel(state);
  }

  // Plot labels anchor to the visible sample with the most clearance from
  // every view edge (ties break rightward) and are clamped on-canvas, so they
  // sit on a readable stretch of the curve instead of hugging the boundary.
  private positionPlotLabel(state: { fragments: XY[][]; label: JXG.Text | null }): void {
    const label = state.label;
    if (!label) return;
    const width = this.board.canvasWidth;
    const height = this.board.canvasHeight;
    let anchor: XY | null = null;
    let bestClearance = -Infinity;
    for (const fragment of state.fragments) {
      for (const point of fragment) {
        const px = this.toScreen(point);
        const clearance = Math.min(px[0], width - px[0], px[1], height - px[1]);
        if (
          clearance > bestClearance + 1e-6 ||
          (Math.abs(clearance - bestClearance) <= 1e-6 && anchor !== null && px[0] > anchor[0])
        ) {
          bestClearance = clearance;
          anchor = px;
        }
      }
    }
    if (!anchor) return;
    label.setPosition(
      JXG.COORDS_BY_SCREEN,
      this.clampLabelToView(label, [anchor[0] + 16, anchor[1] - 16]),
    );
  }

  private syncIteration(id: ObjectId, document: GeoDocument): void {
    const object = document.objects[id];
    if (object?.kind !== "iteration") return;
    const points = iterationPoints(document, id);
    let state = this.iterations.get(id);
    if (!state) {
      state = { points: [] };
      this.iterations.set(id, state);
    }
    const iterationState = state;
    const count = points?.length ?? 0;
    while (iterationState.points.length < count) {
      iterationState.points.push(
        this.board.create("point", [0, 0], { ...iterationPointAttributes() }),
      );
    }
    iterationState.points.forEach((point, index) => {
      const position = points?.[index];
      point.setAttribute({ visible: position !== undefined && !object.hidden });
      if (position) point.setPosition(JXG.COORDS_BY_USER, position);
    });
    this.restyle(id, this.selectedId === id);
  }

  clearTraces(): void {
    this.board.clearTraces();
  }

  toScreen(position: XY): XY {
    const coords = new JXG.Coords(JXG.COORDS_BY_USER, [position[0], position[1]], this.board);
    return [coords.scrCoords[1], coords.scrCoords[2]];
  }

  viewBox(): readonly [number, number, number, number] {
    return this.board.getBoundingBox();
  }

  setLayoutListener(listener: (() => void) | null): void {
    this.layoutListener = listener;
  }

  private layoutListener: (() => void) | null = null;

  private syncText(object: GeoDocument["objects"][string], document: GeoDocument): void {
    if (!TEXT_KINDS.has(object.kind) || object.kind === "point") return;
    const positioned = object as GeoDocument["objects"][string] & { position: XY };
    let text = this.texts.get(object.id);
    if (!text) {
      const created = this.board.create<JXG.Text>(
        "text",
        [positioned.position[0], positioned.position[1], ""],
        { ...textAttributes(), useKatex: true },
      );
      this.texts.set(object.id, created);
      this.attachDragLifecycle(created, () =>
        this.callbacks.onTextMoved(object.id, [created.X(), created.Y()]),
      );
      text = created;
    }
    const index = valueIndexOf(document, object.id);
    const texLabel = object.name ? texName(object.name) : index !== null ? `v_{${index}}` : "?";
    const lockMark =
      (object.kind === "measurement" || object.kind === "calculation") &&
      object.locked !== undefined
        ? "\\;\\text{🔒}"
        : "";
    const value = object.kind === "variable" ? object.value : computeValue(document, object.id);
    const degreeMark =
      object.kind === "measurement" && object.quantity === "angle" ? "^{\\circ}" : "";
    const content = `${texLabel} = ${formatValue(value)}${degreeMark}${lockMark}`;
    if (this.textContents.get(object.id) !== content) {
      text.setText(content);
      this.textContents.set(object.id, content);
    }
    text.setAttribute({
      visible: !object.hidden,
      strokeColor:
        this.selectedId === object.id
          ? SELECTED_COLOR
          : (object.style?.strokeColor ?? boardPalette.textStroke),
    });
    const [x, y] = positioned.position;
    if (Math.abs(text.X() - x) > 1e-10 || Math.abs(text.Y() - y) > 1e-10) {
      text.setPosition(JXG.COORDS_BY_USER, [x, y]);
    }
  }

  private syncSlider(object: Variable & Presentable): void {
    const ranged = object.min !== undefined && object.max !== undefined;
    if (!ranged) return;
    const min = object.min ?? 0;
    const max = object.max ?? 1;
    const [x, y] = object.position;
    const trackY = y - SLIDER_DROP;
    const span = max - min;
    const t = span > 0 ? Math.max(0, Math.min(1, (object.value - min) / span)) : 0;
    let state = this.sliders.get(object.id);
    if (!state) {
      const a = this.board.create<JXG.Point>("point", [x, trackY], { ...HIDDEN_POINT_ATTRIBUTES });
      const b = this.board.create<JXG.Point>("point", [x + SLIDER_LENGTH, trackY], {
        ...HIDDEN_POINT_ATTRIBUTES,
      });
      const track = this.board.create<JXG.Line>("segment", [a, b], {
        ...sliderTrackAttributes(),
      });
      const handle = this.board.create<JXG.Point>("point", [x + t * SLIDER_LENGTH, trackY], {
        ...sliderHandleAttributes(),
      });
      state = { a, b, track, handle };
      this.sliders.set(object.id, state);
      this.attachDragLifecycle(handle, () => this.constrainSlider(object.id));
    }
    state.a.setPosition(JXG.COORDS_BY_USER, [x, trackY]);
    state.b.setPosition(JXG.COORDS_BY_USER, [x + SLIDER_LENGTH, trackY]);
    state.handle.setPosition(JXG.COORDS_BY_USER, [x + t * SLIDER_LENGTH, trackY]);
    const visible = !object.hidden;
    state.track.setAttribute({ visible, strokeColor: boardPalette.sliderTrack });
    state.handle.setAttribute({
      visible,
      strokeColor: "#1f6feb",
      fillColor: boardPalette.sliderHandleFill,
    });
  }

  private constrainSlider(id: ObjectId): void {
    const state = this.sliders.get(id);
    const object = this.callbacks.getDocument().objects[id];
    if (!state || object?.kind !== "variable") return;
    if (object.min === undefined || object.max === undefined) return;
    const x = object.position[0];
    const trackY = object.position[1] - SLIDER_DROP;
    const t = Math.max(0, Math.min(1, (state.handle.X() - x) / SLIDER_LENGTH));
    state.handle.setPosition(JXG.COORDS_BY_USER, [x + t * SLIDER_LENGTH, trackY]);
    this.board.update();
    this.callbacks.onVariableSlid(id, object.min + t * (object.max - object.min));
  }

  private syncShapeVisibility(
    id: ObjectId,
    document: GeoDocument,
    positions: Map<ObjectId, XY>,
  ): void {
    const shape = this.shapes.get(id);
    const object = document.objects[id];
    if (!shape || !object || object.kind === "point") return;
    const pointIds = dependenciesOf(object);
    const resolved = pointIds.every((endpointId) => positions.has(endpointId));
    shape.setAttribute({
      visible: resolved && !object.hidden,
      // Circumcircles have no drag writeback of their own; leaving them
      // unfixed would let JSXGraph translate the helper points into nowhere.
      fixed: object.kind === "circumcircle" ? true : !allFree(document, pointIds),
    });
  }

  private syncLabel(
    element: JXG.GeometryElement,
    object: GeoDocument["objects"][string],
    text?: string,
  ): void {
    const name = text ?? escapeHtml(object.name ?? "");
    if (element.getName() !== name) element.setName(name);
  }

  private syncPointPosition(point: JXG.Point, x: number, y: number): void {
    if (Math.abs(point.X() - x) > 1e-10 || Math.abs(point.Y() - y) > 1e-10) {
      point.setPosition(JXG.COORDS_BY_USER, [x, y]);
    }
  }

  private syncCoordinateLabel(
    document: GeoDocument,
    object: PointObject & Presentable,
    point: JXG.Point,
    position: XY | undefined,
  ): void {
    const show = object.showCoordinates === true && position !== undefined && !object.hidden;
    let state = this.coordinateLabels.get(object.id);
    if (show && !state) {
      state = { text: this.createFloatingLabel(""), content: "" };
      this.coordinateLabels.set(object.id, state);
    }
    if (!state) return;
    if (show && position) {
      const [x, y] = coordinatesInFrame(coordinateFrameFor(document, object), position);
      const content = `\\left(${formatValue(x)},\\; ${formatValue(y)}\\right)`;
      if (state.content !== content) {
        state.text.setText(content);
        state.content = content;
      }
      this.positionCoordinateLabel(point, state.text, object);
    }
    state.text.setAttribute({ visible: show, strokeColor: boardPalette.textStroke });
  }

  // A named point's JSXGraph label floats around the marker, so the reliably
  // non-overlapping spot for coordinates is right beneath the rendered name;
  // unnamed points take the usual upper-right name spot. Always clamped.
  private positionCoordinateLabel(
    point: JXG.Point,
    label: JXG.Text,
    object: PointObject & Presentable,
  ): void {
    const [px, py] = this.toScreen([point.X(), point.Y()]);
    let position: XY = [px + 16, py - 16];
    const nameNode = object.name
      ? (point.label as unknown as { rendNode?: HTMLElement } | undefined)?.rendNode
      : undefined;
    if (nameNode) {
      const rect = nameNode.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        const host = this.container.getBoundingClientRect();
        position = [rect.left - host.left + rect.width / 2, rect.bottom - host.top + 10];
      }
    }
    label.setPosition(JXG.COORDS_BY_SCREEN, this.clampLabelToView(label, position));
  }

  private attachWriteback(point: JXG.Point, object: PointObject): void {
    if (object.role === "free") {
      const write = (event?: PointerEvent) => {
        let position: XY = [point.X(), point.Y()];
        if (event?.ctrlKey) {
          const snap = resolveSnap({
            pointer: position,
            ctrlKey: true,
            shiftKey: false,
            document: this.callbacks.getDocument(),
            tolerance: this.pixelsToUnits(SNAP_TOLERANCE_PX),
          });
          if (snap.kind !== "none") position = snap.position;
        } else if (event?.shiftKey) {
          const snap = snapToAngledLine(position, this.callbacks.getDocument(), object.id);
          if (snap.kind === "angleLine") {
            position = snap.position;
          } else {
            const start = this.dragStart.get(point)?.get(point);
            if (start) {
              const delta = snapDisplacement(start, position);
              position = [start[0] + delta[0], start[1] + delta[1]];
            }
          }
        }
        if (position[0] !== point.X() || position[1] !== point.Y()) {
          point.setPosition(JXG.COORDS_BY_USER, position);
          this.board.update();
        }
        this.callbacks.onPointDragged(object.id, position[0], position[1]);
      };
      this.attachDragLifecycle(point, write, [point]);
      return;
    }
    if (isSlidable(object)) {
      const write = () => this.constrainSlide(point, object);
      this.attachDragLifecycle(point, write);
    }
  }

  private attachShapeWriteback(
    shape: JXG.GeometryElement,
    object: GeoDocument["objects"][string],
  ): void {
    if (object.kind === "point") return;
    const pointIds = dependenciesOf(object);
    const write = (event?: PointerEvent) => {
      const document = this.callbacks.getDocument();
      const translation = event?.shiftKey ? this.bodyTranslation(shape, pointIds) : null;
      const shiftDelta = translation ? snapDisplacement([0, 0], translation) : null;
      for (const id of pointIds) {
        const point = this.points.get(id);
        const model = document.objects[id];
        if (!point || !model || model.kind !== "point") continue;
        const start = shiftDelta ? this.dragStart.get(shape)?.get(point) : undefined;
        if (shiftDelta && start) {
          const position: XY = [start[0] + shiftDelta[0], start[1] + shiftDelta[1]];
          point.setPosition(JXG.COORDS_BY_USER, position);
          if (model.role === "free") this.callbacks.onPointDragged(id, position[0], position[1]);
          else if (isSlidable(model)) this.constrainSlide(point, model);
        } else {
          if (model.role === "free") this.callbacks.onPointDragged(id, point.X(), point.Y());
          else if (isSlidable(model)) this.constrainSlide(point, model);
        }
      }
      if (shiftDelta) this.board.update();
    };
    const dragged = pointIds
      .map((pointId) => this.points.get(pointId))
      .filter((point): point is JXG.Point => point !== undefined);
    this.attachDragLifecycle(shape, write, dragged);
  }

  private attachDragLifecycle(
    element: JXG.GeometryElement,
    write: (event?: PointerEvent) => void,
    draggedPoints?: JXG.Point[],
  ): void {
    element.on("down", () => {
      if (draggedPoints) {
        // JSXGraph fans "down" out to every element under the pointer, so each
        // element keeps its own snapshot instead of sharing one global map.
        const starts = new Map<JXG.Point, XY>();
        for (const point of draggedPoints) starts.set(point, [point.X(), point.Y()]);
        this.dragStart.set(element, starts);
      }
      this.callbacks.onDragStart();
    });
    element.on("drag", write as (event: Event) => void);
    element.on("up", (event: Event) => {
      write(event as PointerEvent);
      this.dragStart.delete(element);
      this.callbacks.onDragEnd();
    });
  }

  private bodyTranslation(element: JXG.GeometryElement, pointIds: ObjectId[]): XY | null {
    const starts = this.dragStart.get(element);
    if (!starts) return null;
    let delta: XY | null = null;
    for (const id of pointIds) {
      const point = this.points.get(id);
      const start = point ? starts.get(point) : undefined;
      if (!point || !start) return null;
      const current: XY = [point.X() - start[0], point.Y() - start[1]];
      if (!delta) {
        delta = current;
      } else if (Math.abs(current[0] - delta[0]) > 1e-9 || Math.abs(current[1] - delta[1]) > 1e-9) {
        // Divergent displacements mean the pointer went up on this element while a
        // single defining point (not the shape body) was being dragged.
        return null;
      }
    }
    return delta;
  }

  private constrainSlide(point: JXG.Point, object: PointObject): void {
    const document = this.callbacks.getDocument();
    const position: XY = [point.X(), point.Y()];
    // JSXGraph has already moved the element when a resolution fails; snap it
    // back to the model's current position instead of stranding it off-curve.
    const revert = () => {
      const current = resolvePositions(document).get(object.id);
      if (current) {
        point.setPosition(JXG.COORDS_BY_USER, current);
        this.board.update();
      }
    };
    switch (object.role) {
      case "onLinear": {
        const shape = resolveShapePositions(document, object.host);
        if (!shape || shape.type === "circle") return;
        const { a, b } = shape;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 1e-12) return;
        let t = ((position[0] - a[0]) * dx + (position[1] - a[1]) * dy) / lengthSq;
        if (shape.type === "segment") t = Math.max(0, Math.min(1, t));
        else if (shape.type === "ray") t = Math.max(0, t);
        point.setPosition(JXG.COORDS_BY_USER, [a[0] + t * dx, a[1] + t * dy]);
        this.board.update();
        this.callbacks.onPointSlid(object.id, t);
        return;
      }
      case "onPolygon": {
        const vertices = polygonVerticesOf(document, object.host);
        if (!vertices || vertices.length < 2) return;
        let best: { value: number; position: XY; d: number } | null = null;
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
          const projected: XY = [a[0] + t * dx, a[1] + t * dy];
          const d = distance(position, projected);
          if (!best || d < best.d) best = { value: i + t, position: projected, d };
        }
        if (!best) return;
        point.setPosition(JXG.COORDS_BY_USER, best.position);
        this.board.update();
        this.callbacks.onPointSlid(object.id, best.value);
        return;
      }
      case "onFunction": {
        const host = document.objects[object.host];
        let x = position[0];
        if (host?.kind === "functionPlot" && host.axis) {
          const frame = axisFrame(document, host.axis);
          if (!frame) {
            revert();
            return;
          }
          const usq = frame.ux[0] ** 2 + frame.ux[1] ** 2;
          x =
            ((position[0] - frame.origin[0]) * frame.ux[0] +
              (position[1] - frame.origin[1]) * frame.ux[1]) /
            usq;
        }
        if (host?.kind === "functionPlot") {
          if (host.xMin !== undefined) x = Math.max(host.xMin, x);
          if (host.xMax !== undefined) x = Math.min(host.xMax, x);
        }
        const resolved = resolvePositions(document, new Map([[object.id, x]])).get(object.id);
        if (!resolved) {
          revert();
          return;
        }
        point.setPosition(JXG.COORDS_BY_USER, resolved);
        this.board.update();
        this.callbacks.onPointSlid(object.id, x);
        return;
      }
      case "onConic": {
        const host = document.objects[object.host];
        if (host?.kind !== "conic") return;
        const params = resolveConic(document, object.host);
        if (!params) {
          revert();
          return;
        }
        const inverted = invertConicParam(params, position);
        if (!inverted) {
          revert();
          return;
        }
        point.setPosition(
          JXG.COORDS_BY_USER,
          conicPointPosition(params, inverted.u, inverted.branch),
        );
        this.board.update();
        this.callbacks.onPointSlid(object.id, inverted.u, inverted.branch);
        return;
      }
      case "onCircle": {
        const shape = resolveShapePositions(document, object.circle);
        if (shape?.type !== "circle") return;
        const angle = Math.atan2(point.Y() - shape.center[1], point.X() - shape.center[0]);
        point.setPosition(JXG.COORDS_BY_USER, [
          shape.center[0] + shape.radius * Math.cos(angle),
          shape.center[1] + shape.radius * Math.sin(angle),
        ]);
        this.board.update();
        this.callbacks.onPointSlid(object.id, angle);
        return;
      }
      case "onParametric": {
        const t = invertParametric(document, object.host, position);
        if (t === null) {
          revert();
          return;
        }
        const resolved = resolvePositions(document, new Map([[object.id, t]])).get(object.id);
        if (!resolved) {
          revert();
          return;
        }
        point.setPosition(JXG.COORDS_BY_USER, resolved);
        this.board.update();
        this.callbacks.onPointSlid(object.id, t);
        return;
      }
      case "onLocus": {
        const u = invertLocus(document, object.host, position, 120, this.board.getBoundingBox());
        if (u === null) {
          revert();
          return;
        }
        const resolved = resolvePositions(document, new Map([[object.id, u]])).get(object.id);
        if (!resolved) {
          revert();
          return;
        }
        point.setPosition(JXG.COORDS_BY_USER, resolved);
        this.board.update();
        this.callbacks.onPointSlid(object.id, u);
        return;
      }
      default:
        return;
    }
  }

  private strokeAttributes(object: GeoObject, selected: boolean) {
    const style = object.style ?? {};
    return {
      strokeColor: selected ? SELECTED_COLOR : (style.strokeColor ?? boardPalette.shapeStroke),
      strokeWidth: (style.strokeWidth ?? 2) + (selected ? 1 : 0),
      dash: style.dash ?? 0,
      trace: object.traced ?? false,
    };
  }

  private fillAttributes(object: GeoObject, selected: boolean, defaultOpacity: number) {
    const style = object.style ?? {};
    return {
      fillColor: style.fillColor ?? POLYGON_FILL.fillColor,
      fillOpacity: selected ? Math.max(0.3, defaultOpacity) : (style.fillOpacity ?? defaultOpacity),
    };
  }

  private restylePolygon(shape: JXG.GeometryElement, object: GeoObject, selected: boolean): void {
    shape.setAttribute(this.fillAttributes(object, selected, POLYGON_FILL.fillOpacity));
    for (const border of (shape as unknown as { borders: JXG.Line[] }).borders) {
      border.setAttribute(this.strokeAttributes(object, selected));
    }
  }

  private restyle(id: ObjectId, selected: boolean): void {
    const object = this.callbacks.getDocument().objects[id];
    if (!object) return;
    const style = object.style ?? {};
    const point = this.points.get(id);
    if (point && object.kind === "point") {
      const baseColor = isDraggable(object)
        ? POINT_ATTRIBUTES.strokeColor
        : boardPalette.fixedPoint;
      const color = selected ? SELECTED_COLOR : (style.strokeColor ?? baseColor);
      point.setAttribute({
        strokeColor: color,
        fillColor: color,
        size: (style.pointSize ?? POINT_ATTRIBUTES.size) + (selected ? 1 : 0),
        trace: object.traced ?? false,
      });
      return;
    }
    const shape = this.shapes.get(id);
    if (shape) {
      if (object.kind === "polygon") {
        this.restylePolygon(shape, object, selected);
        return;
      }
      shape.setAttribute({
        ...this.strokeAttributes(object, selected),
        ...(object.kind === "circle" ? this.fillAttributes(object, false, 0) : {}),
      });
      return;
    }
    const derived = this.derivedLines.get(id);
    if (derived) {
      derived.shape.setAttribute(this.strokeAttributes(object, selected));
      return;
    }
    const transform = this.transforms.get(id);
    if (transform) {
      transform.shape.setAttribute({
        ...this.strokeAttributes(object, selected),
        ...(transform.shape.elType === "circle" ? this.fillAttributes(object, false, 0) : {}),
      });
      return;
    }
    const transformedPolygon = this.polygonTransforms.get(id);
    if (transformedPolygon) {
      this.restylePolygon(transformedPolygon.shape, object, selected);
      return;
    }
    const locus = this.loci.get(id);
    if (locus) {
      locus.curve.setAttribute(this.strokeAttributes(object, selected));
      return;
    }
    const plot = this.plots.get(id);
    if (plot) {
      for (const curve of plot.curves) curve.setAttribute(this.strokeAttributes(object, selected));
      return;
    }
    const axis = this.axisStates.get(id);
    if (axis) {
      const axisColor = selected ? SELECTED_COLOR : (style.strokeColor ?? boardPalette.axisStroke);
      for (const line of axis.lines) {
        line.setAttribute({ strokeColor: axisColor });
        const ticks = (line as unknown as { defaultTicks?: JXG.Ticks & { labels?: JXG.Text[] } })
          .defaultTicks;
        ticks?.setAttribute({ strokeColor: axisColor });
        for (const label of ticks?.labels ?? []) {
          label.setAttribute({ strokeColor: boardPalette.tickLabel });
        }
      }
      return;
    }
    const iteration = this.iterations.get(id);
    if (iteration) {
      const color = selected ? SELECTED_COLOR : (style.strokeColor ?? boardPalette.iterationPoint);
      for (const point of iteration.points) {
        point.setAttribute({ strokeColor: color, fillColor: color });
      }
      return;
    }
    const text = this.texts.get(id);
    if (text) {
      text.setAttribute({
        strokeColor: selected ? SELECTED_COLOR : (style.strokeColor ?? boardPalette.textStroke),
      });
    }
  }

  private createPreview(kind: PreviewKind): void {
    this.clearShapePreview();
    const a = this.board.create("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES });
    const b = this.board.create("point", [0, 0], { ...HIDDEN_POINT_ATTRIBUTES });
    let shape: JXG.GeometryElement;
    if (kind === "circle") {
      shape = this.board.create<JXG.Circle>("circle", [a, b], { ...previewShapeAttributes() });
    } else {
      const isRay = kind === "ray";
      const attributes = isRay
        ? { ...previewShapeAttributes(), ...RAY_ATTRIBUTES }
        : { ...previewShapeAttributes() };
      shape = this.board.create<JXG.Line>(isRay ? "line" : kind, [a, b], attributes);
    }
    this.preview = { kind, a, b, shape };
  }
}
