import { beforeAll, describe, expect, it } from "vitest";
import type { FunctionPlot, ParametricCurve } from "../model";
import {
  addObject,
  addObjects,
  axisFrame,
  axisSystemOf,
  coordinateFrameFor,
  coordinatesInFrame,
  createDocument,
  curveAxisIntersectionNear,
  ensureComputeEngine,
  evaluateLatex,
  freePoint,
  functionPlotOf,
  graphIntersectionNear,
  graphValueAt,
  intersectionOf,
  isLatexValid,
  numberAxisOf,
  parametricCurveOf,
  parametricIntersectionNear,
  parseDocument,
  pointOnFunction,
  pointOnParametric,
  pointPosition,
  removeObject,
  sampleFunction,
  sampleParametric,
  serializeDocument,
  updatePlotExpressions,
} from "../model";

beforeAll(async () => {
  await ensureComputeEngine();
});

describe("latex evaluation", () => {
  it("evaluates latex expressions numerically", () => {
    expect(evaluateLatex("\\frac{1}{2}x^2", { x: 2 })).toBeCloseTo(2);
    expect(evaluateLatex("\\sin(x)", { x: Math.PI / 2 })).toBeCloseTo(1);
    expect(evaluateLatex("\\sqrt{x}+\\pi", { x: 4 })).toBeCloseTo(2 + Math.PI);
    expect(evaluateLatex("x^2+1", { x: "not-a-number" as unknown as number })).toBeNull();
  });

  it("validates latex", () => {
    expect(isLatexValid("x^2")).toBe(true);
    expect(isLatexValid("\\frac{1}{")).toBe(false);
  });
});

describe("axis frame", () => {
  it("resolves origin and unit vectors", () => {
    let document = createDocument();
    const o = freePoint(1, 1);
    const u = freePoint(3, 1);
    document = addObjects(document, [o, u]);
    const axis = axisSystemOf(o.id, u.id);
    document = addObject(document, axis);
    const frame = axisFrame(document, axis.id);
    expect(frame).toEqual({ origin: [1, 1], ux: [2, 0], uy: [0, 2] });
  });
});

