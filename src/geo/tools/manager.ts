import { debugLog } from "../debug";
import type { ObjectId } from "../model";
import { createAngleBisectorTool } from "./angleBisector";
import { createAnimationTool } from "./animation";
import { createAxisTool } from "./axis";
import { createConicTool } from "./conic";
import type { CustomToolDef } from "./customTools";
import { createCustomTool } from "./customTools";
import { createPlotTool } from "./functionPlot";
import { createIterationTool } from "./iterate";
import { createLineConstructionTool } from "./lineConstruction";
import { createLocusTool } from "./locus";
import { createMeasureTool } from "./measure";
import { createMidpointTool } from "./midpoint";
import { PointTool } from "./point";
import { createPolygonTool } from "./polygon";
import { SelectTool } from "./select";
import { createTransformTool } from "./transform";
import {
  createCircleCenterTool,
  createCircumcircleTool,
  createTriangleCenterTool,
} from "./triangle";
import { createTwoPointTool } from "./twoPoint";
import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

export class ToolManager {
  private readonly tools: Record<ToolId, Tool>;
  private readonly context: ToolContext;
  private active: Tool;

  constructor(context: ToolContext) {
    this.context = context;
    this.tools = {
      select: new SelectTool(context),
      point: new PointTool(context),
      segment: createTwoPointTool("segment", context),
      line: createTwoPointTool("line", context),
      ray: createTwoPointTool("ray", context),
      circle: createTwoPointTool("circle", context),
      circumcircle: createCircumcircleTool(context),
      polygon: createPolygonTool(context),
      midpoint: createMidpointTool(context),
      perpendicular: createLineConstructionTool("perpendicular", context),
      parallel: createLineConstructionTool("parallel", context),
      angleBisector: createAngleBisectorTool(context),
      externalBisector: createAngleBisectorTool(context, "externalBisector"),
      circleCenter: createCircleCenterTool(context),
      incenter: createTriangleCenterTool("incenter", context),
      circumcenter: createTriangleCenterTool("circumcenter", context),
      centroid: createTriangleCenterTool("centroid", context),
      orthocenter: createTriangleCenterTool("orthocenter", context),
      excenter: createTriangleCenterTool("excenter", context),
      ninePointCenter: createTriangleCenterTool("ninePointCenter", context),
      measureLength: createMeasureTool("measureLength", context),
      measureDistance: createMeasureTool("measureDistance", context),
      measureAngle: createMeasureTool("measureAngle", context),
      measureArea: createMeasureTool("measureArea", context),
      addVariable: createMeasureTool("addVariable", context),
      addCalculation: createMeasureTool("addCalculation", context),
      markCenter: createTransformTool("markCenter", context),
      markMirror: createTransformTool("markMirror", context),
      translate: createTransformTool("translate", context),
      rotate: createTransformTool("rotate", context),
      scale: createTransformTool("scale", context),
      reflect: createTransformTool("reflect", context),
      locus: createLocusTool(context),
      animatePoint: createAnimationTool("animatePoint", context),
      toggleButton: createAnimationTool("toggleButton", context),
      groupAnimation: createAnimationTool("groupAnimation", context),
      axis: createAxisTool("axis", context),
      numberAxis: createAxisTool("numberAxis", context),
      functionPlot: createPlotTool("functionPlot", context),
      parametric: createPlotTool("parametric", context),
      ellipse: createConicTool("ellipse", context),
      hyperbola: createConicTool("hyperbola", context),
      parabola: createConicTool("parabola", context),
      eccentric: createConicTool("eccentric", context),
      parabola3: createConicTool("parabola3", context),
      tangent: createConicTool("tangent", context),
      conicFeatures: createConicTool("conicFeatures", context),
      iterate: createIterationTool(context),
    };
    this.active = this.tools.select;
  }

  get activeId(): string {
    return this.active.id;
  }

  setActive(id: ToolId, force = false): void {
    if (this.active.id === id && !force) return;
    this.active.deactivate();
    this.active = this.tools[id];
    this.active.activate?.();
  }

  activateCustom(def: CustomToolDef): void {
    // Re-recording under the same name, or re-clicking the active button,
    // swaps in a fresh tool instance.
    this.active.deactivate();
    this.active = createCustomTool(def, this.context);
    this.active.activate?.();
  }

  pointerDown(info: PointerInfo): boolean {
    const consumed = this.active.pointerDown(info);
    debugLog(`tool ${this.active.id} consumed=${consumed}`);
    return consumed;
  }

  pointerMove(info: PointerInfo): void {
    this.active.pointerMove(info);
  }

  pointerUp(info: PointerInfo): void {
    this.active.pointerUp(info);
  }

  cancel(): void {
    this.active.cancel();
  }

  animationClicked(id: ObjectId): boolean {
    return this.active.animationClicked?.(id) ?? false;
  }
}
