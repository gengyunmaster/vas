import type { BoardController } from "../board";
import type { GeoDocument, ObjectId, XY } from "../model";
import type { SnapResult } from "../snapping";

export type ToolId =
  | "select"
  | "point"
  | "segment"
  | "line"
  | "ray"
  | "circle"
  | "circumcircle"
  | "polygon"
  | "midpoint"
  | "perpendicular"
  | "parallel"
  | "angleBisector"
  | "externalBisector"
  | "circleCenter"
  | "incenter"
  | "circumcenter"
  | "centroid"
  | "orthocenter"
  | "excenter"
  | "ninePointCenter"
  | "measureLength"
  | "measureDistance"
  | "measureAngle"
  | "measureArea"
  | "addVariable"
  | "addCalculation"
  | "markCenter"
  | "markMirror"
  | "translate"
  | "rotate"
  | "scale"
  | "reflect"
  | "locus"
  | "animatePoint"
  | "toggleButton"
  | "groupAnimation"
  | "axis"
  | "numberAxis"
  | "functionPlot"
  | "parametric"
  | "ellipse"
  | "hyperbola"
  | "parabola"
  | "eccentric"
  | "parabola3"
  | "tangent"
  | "conicFeatures"
  | "iterate";

export interface PointerInfo {
  position: XY;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface ToolContext {
  readonly controller: BoardController;
  getDocument(): GeoDocument;
  getSelected(): ObjectId | null;
  commit(document: GeoDocument): void;
  setSelected(id: ObjectId | null): void;
  setStatus(message: string): void;
  snap(info: PointerInfo): SnapResult;
  openDialog(kind: "function" | "parametric" | "calculation", position?: XY): void;
}

export interface Tool {
  readonly id: string;
  activate?(): void;
  deactivate(): void;
  pointerDown(info: PointerInfo): boolean;
  pointerMove(info: PointerInfo): void;
  pointerUp(info: PointerInfo): void;
  cancel(): void;
  animationClicked?(id: ObjectId): boolean;
}