describe("plot sampling", () => {
  const VIEW = [-8, 5, 8, -5] as const;

  it("samples a function plot in board coordinates", () => {
    let document = createDocument();
    const plot = functionPlotOf("x^2");
    document = addObject(document, plot);
    const fragments = sampleFunction(document, plot.id, VIEW);
    if (!fragments) throw new Error("expected sampled fragments");
    const points = fragments[0];
    expect(points[0]).toEqual([-8, 64]);
    expect(points[120][1]).toBeCloseTo(0);
    expect(points[points.length - 1]).toEqual([8, 64]);
  });

  it("samples a function plot attached to an axis system", () => {
    let document = createDocument();
    const o = freePoint(1, 1);
    const u = freePoint(3, 1);
    document = addObjects(document, [o, u]);
    const axis = axisSystemOf(o.id, u.id);
    document = addObject(document, axis);
    const plot = functionPlotOf("x", axis.id);
    document = addObject(document, plot);
    const fragments = sampleFunction(document, plot.id, VIEW);
    if (!fragments) throw new Error("expected sampled fragments");
    for (const fragment of fragments) {
      for (const [x, y] of fragment) {
        expect(y).toBeCloseTo(x);
      }
    }
  });

  it("samples a parametric circle", () => {
    let document = createDocument();
    const curve = parametricCurveOf("\\cos(t)", "\\sin(t)", 0, 2 * Math.PI);
    document = addObject(document, curve);
    const fragments = sampleParametric(document, curve.id);
    if (!fragments) throw new Error("expected sampled fragments");
    const points = fragments[0];
    expect(points[0][0]).toBeCloseTo(1);
    expect(points[0][1]).toBeCloseTo(0);
    for (const [x, y] of points) {
      expect(Math.hypot(x, y)).toBeCloseTo(1);
    }
  });

  it("rebinds a function plot between axis systems and board coordinates", () => {
    let document = createDocument();
    const o1 = freePoint(0, 0);
    const u1 = freePoint(1, 0);
    const o2 = freePoint(5, 5);
    const u2 = freePoint(5, 7);
    const axis1 = axisSystemOf(o1.id, u1.id);
    const axis2 = axisSystemOf(o2.id, u2.id);
    const plot = functionPlotOf("x");
    document = addObjects(document, [o1, u1, o2, u2, axis1, axis2, plot]);

    document = updatePlotExpressions(document, plot.id, { axis: axis1.id });
    expect((document.objects[plot.id] as FunctionPlot).axis).toBe(axis1.id);

    document = updatePlotExpressions(document, plot.id, { axis: axis2.id });
    expect((document.objects[plot.id] as FunctionPlot).axis).toBe(axis2.id);
    const fragments = sampleFunction(document, plot.id, VIEW);
    if (!fragments) throw new Error("expected sampled fragments");
    for (const fragment of fragments) {
      for (const [x, y] of fragment) {
        expect(y).toBeCloseTo(10 - x);
      }
    }

    document = updatePlotExpressions(document, plot.id, { axis: null });
    expect((document.objects[plot.id] as FunctionPlot).axis).toBeUndefined();

    const rejected = updatePlotExpressions(document, plot.id, { axis: o1.id });
    expect(rejected).toBe(document);
  });

  it("rebinds a parametric curve between axis systems and board coordinates", () => {
    let document = createDocument();
    const o1 = freePoint(0, 0);
    const u1 = freePoint(1, 0);
    const o2 = freePoint(5, 5);
    const u2 = freePoint(5, 7);
    const axis1 = axisSystemOf(o1.id, u1.id);
    const axis2 = axisSystemOf(o2.id, u2.id);
    const curve = parametricCurveOf("t", "0", 0, 2);
    document = addObjects(document, [o1, u1, o2, u2, axis1, axis2, curve]);

    document = updatePlotExpressions(document, curve.id, { axis: axis1.id });
    expect((document.objects[curve.id] as ParametricCurve).axis).toBe(axis1.id);
    let fragments = sampleParametric(document, curve.id);
    if (!fragments) throw new Error("expected sampled fragments");
    expect(fragments[0][0]).toEqual([0, 0]);
    let tail = fragments[0][fragments[0].length - 1];
    expect(tail[0]).toBeCloseTo(2);
    expect(tail[1]).toBeCloseTo(0);

    document = updatePlotExpressions(document, curve.id, { axis: axis2.id });
    fragments = sampleParametric(document, curve.id);
    if (!fragments) throw new Error("expected sampled fragments");
    expect(fragments[0][0][0]).toBeCloseTo(5);
    expect(fragments[0][0][1]).toBeCloseTo(5);
    tail = fragments[0][fragments[0].length - 1];
    expect(tail[0]).toBeCloseTo(5);
    expect(tail[1]).toBeCloseTo(9);

    document = updatePlotExpressions(document, curve.id, { axis: null });
    expect((document.objects[curve.id] as ParametricCurve).axis).toBeUndefined();

    const rejected = updatePlotExpressions(document, curve.id, { axis: o1.id });
    expect(rejected).toBe(document);
  });

  it("resolves on-parametric points in the host curve's axis frame", () => {
    let document = createDocument();
    const o = freePoint(5, 5);
    const u = freePoint(5, 7);
    const axis = axisSystemOf(o.id, u.id);
    const curve = parametricCurveOf("t", "1", 0, 2, axis.id);
    document = addObjects(document, [o, u, axis, curve]);
    const point = pointOnParametric(curve.id, 1);
    document = addObject(document, point);
    expect(pointPosition(document, point.id)).toEqual([3, 7]);
    const frame = coordinateFrameFor(document, point);
    expect(frame).not.toBeNull();
    expect(coordinatesInFrame(frame, [3, 7])).toEqual([1, 1]);
  });

  it("cascade-deletes a bound parametric curve with its axes and round-trips axis", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(1, 0);
    const axis = axisSystemOf(o.id, u.id);
    const curve = parametricCurveOf("t", "t", 0, 1, axis.id);
    document = addObjects(document, [o, u, axis, curve]);
    const restored = parseDocument(serializeDocument(document));
    expect((restored.objects[curve.id] as ParametricCurve).axis).toBe(axis.id);
    const withoutAxes = removeObject(document, axis.id);
    expect(withoutAxes.objects[curve.id]).toBeUndefined();
  });
});

