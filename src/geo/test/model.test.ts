import { describe, expect, it } from "vitest";
import {
  addObject,
  addObjects,
  angleMeasure,
  areaOf,
  axisSystemOf,
  calculationAt,
  circle,
  computeValue,
  conicOf,
  createDocument,
  distanceBetween,
  driverAnimationOf,
  evaluateCalculationExpression,
  freePoint,
  functionPlotOf,
  intersectionOf,
  invertLocus,
  lengthOf,
  line,
  locusOf,
  locusPoints,
  midpointOf,
  movePoint,
  parseDocument,
  pointOnCircle,
  pointOnConic,
  pointOnLinear,
  pointOnPolygon,
  polygon,
  ray,
  removeObject,
  renameObject,
  resolvePositions,
  resolveShapePositions,
  segment,
  serializeDocument,
  setMark,
  setObjectHidden,
  slidePoint,
  toggleAnimationOf,
  transformedPoint,
  transformedShape,
  updateAnimationSettings,
  updateObjectStyle,
  updatePlotExpressions,
  valueIndexOf,
  variableAt,
} from "../model";

const buildBasicDoc = () => {
  let document = createDocument();
  const a = freePoint(0, 0);
  const b = freePoint(4, 0);
  const c = freePoint(0, 3);
  document = addObjects(document, [a, b, c]);
  const seg = segment(a.id, b.id);
  const circ = circle(a.id, c.id);
  document = addObjects(document, [seg, circ]);
  return { document, a, b, c, seg, circ };
};

describe("constrained points", () => {
  it("resolves midpoint, on-segment, on-circle and intersection positions", () => {
    let { document, seg, circ } = buildBasicDoc();
    const mid = midpointOf(seg.id);
    const onSeg = pointOnLinear(seg.id, 0.25);
    const onCir = pointOnCircle(circ.id, Math.PI / 2);
    const inter = intersectionOf(seg.id, circ.id, [4, 0]);
    document = addObjects(document, [mid, onSeg, onCir, inter]);

    const positions = resolvePositions(document);
    expect(positions.get(mid.id)).toEqual([2, 0]);
    expect(positions.get(onSeg.id)).toEqual([1, 0]);
    expect(positions.get(onCir.id)?.[1]).toBeCloseTo(3);
    expect(positions.get(inter.id)).toEqual([3, 0]);
  });

  it("follows when free parents move, and slides constrained points", () => {
    let { document, b, seg } = buildBasicDoc();
    const onSeg = pointOnLinear(seg.id, 0.5);
    document = addObject(document, onSeg);
    document = movePoint(document, b.id, 6, 0);
    expect(resolvePositions(document).get(onSeg.id)).toEqual([3, 0]);
    document = slidePoint(document, onSeg.id, 0.25);
    expect(resolvePositions(document).get(onSeg.id)).toEqual([1.5, 0]);
  });

  it("cascade deletes dependents", () => {
    let { document, seg, circ, a, b, c } = buildBasicDoc();
    const mid = midpointOf(seg.id);
    const onSeg = pointOnLinear(seg.id, 0.5);
    const inter = intersectionOf(seg.id, circ.id, [4, 0]);
    const onCir = pointOnCircle(circ.id, 0);
    document = addObjects(document, [mid, onSeg, inter, onCir]);
    const deleted = removeObject(document, seg.id);
    expect(deleted.objects[seg.id]).toBeUndefined();
    expect(deleted.objects[mid.id]).toBeUndefined();
    expect(deleted.objects[onSeg.id]).toBeUndefined();
    expect(deleted.objects[inter.id]).toBeUndefined();
    expect(Object.keys(deleted.objects)).toHaveLength(5);
    expect(deleted.objects[a.id]).toBeDefined();
    expect(deleted.objects[b.id]).toBeDefined();
    expect(deleted.objects[c.id]).toBeDefined();
  });
});

