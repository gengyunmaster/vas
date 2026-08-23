import { describe, expect, it } from "vitest";
import {
  addObject,
  addObjects,
  circle,
  circleTangentsFromPoint,
  conicFeatureLineShape,
  conicFeaturePointOf,
  conicFeaturePointPosition,
  conicOf,
  createDocument,
  freePoint,
  line,
  parabolaThroughPoints,
  pointPosition,
  removeObject,
  resolveConic,
  resolveShapePositions,
  sampleConic,
  tangentLineOf,
  tangentToConicAt,
} from "../model";

const buildEllipseDoc = () => {
  let document = createDocument();
  const f1 = freePoint(-2, 0);
  const f2 = freePoint(2, 0);
  const p = freePoint(0, 2);
  document = addObjects(document, [f1, f2, p]);
  const ellipse = conicOf("ellipse", { focus1: f1.id, focus2: f2.id, pointOnCurve: p.id });
  document = addObject(document, ellipse);
  return { document, f1, f2, p, ellipse };
};

describe("conic resolution", () => {
  it("resolves an ellipse from foci and a point", () => {
    const { document, ellipse } = buildEllipseDoc();
    const params = resolveConic(document, ellipse.id);
    if (!params) throw new Error("expected conic params");
    expect(params.type).toBe("ellipse");
    expect(params.a).toBeCloseTo(2 * Math.SQRT2);
    expect(params.b).toBeCloseTo(2);
    expect(params.center).toEqual([0, 0]);
    const samples = sampleConic(document, ellipse.id);
    if (!samples) throw new Error("expected conic samples");
    for (const [x, y] of samples[0]) {
      expect(Math.hypot(x + 2, y) + Math.hypot(x - 2, y)).toBeCloseTo(4 * Math.SQRT2);
    }
  });

  it("resolves a hyperbola from foci and a point", () => {
    let document = createDocument();
    const f1 = freePoint(-3, 0);
    const f2 = freePoint(3, 0);
    const p = freePoint(2, 0);
    document = addObjects(document, [f1, f2, p]);
    const hyperbola = conicOf("hyperbola", { focus1: f1.id, focus2: f2.id, pointOnCurve: p.id });
    document = addObject(document, hyperbola);
    const params = resolveConic(document, hyperbola.id);
    expect(params?.type).toBe("hyperbola");
    expect(params?.a).toBeCloseTo(2);
    expect(params?.b).toBeCloseTo(Math.sqrt(5));
    const samples = sampleConic(document, hyperbola.id);
    expect(samples).toHaveLength(2);
  });

  it("resolves a parabola from focus and directrix", () => {
    let document = createDocument();
    const focus = freePoint(0, 1);
    const a = freePoint(-2, -1);
    const b = freePoint(2, -1);
    document = addObjects(document, [focus, a, b]);
    const directrix = line(a.id, b.id);
    document = addObject(document, directrix);
    const parabola = conicOf("parabola", { focus: focus.id, directrix: directrix.id });
    document = addObject(document, parabola);
    const params = resolveConic(document, parabola.id);
    expect(params?.type).toBe("parabola");
    expect(params?.center).toEqual([0, 0]);
    const samples = sampleConic(document, parabola.id);
    if (!samples) throw new Error("expected conic samples");
    for (const [x, y] of samples[0]) {
      expect(y).toBeCloseTo((x * x) / 4);
    }
  });

  it("resolves an eccentric conic", () => {
    let document = createDocument();
    const focus = freePoint(1, 0);
    const a = freePoint(0, -2);
    const b = freePoint(0, 2);
    document = addObjects(document, [focus, a, b]);
    const directrix = line(a.id, b.id);
    document = addObject(document, directrix);
    const conic = conicOf("eccentric", {
      focus: focus.id,
      directrix: directrix.id,
      eccentricity: 0.5,
    });
    document = addObject(document, conic);
    const params = resolveConic(document, conic.id);
    expect(params?.type).toBe("ellipse");
    const samples = sampleConic(document, conic.id);
    if (!samples) throw new Error("expected conic samples");
    for (const [x, y] of samples[0]) {
      expect(Math.hypot(x - 1, y) / Math.abs(x)).toBeCloseTo(0.5);
    }
  });

  it("solves a parabola through three points", () => {
    const coefficients = parabolaThroughPoints([0, 1], [1, 0], [2, 3]);
    expect(coefficients).not.toBeNull();
    expect(coefficients?.a).toBeCloseTo(2);
    expect(coefficients?.b).toBeCloseTo(-3);
    expect(coefficients?.c).toBeCloseTo(1);
  });
});