describe("function plot ranges", () => {
  const VIEW = [-8, 5, 8, -5] as const;

  it("samples only inside the x range and evaluates null outside", () => {
    let document = createDocument();
    const plot = functionPlotOf("x^2", undefined, -1, 2);
    document = addObject(document, plot);
    const fragments = sampleFunction(document, plot.id, VIEW);
    if (!fragments) throw new Error("expected sampled fragments");
    const points = fragments[0];
    expect(points[0][0]).toBeCloseTo(-1);
    expect(points[0][1]).toBeCloseTo(1);
    expect(points[points.length - 1][0]).toBeCloseTo(2);
    expect(points[points.length - 1][1]).toBeCloseTo(4);
    expect(graphValueAt(document, plot.id, 0)).toBeCloseTo(0);
    expect(graphValueAt(document, plot.id, 3)).toBeNull();
    expect(graphValueAt(document, plot.id, -2)).toBeNull();
  });

  it("returns null when the range lies outside the viewport", () => {
    let document = createDocument();
    const plot = functionPlotOf("x", undefined, 100, 200);
    document = addObject(document, plot);
    expect(sampleFunction(document, plot.id, VIEW)).toBeNull();
  });

  it("clamps a bound plot's range in axis coordinates", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(2, 0);
    const axis = axisSystemOf(o.id, u.id);
    const plot = functionPlotOf("x", axis.id, 0, 3);
    document = addObjects(document, [o, u, axis, plot]);
    const fragments = sampleFunction(document, plot.id, VIEW);
    if (!fragments) throw new Error("expected sampled fragments");
    const points = fragments[0];
    expect(points[0][0]).toBeCloseTo(0);
    expect(points[0][1]).toBeCloseTo(0);
    expect(points[points.length - 1][0]).toBeCloseTo(6);
    expect(points[points.length - 1][1]).toBeCloseTo(6);
    expect(graphValueAt(document, plot.id, 8)).toBeNull();
    expect(graphValueAt(document, plot.id, -1)).toBeNull();
    expect(graphValueAt(document, plot.id, 2)).toBeCloseTo(2);
  });

  it("hides on-function points outside the range and restores them when cleared", () => {
    let document = createDocument();
    const plot = functionPlotOf("x", undefined, 0, 1);
    const inside = pointOnFunction(plot.id, 0.5);
    const outside = pointOnFunction(plot.id, 2);
    document = addObjects(document, [plot, inside, outside]);
    expect(pointPosition(document, inside.id)).toEqual([0.5, 0.5]);
    expect(pointPosition(document, outside.id)).toBeNull();
    document = updatePlotExpressions(document, plot.id, { xMin: null, xMax: null });
    expect(pointPosition(document, outside.id)).toEqual([2, 2]);
  });

  it("validates and clears ranges via updatePlotExpressions", () => {
    let document = createDocument();
    const plot = functionPlotOf("x");
    document = addObject(document, plot);
    document = updatePlotExpressions(document, plot.id, { xMin: 2, xMax: 3 });
    let stored = document.objects[plot.id] as FunctionPlot;
    expect(stored.xMin).toBe(2);
    expect(stored.xMax).toBe(3);
    expect(updatePlotExpressions(document, plot.id, { xMin: 2 })).toBe(document);
    expect(updatePlotExpressions(document, plot.id, { xMin: 5 })).toBe(document);
    document = updatePlotExpressions(document, plot.id, { xMax: null });
    stored = document.objects[plot.id] as FunctionPlot;
    expect(stored.xMin).toBe(2);
    expect(stored.xMax).toBeUndefined();
  });

  it("round-trips ranges through serialization", () => {
    let document = createDocument();
    const plot = functionPlotOf("x^2", undefined, -1, 2);
    document = addObject(document, plot);
    const restored = parseDocument(serializeDocument(document));
    const stored = restored.objects[plot.id] as FunctionPlot;
    expect(stored.xMin).toBe(-1);
    expect(stored.xMax).toBe(2);
  });

  it("drops same-axes intersections outside either plot's range", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(1, 0);
    const axis = axisSystemOf(o.id, u.id);
    const f = functionPlotOf("x", axis.id);
    const g = functionPlotOf("0", axis.id);
    document = addObjects(document, [o, u, axis, f, g]);
    expect(graphIntersectionNear(document, f.id, g.id, [0.2, 0])).not.toBeNull();
    document = updatePlotExpressions(document, f.id, { xMin: 1 });
    expect(graphIntersectionNear(document, f.id, g.id, [0.2, 0])).toBeNull();
    const crossing = intersectionOf(f.id, g.id, [0.2, 0]);
    const withPoint = addObject(document, crossing);
    expect(pointPosition(withPoint, crossing.id)).toBeNull();
  });
});