describe("transforms", () => {
  it("rotates, scales, translates and reflects points and shapes", () => {
    let document = createDocument();
    const o = freePoint(0, 0);
    const a = freePoint(2, 0);
    const b = freePoint(4, 0);
    const v1 = freePoint(0, 0);
    const v2 = freePoint(1, 1);
    document = addObjects(document, [o, a, b, v1, v2]);
    const seg = segment(a.id, b.id);
    document = addObject(document, seg);

    const rotated = transformedPoint(a.id, { type: "rotate", center: o.id, angleDeg: 90 });
    const translated = transformedShape(seg.id, { type: "translate", from: v1.id, to: v2.id });
    const scaled = transformedShape(seg.id, { type: "scale", center: o.id, factor: 2 });
    const reflected = transformedShape(seg.id, { type: "reflect", mirror: translated.id });
    document = addObjects(document, [rotated, translated, scaled, reflected]);

    const positions = resolvePositions(document);
    expect(positions.get(rotated.id)?.[1]).toBeCloseTo(2);
    expect(resolveShapePositions(document, translated.id)).toEqual({
      type: "segment",
      a: [3, 1],
      b: [5, 1],
    });
    expect(resolveShapePositions(document, scaled.id)).toEqual({
      type: "segment",
      a: [4, 0],
      b: [8, 0],
    });
    expect(resolveShapePositions(document, reflected.id)).toEqual({
      type: "segment",
      a: [2, 2],
      b: [4, 2],
    });
  });

  it("transformed segments host on-segment points and midpoints", () => {
    let document = createDocument();
    const a = freePoint(2, 0);
    const b = freePoint(4, 0);
    const v1 = freePoint(0, 0);
    const v2 = freePoint(1, 1);
    document = addObjects(document, [a, b, v1, v2]);
    const seg = segment(a.id, b.id);
    const translated = transformedShape(seg.id, { type: "translate", from: v1.id, to: v2.id });
    document = addObjects(document, [seg, translated]);
    const onSeg = pointOnLinear(translated.id, 0.5);
    const mid = midpointOf(translated.id);
    document = addObjects(document, [onSeg, mid]);
    const positions = resolvePositions(document);
    expect(positions.get(onSeg.id)).toEqual([4, 1]);
    expect(positions.get(mid.id)).toEqual([4, 1]);
  });

  it("clears marks when the marked object is deleted", () => {
    let { document, a } = buildBasicDoc();
    const rotated = transformedPoint(a.id, { type: "rotate", center: a.id, angleDeg: 30 });
    document = addObject(document, rotated);
    document = setMark(document, "center", a.id);
    const deleted = removeObject(document, a.id);
    expect(deleted.marks?.center).toBeUndefined();
    expect(deleted.objects[rotated.id]).toBeUndefined();
  });
});

describe("measurements and values", () => {
  it("computes length, distance, angle and area", () => {
    let document = createDocument();
    const p1 = freePoint(0, 0);
    const p2 = freePoint(3, 0);
    const p3 = freePoint(0, 4);
    document = addObjects(document, [p1, p2, p3]);
    const seg = segment(p1.id, p2.id);
    const circ = circle(p1.id, freePoint(6, 0).id);
    const throughPoint = freePoint(6, 0);
    document = addObjects(document, [seg, throughPoint]);
    const realCircle = circle(p1.id, throughPoint.id);
    document = addObject(document, realCircle);
    void circ;

    const length = lengthOf(seg.id, [0, 0]);
    const distance = distanceBetween(p1.id, p3.id, [0, 0]);
    const angle = angleMeasure(p2.id, p1.id, p3.id, [0, 0]);
    const area = areaOf(realCircle.id, [0, 0]);
    document = addObjects(document, [length, distance, angle, area]);

    expect(computeValue(document, length.id)).toBe(3);
    expect(computeValue(document, distance.id)).toBe(4);
    expect(computeValue(document, angle.id)).toBe(90);
    expect(computeValue(document, area.id)).toBeCloseTo(36 * Math.PI);
  });

  it("evaluates calculations with v-index references", () => {
    let document = createDocument();
    const p1 = freePoint(0, 0);
    const p2 = freePoint(3, 0);
    document = addObjects(document, [p1, p2]);
    const seg = segment(p1.id, p2.id);
    document = addObject(document, seg);
    const length = lengthOf(seg.id, [0, 0]);
    const variable = variableAt(2.5, [0, 0]);
    const calc = calculationAt("v1+v2*2", [0, 0]);
    document = addObjects(document, [length, variable, calc]);

    expect(valueIndexOf(document, calc.id)).toBe(3);
    expect(computeValue(document, calc.id)).toBe(8);
  });

  it("evaluates ad-hoc calculation expressions against the document", () => {
    let document = createDocument();
    const alpha = { ...variableAt(2.5, [0, 0]), name: "alpha" };
    document = addObject(document, alpha);
    expect(evaluateCalculationExpression(document, "v1*2+alpha")).toBe(7.5);
    expect(evaluateCalculationExpression(document, "v2+1")).toBeNull();
    expect(evaluateCalculationExpression(document, "unknown+1")).toBeNull();
  });
});

