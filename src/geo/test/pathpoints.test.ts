import { beforeAll, describe, expect, it } from "vitest";
import {
  addObject,
  addObjects,
  conicOf,
  createDocument,
  ensureComputeEngine,
  freePoint,
  functionPlotOf,
  invertConicParam,
  invertLocus,
  invertParametric,
  line,
  locusOf,
  midpointOf,
  parametricCurveOf,
  parseDocument,
  perpendicularLine,
  pointOnConic,
  pointOnFunction,
  pointOnLinear,
  pointOnLocus,
  pointOnParametric,
  pointOnPolygon,
  polygon,
  polygonVerticesOf,
  resolveConic,
  resolvePositions,
  segment,
  serializeDocument,
  slidePoint,
  threePointParabolaOf,
  transformedShape,
} from "../model";

beforeAll(async () => {
  await ensureComputeEngine();
});

describe("onLinear points", () => {
  it("resolves and clamps per host type", () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    document = addObjects(document, [a, b]);
    const seg = segment(a.id, b.id);
    const ln = line(a.id, b.id);
    document = addObjects(document, [seg, ln]);
    const onSeg = pointOnLinear(seg.id, 0.25);
    const onLine = pointOnLinear(ln.id, 2);
    document = addObjects(document, [onSeg, onLine]);

    const positions = resolvePositions(document);
    expect(positions.get(onSeg.id)).toEqual([1, 0]);
    expect(positions.get(onLine.id)).toEqual([8, 0]);

    document = slidePoint(document, onSeg.id, 3);
    expect(resolvePositions(document).get(onSeg.id)).toEqual([4, 0]);
    document = slidePoint(document, onLine.id, 5);
    expect(resolvePositions(document).get(onLine.id)).toEqual([20, 0]);
  });

  it("hosts on derived lines", () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    const through = freePoint(2, 3);
    document = addObjects(document, [a, b, through]);
    const seg = segment(a.id, b.id);
    document = addObject(document, seg);
    const perp = perpendicularLine(through.id, seg.id);
    document = addObject(document, perp);
    const point = pointOnLinear(perp.id, 0.25);
    document = addObject(document, point);
    expect(resolvePositions(document).get(point.id)).toEqual([2, 4]);
  });
});

describe("onPolygon points", () => {
  const buildPolygonDoc = () => {
    let document = createDocument();
    const p1 = freePoint(0, 0);
    const p2 = freePoint(4, 0);
    const p3 = freePoint(4, 4);
    document = addObjects(document, [p1, p2, p3]);
    const poly = polygon([p1.id, p2.id, p3.id]);
    document = addObject(document, poly);
    return { document, poly };
  };

  it("resolves positions on edges and crosses edges when sliding", () => {
    let { document, poly } = buildPolygonDoc();
    const point = pointOnPolygon(poly.id, 0, 0.5);
    document = addObject(document, point);
    expect(resolvePositions(document).get(point.id)).toEqual([2, 0]);
    document = slidePoint(document, point.id, 1.5);
    expect(resolvePositions(document).get(point.id)).toEqual([4, 2]);
  });

  it("hosts on transformed polygons", () => {
    let { document, poly } = buildPolygonDoc();
    const o = freePoint(0, 0);
    document = addObject(document, o);
    const moved = transformedShape(poly.id, { type: "scale", center: o.id, factor: 2 });
    document = addObject(document, moved);
    const point = pointOnPolygon(moved.id, 0, 0.5);
    document = addObject(document, point);
    expect(polygonVerticesOf(document, moved.id)).toEqual([
      [0, 0],
      [8, 0],
      [8, 8],
    ]);
    expect(resolvePositions(document).get(point.id)).toEqual([4, 0]);
  });
});

describe("onFunction points", () => {
  it("resolves on function plots and three-point parabolas", () => {
    let document = createDocument();
    const plot = functionPlotOf("x^2");
    document = addObject(document, plot);
    const onPlot = pointOnFunction(plot.id, 2);
    const p1 = freePoint(0, 1);
    const p2 = freePoint(1, 0);
    const p3 = freePoint(2, 3);
    document = addObjects(document, [onPlot, p1, p2, p3]);
    const parabola = threePointParabolaOf(p1.id, p2.id, p3.id);
    document = addObject(document, parabola);
    const onParabola = pointOnFunction(parabola.id, 3);
    document = addObject(document, onParabola);

    const positions = resolvePositions(document);
    expect(positions.get(onPlot.id)).toEqual([2, 4]);
    expect(positions.get(onParabola.id)?.[1]).toBeCloseTo(10);

    document = slidePoint(document, onPlot.id, 3);
    expect(resolvePositions(document).get(onPlot.id)).toEqual([3, 9]);
  });
});