describe("conic features and tangents", () => {
  it("computes feature points and feature lines", () => {
    const { document, ellipse } = buildEllipseDoc();
    const focus1 = conicFeaturePointPosition(document, ellipse.id, "focus1");
    const vertex1 = conicFeaturePointPosition(document, ellipse.id, "vertex1");
    expect(focus1).toEqual([-2, 0]);
    expect(vertex1?.[0]).toBeCloseTo(-2 * Math.SQRT2);
    const directrix = conicFeatureLineShape(document, ellipse.id, "directrix2");
    expect(directrix).not.toBeNull();
    expect(directrix?.a[0]).toBeCloseTo(4);
    const asymptote = conicFeatureLineShape(document, ellipse.id, "asymptote1");
    expect(asymptote).toBeNull();
  });

  it("creates feature point objects that resolve", () => {
    const { document: base, ellipse } = buildEllipseDoc();
    const center = conicFeaturePointOf(ellipse.id, "center");
    const document = addObject(base, center);
    expect(pointPosition(document, center.id)).toEqual([0, 0]);
    const deleted = removeObject(document, ellipse.id);
    expect(deleted.objects[center.id]).toBeUndefined();
  });

  it("computes circle tangents from an external point", () => {
    const tangents = circleTangentsFromPoint([0, 0], 1, [0, 2]);
    expect(tangents).toHaveLength(2);
    for (const touch of tangents) {
      expect(Math.hypot(touch[0], touch[1])).toBeCloseTo(1);
      expect(touch[0] * (touch[0] - 0) + touch[1] * (touch[1] - 2)).toBeCloseTo(0);
    }
    expect(circleTangentsFromPoint([0, 0], 1, [0.5, 0])).toHaveLength(0);
  });

  it("computes a tangent to an ellipse at a point", () => {
    const { document, ellipse, p } = buildEllipseDoc();
    const tangent = tangentToConicAt(document, ellipse.id, [0, 2]);
    if (!tangent) throw new Error("expected a tangent");
    const direction = [tangent.b[0] - tangent.a[0], tangent.b[1] - tangent.a[1]];
    expect(direction[1]).toBeCloseTo(0);
    expect(pointPosition(document, p.id)).toEqual([0, 2]);
  });

  it("computes a tangent to a parabola at a point", () => {
    let document = createDocument();
    const focus = freePoint(0, 1);
    const a = freePoint(-2, -1);
    const b = freePoint(2, -1);
    document = addObjects(document, [focus, a, b]);
    const directrix = line(a.id, b.id);
    document = addObject(document, directrix);
    const parabola = conicOf("parabola", { focus: focus.id, directrix: directrix.id });
    document = addObject(document, parabola);
    const atVertex = tangentToConicAt(document, parabola.id, [0, 0]);
    if (!atVertex) throw new Error("expected a tangent");
    expect(atVertex.b[1] - atVertex.a[1]).toBeCloseTo(0);
    const atSlope = tangentToConicAt(document, parabola.id, [1, 0.25]);
    if (!atSlope) throw new Error("expected a tangent");
    const direction = [atSlope.b[0] - atSlope.a[0], atSlope.b[1] - atSlope.a[1]];
    expect(direction[1] / direction[0]).toBeCloseTo(0.5);
  });

  it("resolves tangent line objects", () => {
    let document = createDocument();
    const center = freePoint(0, 0);
    const rim = freePoint(1, 0);
    const external = freePoint(0, 2);
    document = addObjects(document, [center, rim, external]);
    const circ = circle(center.id, rim.id);
    document = addObject(document, circ);
    const tangent = tangentLineOf(external.id, circ.id, 0);
    document = addObject(document, tangent);
    const shape = resolveShapePositions(document, tangent.id);
    expect(shape).not.toBeNull();
    expect(shape?.type).toBe("line");
  });

  it("computes hyperbola features with the correct focal distance", () => {
    let document = createDocument();
    const f1 = freePoint(-3, 0);
    const f2 = freePoint(3, 0);
    const p = freePoint(2, 0);
    document = addObjects(document, [f1, f2, p]);
    const hyperbola = conicOf("hyperbola", { focus1: f1.id, focus2: f2.id, pointOnCurve: p.id });
    document = addObject(document, hyperbola);
    expect(conicFeaturePointPosition(document, hyperbola.id, "focus1")).toEqual([-3, 0]);
    expect(conicFeaturePointPosition(document, hyperbola.id, "focus2")).toEqual([3, 0]);
    const directrix = conicFeatureLineShape(document, hyperbola.id, "directrix1");
    expect(directrix).not.toBeNull();
    expect(directrix?.a[0]).toBeCloseTo(-4 / 3);
    expect(directrix?.b[0]).toBeCloseTo(-4 / 3);
    const asymptote = conicFeatureLineShape(document, hyperbola.id, "asymptote1");
    if (!asymptote) throw new Error("expected an asymptote");
    const slope = (asymptote.b[1] - asymptote.a[1]) / (asymptote.b[0] - asymptote.a[0]);
    expect(Math.abs(slope)).toBeCloseTo(Math.sqrt(5) / 2);
  });

  it("labels parabola features semantically", () => {
    let document = createDocument();
    const focus = freePoint(0, 1);
    const a = freePoint(-2, -1);
    const b = freePoint(2, -1);
    document = addObjects(document, [focus, a, b]);
    const directrixLine = line(a.id, b.id);
    document = addObject(document, directrixLine);
    const parabola = conicOf("parabola", { focus: focus.id, directrix: directrixLine.id });
    document = addObject(document, parabola);
    expect(conicFeaturePointPosition(document, parabola.id, "focus1")).toEqual([0, 1]);
    expect(conicFeaturePointPosition(document, parabola.id, "center")).toEqual([0, 0]);
    expect(conicFeaturePointPosition(document, parabola.id, "focus2")).toBeNull();
    expect(conicFeaturePointPosition(document, parabola.id, "vertex1")).toBeNull();
    expect(conicFeaturePointPosition(document, parabola.id, "vertex2")).toBeNull();
    const directrix = conicFeatureLineShape(document, parabola.id, "directrix1");
    expect(directrix).not.toBeNull();
    expect(directrix?.a[1]).toBeCloseTo(-1);
    expect(directrix?.b[1]).toBeCloseTo(-1);
    expect(conicFeatureLineShape(document, parabola.id, "directrix2")).toBeNull();
  });

  it("rejects tangents at points not on the conic", () => {
    const { document, ellipse } = buildEllipseDoc();
    expect(tangentToConicAt(document, ellipse.id, [0, 0])).toBeNull();
    expect(tangentToConicAt(document, ellipse.id, [10, 10])).toBeNull();
    expect(tangentToConicAt(document, ellipse.id, [0, 2])).not.toBeNull();
  });
});