describe("locus", () => {
  it("samples the traced path of a dependent point", () => {
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

    expect(locusPoints(document, driver.id, target.id, 4)).toEqual([
      [1, 1],
      [1.5, 1],
      [2, 1],
      [2.5, 1],
      [3, 1],
    ]);
    expect(locusPoints(document, c.id, target.id)).toBeNull();
  });

  it("samples line-driven loci across the supplied viewport", () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    const c = freePoint(0, 2);
    document = addObjects(document, [a, b, c]);
    const host = line(a.id, b.id);
    document = addObject(document, host);
    const driver = pointOnLinear(host.id, 0.5);
    document = addObject(document, driver);
    const link = segment(driver.id, c.id);
    document = addObject(document, link);
    const target = midpointOf(link.id);
    document = addObject(document, target);
    const locus = locusOf(driver.id, target.id);
    document = addObject(document, locus);

    const bounded = locusPoints(document, driver.id, target.id, 4);
    expect(bounded?.[0]).toEqual([0, 1]);
    expect(bounded?.[bounded.length - 1]).toEqual([2, 1]);

    const view: readonly [number, number, number, number] = [-10, 5, 10, -5];
    const samples = locusPoints(document, driver.id, target.id, 4, view);
    expect(samples?.[0]).toEqual([-5, 1]);
    expect(samples?.[samples.length - 1]).toEqual([5, 1]);
    expect(invertLocus(document, locus.id, [5, 1], 120, view)).toBeCloseTo(2.5, 1);
  });

  it("keeps ray-driven loci anchored at the ray origin", () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    const c = freePoint(0, 2);
    document = addObjects(document, [a, b, c]);
    const host = ray(a.id, b.id);
    document = addObject(document, host);
    const driver = pointOnLinear(host.id, 0.5);
    document = addObject(document, driver);
    const link = segment(driver.id, c.id);
    document = addObject(document, link);
    const target = midpointOf(link.id);
    document = addObject(document, target);

    const view: readonly [number, number, number, number] = [-10, 5, 10, -5];
    const samples = locusPoints(document, driver.id, target.id, 4, view);
    expect(samples?.[0]).toEqual([0, 1]);
    expect(samples?.[samples.length - 1]).toEqual([5, 1]);
  });
});