describe("onConic points", () => {
  it("resolves on ellipses and inverts parameters", () => {
    let document = createDocument();
    const f1 = freePoint(-2, 0);
    const f2 = freePoint(2, 0);
    const p = freePoint(0, 2);
    document = addObjects(document, [f1, f2, p]);
    const ellipse = conicOf("ellipse", { focus1: f1.id, focus2: f2.id, pointOnCurve: p.id });
    document = addObject(document, ellipse);
    const point = pointOnConic(ellipse.id, Math.PI / 2, 1);
    document = addObject(document, point);

    const params = resolveConic(document, ellipse.id);
    if (!params) throw new Error("expected conic params");
    const positions = resolvePositions(document);
    expect(positions.get(point.id)?.[1]).toBeCloseTo(params.b);

    const inverted = invertConicParam(params, [params.a, 0]);
    expect(inverted?.u).toBeCloseTo(0);

    document = slidePoint(document, point.id, 0);
    expect(resolvePositions(document).get(point.id)?.[0]).toBeCloseTo(params.a);
  });
});

describe("onParametric points", () => {
  it("resolves and inverts on a parametric circle", () => {
    let document = createDocument();
    const curve = parametricCurveOf("\\cos(t)", "\\sin(t)", 0, 2 * Math.PI);
    document = addObject(document, curve);
    const point = pointOnParametric(curve.id, Math.PI / 2);
    document = addObject(document, point);

    const positions = resolvePositions(document);
    expect(positions.get(point.id)?.[0]).toBeCloseTo(0);
    expect(positions.get(point.id)?.[1]).toBeCloseTo(1);

    const inverted = invertParametric(document, curve.id, [0, 1]);
    if (inverted === null) throw new Error("expected an inverted parameter");
    expect(inverted).toBeCloseTo(Math.PI / 2, 2);

    document = slidePoint(document, point.id, 0);
    expect(resolvePositions(document).get(point.id)?.[0]).toBeCloseTo(1);
  });
});

describe("onLocus points", () => {
  it("resolves and inverts on a locus", () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    const c = freePoint(2, 2);
    document = addObjects(document, [a, b, c]);
    const seg = segment(a.id, b.id);
    document = addObject(document, seg);
    const driver = pointOnLinear(seg.id, 0.5);
    document = addObject(document, driver);
    const link = segment(driver.id, c.id);
    document = addObject(document, link);
    const target = midpointOf(link.id);
    document = addObject(document, target);
    const locus = locusOf(driver.id, target.id);
    document = addObject(document, locus);
    const point = pointOnLocus(locus.id, 0.5);
    document = addObject(document, point);

    expect(resolvePositions(document).get(point.id)).toEqual([2, 1]);

    const inverted = invertLocus(document, locus.id, [3, 1]);
    if (inverted === null) throw new Error("expected an inverted parameter");
    expect(inverted).toBeCloseTo(1, 2);

    document = slidePoint(document, point.id, 0);
    expect(resolvePositions(document).get(point.id)).toEqual([1, 1]);
  });
});

describe("serialization", () => {
  it("round-trips the path-point roles", () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    const c = freePoint(2, 2);
    document = addObjects(document, [a, b, c]);
    const seg = segment(a.id, b.id);
    const poly = polygon([a.id, b.id, c.id]);
    document = addObjects(document, [seg, poly]);
    const onLinear = pointOnLinear(seg.id, 0.5);
    const onPolygon = pointOnPolygon(poly.id, 1, 0.25);
    const plot = functionPlotOf("x");
    document = addObjects(document, [onLinear, onPolygon, plot]);
    const onFunction = pointOnFunction(plot.id, 1.5);
    document = addObject(document, onFunction);
    const restored = parseDocument(serializeDocument(document));
    expect(Object.keys(restored.objects)).toHaveLength(Object.keys(document.objects).length);
  });

  it("rejects legacy onSegment points", () => {
    const legacy = JSON.stringify({
      version: 1,
      objects: {
        p: { kind: "point", role: "onSegment", id: "p", segment: "s", t: 0.5 },
        s: { kind: "segment", id: "s", p1: "a", p2: "b" },
        a: { kind: "point", role: "free", id: "a", x: 0, y: 0 },
        b: { kind: "point", role: "free", id: "b", x: 1, y: 0 },
      },
    });
    expect(() => parseDocument(legacy)).toThrow();
  });
});
