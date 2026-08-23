import type { ToolId } from "../tools";

export interface ToolItem {
  id: ToolId;
  label: string;
}

export interface ToolCategory {
  id: string;
  label: string;
  tools: ToolItem[];
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "points",
    label: "Points",
    tools: [
      { id: "point", label: "Point" },
      { id: "midpoint", label: "Midpoint" },
      { id: "circleCenter", label: "Center" },
    ],
  },
  {
    id: "lines",
    label: "Lines",
    tools: [
      { id: "segment", label: "Segment" },
      { id: "line", label: "Line" },
      { id: "ray", label: "Ray" },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    tools: [
      { id: "circle", label: "Circle" },
      { id: "circumcircle", label: "Circle 3pt" },
      { id: "polygon", label: "Polygon" },
    ],
  },
  {
    id: "construct",
    label: "Construct",
    tools: [
      { id: "perpendicular", label: "Perpendicular" },
      { id: "parallel", label: "Parallel" },
      { id: "angleBisector", label: "Bisector" },
      { id: "externalBisector", label: "Ext Bisector" },
      { id: "locus", label: "Locus" },
    ],
  },
  {
    id: "triangle",
    label: "Triangle",
    tools: [
      { id: "incenter", label: "Incenter" },
      { id: "circumcenter", label: "Circumcenter" },
      { id: "centroid", label: "Centroid" },
      { id: "orthocenter", label: "Orthocenter" },
      { id: "excenter", label: "Excenter" },
      { id: "ninePointCenter", label: "Nine-Point" },
    ],
  },
  {
    id: "measure",
    label: "Measure",
    tools: [
      { id: "measureLength", label: "Length" },
      { id: "measureDistance", label: "Distance" },
      { id: "measureAngle", label: "Angle" },
      { id: "measureArea", label: "Area" },
      { id: "addVariable", label: "Variable" },
      { id: "addCalculation", label: "Calculate" },
    ],
  },
  {
    id: "transform",
    label: "Transform",
    tools: [
      { id: "markCenter", label: "Mark Center" },
      { id: "markMirror", label: "Mark Mirror" },
      { id: "translate", label: "Translate" },
      { id: "rotate", label: "Rotate" },
      { id: "scale", label: "Scale" },
      { id: "reflect", label: "Reflect" },
      { id: "iterate", label: "Iterate" },
    ],
  },
  {
    id: "functions",
    label: "Functions",
    tools: [
      { id: "axis", label: "Axes" },
      { id: "numberAxis", label: "Number Axis" },
      { id: "functionPlot", label: "Function" },
      { id: "parametric", label: "Parametric" },
    ],
  },
  {
    id: "conics",
    label: "Conics",
    tools: [
      { id: "ellipse", label: "Ellipse" },
      { id: "hyperbola", label: "Hyperbola" },
      { id: "parabola", label: "Parabola" },
      { id: "eccentric", label: "Eccentric" },
      { id: "parabola3", label: "Parabola 3pt" },
      { id: "tangent", label: "Tangent" },
      { id: "conicFeatures", label: "Features" },
    ],
  },
  {
    id: "animate",
    label: "Animate",
    tools: [
      { id: "animatePoint", label: "Animate" },
      { id: "toggleButton", label: "Toggle" },
      { id: "groupAnimation", label: "Group" },
    ],
  },
];