describe("serialization", () => {
  it("round-trips documents with presentation fields, transforms, marks and locus", () => {
    let { document, seg, a, b } = buildBasicDoc();
    const mid = midpointOf(seg.id);
    const rotated = transformedPoint(a.id, { type: "rotate", center: b.id, angleDeg: 45 });
    const driver = pointOnLinear(seg.id, 0.5);
    document = addObjects(document, [mid, rotated, driver]);
    const locus = locusOf(driver.id, mid.id);
    document = addObject(document, locus);
    document = renameObject(document, a.id, "A");
    document = setObjectHidden(document, seg.id, true);
    document = updateObjectStyle(document, seg.id, { strokeColor: "#ff0000", dash: 2 });
    document = setMark(document, "center", a.id);

    const restored = parseDocument(serializeDocument(document));
    expect(Object.keys(restored.objects)).toHaveLength(Object.keys(document.objects).length);
    expect(restored.objects[a.id].name).toBe("A");
    expect(restored.objects[seg.id].hidden).toBe(true);
    expect(restored.objects[seg.id].style).toEqual({ strokeColor: "#ff0000", dash: 2 });
    expect(restored.marks?.center).toBe(a.id);
    expect(restored.objects[locus.id].kind).toBe("locus");
  });

  it("rejects invalid documents", () => {
    expect(() => parseDocument("{}")).toThrow();
    expect(() =>
      parseDocument(
        '{"version":1,"objects":{"a":{"kind":"point","role":"free","id":"a","x":"NaN"}}}',
      ),
    ).toThrow();
  });
});
describe("onPolygon parameter wraparound", () => {
  const buildTriangleDoc = () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    const c = freePoint(4, 4);
    document = addObjects(document, [a, b, c]);
    const poly = polygon([a.id, b.id, c.id]);
    document = addObject(document, poly);
    return { document, poly };
  };

  it("resolves a parameter equal to the vertex count as the first vertex", () => {
    let { document, poly } = buildTriangleDoc();
    const point = pointOnPolygon(poly.id, 0, 0);
    document = addObject(document, point);
    const at = (value: number) =>
      resolvePositions(document, new Map([[point.id, value]])).get(point.id);
    expect(at(3)).toEqual([0, 0]);
    expect(at(3.5)).toEqual([2, 0]);
    expect(at(-0.5)).toEqual([2, 2]);
    document = slidePoint(document, point.id, 3);
    expect(resolvePositions(document).get(point.id)).toEqual([0, 0]);
  });

  it("closes a polygon-driven locus without a jump at the endpoint", () => {
    let { document, poly } = buildTriangleDoc();
    const driver = pointOnPolygon(poly.id, 0, 0);
    const anchor = freePoint(8, 8);
    document = addObjects(document, [driver, anchor]);
    const link = segment(driver.id, anchor.id);
    document = addObject(document, link);
    const target = midpointOf(link.id);
    document = addObject(document, target);
    const samples = locusPoints(document, driver.id, target.id, 6);
    expect(samples).not.toBeNull();
    expect(samples?.[0]).toEqual([4, 4]);
    expect(samples?.[samples.length - 1]).toEqual([4, 4]);
  });
});

describe("parseDocument hardening", () => {
  it("rejects non-finite numeric values", () => {
    expect(() =>
      parseDocument(
        '{"version":1,"objects":{"p":{"kind":"point","role":"free","id":"p","x":1e999,"y":0}}}',
      ),
    ).toThrow();
    expect(() =>
      parseDocument(
        '{"version":1,"objects":{"v":{"kind":"variable","id":"v","value":-1e999,"position":[0,0]}}}',
      ),
    ).toThrow();
  });

  it("rejects onConic points with a branch other than 1 or -1", () => {
    let document = createDocument();
    const f1 = freePoint(-2, 0);
    const f2 = freePoint(2, 0);
    const onCurve = freePoint(0, 3);
    document = addObjects(document, [f1, f2, onCurve]);
    const host = conicOf("ellipse", { focus1: f1.id, focus2: f2.id, pointOnCurve: onCurve.id });
    document = addObject(document, host);
    const point = pointOnConic(host.id, 0.5, 1);
    document = addObject(document, point);
    expect(parseDocument(serializeDocument(document)).objects[point.id]).toBeDefined();
    const tampered = JSON.parse(serializeDocument(document));
    tampered.objects[point.id].branch = 0;
    expect(() => parseDocument(JSON.stringify(tampered))).toThrow();
  });
});