describe("serialization", () => {
  it("round-trips the graphing kinds", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(1, 0);
    document = addObjects(document, [o, u]);
    const axis = axisSystemOf(o.id, u.id);
    const numberAxis = numberAxisOf(o.id, u.id);
    const plot = functionPlotOf("x^2", axis.id);
    const curve = parametricCurveOf("\\cos(t)", "\\sin(t)", 0, 6.28);
    document = addObjects(document, [axis, numberAxis, plot, curve]);
    const restored = parseDocument(serializeDocument(document));
    expect(Object.keys(restored.objects)).toHaveLength(Object.keys(document.objects).length);
    expect(restored.objects[plot.id].kind).toBe("functionPlot");
    expect(restored.objects[curve.id].kind).toBe("parametricCurve");
  });
});

describe("curve intersections", () => {
  it("intersects two parametric curves and tracks edits live", () => {
    let document = createDocument();
    const circle = parametricCurveOf("\\cos(t)", "\\sin(t)", 0, 2 * Math.PI);
    const line = parametricCurveOf("t", "0.5", -2, 2);
    document = addObjects(document, [circle, line]);
    const near: [number, number] = [0.9, 0.5];
    const hit = parametricIntersectionNear(document, circle.id, line.id, near);
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeCloseTo(Math.sqrt(0.75), 4);
    expect(hit?.[1]).toBeCloseTo(0.5, 4);
    const point = intersectionOf(circle.id, line.id, near);
    document = addObject(document, point);
    expect(pointPosition(document, point.id)?.[0]).toBeCloseTo(Math.sqrt(0.75), 4);
    document = updatePlotExpressions(document, line.id, { yLatex: "0" });
    const moved = pointPosition(document, point.id);
    expect(moved?.[0]).toBeCloseTo(1, 4);
    expect(moved?.[1]).toBeCloseTo(0, 4);
  });

  it("returns null for parametric curves that do not meet", () => {
    let document = createDocument();
    const circle = parametricCurveOf("\\cos(t)", "\\sin(t)", 0, 2 * Math.PI);
    const line = parametricCurveOf("t", "5", -2, 2);
    document = addObjects(document, [circle, line]);
    expect(parametricIntersectionNear(document, circle.id, line.id, [0, 5])).toBeNull();
  });

  it("intersects a parametric curve with a function plot", () => {
    let document = createDocument();
    const curve = parametricCurveOf("t", "t", -2, 2);
    const plot = functionPlotOf("x^2");
    document = addObjects(document, [curve, plot]);
    const hit = parametricIntersectionNear(document, curve.id, plot.id, [1.1, 1.05]);
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeCloseTo(1, 4);
    expect(hit?.[1]).toBeCloseTo(1, 4);
  });

  it("intersects a parametric curve with a plot bound to translated axes", () => {
    let document = createDocument();
    const o = freePoint(1, 1);
    const u = freePoint(2, 1);
    const axis = axisSystemOf(o.id, u.id);
    const plot = functionPlotOf("x^2", axis.id);
    const curve = parametricCurveOf("t", "2t", -3, 3);
    document = addObjects(document, [o, u, axis, plot, curve]);
    const hit = parametricIntersectionNear(document, curve.id, plot.id, [0.6, 1.2]);
    expect(hit).not.toBeNull();
    expect(hit?.[0]).toBeCloseTo(2 - Math.SQRT2, 4);
    expect(hit?.[1]).toBeCloseTo(4 - 2 * Math.SQRT2, 4);
  });

  it("intersects a bound plot with its own rotated axes system", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(0, 1);
    const axis = axisSystemOf(o.id, u.id);
    const plot = functionPlotOf("x^2-1", axis.id);
    document = addObjects(document, [o, u, axis, plot]);
    const xCrossing = curveAxisIntersectionNear(document, plot.id, axis.id, [0.1, 1]);
    expect(xCrossing).not.toBeNull();
    expect(xCrossing?.[0]).toBeCloseTo(0, 4);
    expect(xCrossing?.[1]).toBeCloseTo(1, 4);
    const yCrossing = curveAxisIntersectionNear(document, plot.id, axis.id, [0.9, 0.1]);
    expect(yCrossing).not.toBeNull();
    expect(yCrossing?.[0]).toBeCloseTo(1, 4);
    expect(yCrossing?.[1]).toBeCloseTo(0, 4);
  });

  it("intersects an unbound plot with an axes system", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(1, 0);
    const axis = axisSystemOf(o.id, u.id);
    const plot = functionPlotOf("x-1");
    document = addObjects(document, [o, u, axis, plot]);
    const xCrossing = curveAxisIntersectionNear(document, plot.id, axis.id, [0.9, 0.2]);
    expect(xCrossing).not.toBeNull();
    expect(xCrossing?.[0]).toBeCloseTo(1, 4);
    expect(xCrossing?.[1]).toBeCloseTo(0, 4);
    const yCrossing = curveAxisIntersectionNear(document, plot.id, axis.id, [0.1, -0.9]);
    expect(yCrossing).not.toBeNull();
    expect(yCrossing?.[0]).toBeCloseTo(0, 4);
    expect(yCrossing?.[1]).toBeCloseTo(-1, 4);
  });

  it("respects the plot range when crossing axes", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(1, 0);
    const axis = axisSystemOf(o.id, u.id);
    const plot = functionPlotOf("x-1", undefined, 2, 5);
    document = addObjects(document, [o, u, axis, plot]);
    expect(curveAxisIntersectionNear(document, plot.id, axis.id, [1, 0.1])).toBeNull();
    expect(curveAxisIntersectionNear(document, plot.id, axis.id, [0.1, -1])).toBeNull();
  });

  it("intersects a parametric curve with an axes system", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(1, 0);
    const axis = axisSystemOf(o.id, u.id);
    const circle = parametricCurveOf("\\cos(t)", "\\sin(t)", 0, 2 * Math.PI);
    document = addObjects(document, [o, u, axis, circle]);
    const xCrossing = curveAxisIntersectionNear(document, circle.id, axis.id, [1, 0.1]);
    expect(xCrossing).not.toBeNull();
    expect(xCrossing?.[0]).toBeCloseTo(1, 4);
    expect(xCrossing?.[1]).toBeCloseTo(0, 4);
    const yCrossing = curveAxisIntersectionNear(document, circle.id, axis.id, [-0.1, -1]);
    expect(yCrossing).not.toBeNull();
    expect(yCrossing?.[0]).toBeCloseTo(0, 4);
    expect(yCrossing?.[1]).toBeCloseTo(-1, 4);
  });

  it("resolves, cascade-deletes and round-trips curve-axis intersection points", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const u = freePoint(1, 0);
    const axis = axisSystemOf(o.id, u.id);
    const circle = parametricCurveOf("\\cos(t)", "\\sin(t)", 0, 2 * Math.PI);
    document = addObjects(document, [o, u, axis, circle]);
    const point = intersectionOf(circle.id, axis.id, [1, 0.1]);
    document = addObject(document, point);
    const position = pointPosition(document, point.id);
    expect(position).not.toBeNull();
    expect(position?.[0]).toBeCloseTo(1, 4);
    const restored = parseDocument(serializeDocument(document));
    expect(pointPosition(restored, point.id)).not.toBeNull();
    const withoutAxes = removeObject(document, axis.id);
    expect(withoutAxes.objects[point.id]).toBeUndefined();
  });
});