describe("no-op updater guards", () => {
  it("updateAnimationSettings returns the same document when nothing changes", () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const animation = driverAnimationOf(a.id, [1, 1]);
    document = addObjects(document, [a, animation]);
    expect(updateAnimationSettings(document, animation.id, {})).toBe(document);
    const withDuration = updateAnimationSettings(document, animation.id, { duration: 5 });
    expect(withDuration).not.toBe(document);
    expect(updateAnimationSettings(withDuration, animation.id, { duration: 5 })).toBe(withDuration);
    const withMode = updateAnimationSettings(withDuration, animation.id, { mode: "loop" });
    expect(withMode).not.toBe(withDuration);
    expect(updateAnimationSettings(withMode, animation.id, { duration: 5, mode: "loop" })).toBe(
      withMode,
    );
  });

  it("updatePlotExpressions returns the same document when nothing changes", () => {
    let document = createDocument();
    const plot = functionPlotOf("x");
    document = addObject(document, plot);
    expect(updatePlotExpressions(document, plot.id, {})).toBe(document);
    expect(updatePlotExpressions(document, plot.id, { latex: "x" })).toBe(document);
    expect(updatePlotExpressions(document, plot.id, { axis: null })).toBe(document);
    const edited = updatePlotExpressions(document, plot.id, { latex: "x^2" });
    expect(edited).not.toBe(document);

    const origin = freePoint(0, 0);
    const unit = freePoint(1, 0);
    const axes = axisSystemOf(origin.id, unit.id);
    document = addObjects(document, [origin, unit, axes]);
    const bound = updatePlotExpressions(document, plot.id, { axis: axes.id });
    expect(bound).not.toBe(document);
    expect(updatePlotExpressions(bound, plot.id, { axis: axes.id })).toBe(bound);
  });
});

describe("value references on delete", () => {
  const buildValueDoc = () => {
    let document = createDocument();
    const a = freePoint(0, 0);
    const b = freePoint(3, 0);
    const c = freePoint(0, 4);
    document = addObjects(document, [a, b, c]);
    const link = segment(a.id, b.id);
    document = addObject(document, link);
    const measurement = lengthOf(link.id, [0, 5]);
    const va = variableAt(2, [0, 6]);
    const vb = variableAt(5, [0, 7]);
    document = addObjects(document, [measurement, va, vb]);
    return { document, link, measurement, va, vb };
  };

  it("renumbers vN references so survivors keep pointing at the same values", () => {
    const { document, measurement, va, vb } = buildValueDoc();
    const calc = calculationAt("v2*2+v3", [0, 8]);
    const withCalc = addObject(document, calc);
    expect(computeValue(withCalc, calc.id)).toBe(2 * 2 + 5);
    const deleted = removeObject(withCalc, measurement.id);
    const survivor = deleted.objects[calc.id];
    expect(survivor).toBeDefined();
    expect(survivor?.kind === "calculation" && survivor.expression).toBe("v1*2+v2");
    expect(computeValue(deleted, calc.id)).toBe(2 * 2 + 5);
    expect(valueIndexOf(deleted, va.id)).toBe(1);
    expect(valueIndexOf(deleted, vb.id)).toBe(2);
  });

  it("cascades calculations that reference the deleted value by index", () => {
    const { document, va } = buildValueDoc();
    const calc = calculationAt("v2*10", [0, 8]);
    const dependent = calculationAt("v4+1", [0, 9]);
    const withCalcs = addObjects(document, [calc, dependent]);
    expect(computeValue(withCalcs, dependent.id)).toBe(2 * 10 + 1);
    const deleted = removeObject(withCalcs, va.id);
    expect(deleted.objects[calc.id]).toBeUndefined();
    expect(deleted.objects[dependent.id]).toBeUndefined();
  });

  it("cascades dependents of calculations removed by the value-index sweep", () => {
    const { document, measurement } = buildValueDoc();
    const calc = calculationAt("v1*10", [0, 8]);
    const animation = toggleAnimationOf(calc.id, [0, 9]);
    const withAll = addObjects(document, [calc, animation]);
    const deleted = removeObject(withAll, measurement.id);
    expect(deleted.objects[measurement.id]).toBeUndefined();
    expect(deleted.objects[calc.id]).toBeUndefined();
    expect(deleted.objects[animation.id]).toBeUndefined();
    const restored = parseDocument(serializeDocument(deleted));
    expect(Object.keys(restored.objects)).toHaveLength(Object.keys(deleted.objects).length);
  });

  it("keeps name-referenced calculations, degrading to an unresolved value", () => {
    const { document, va } = buildValueDoc();
    const named = renameObject(document, va.id, "alpha");
    const calc = calculationAt("alpha*3", [0, 8]);
    const withCalc = addObject(named, calc);
    expect(computeValue(withCalc, calc.id)).toBe(6);
    const deleted = removeObject(withCalc, va.id);
    expect(deleted.objects[calc.id]).toBeDefined();
    expect(computeValue(deleted, calc.id)).toBeNull();
  });
});
