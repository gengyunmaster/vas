import { describe, expect, it } from "vitest";
import type {
  AngleBisector as AngleBisectorObject,
  Circumcircle,
  TriangleCenterPoint,
} from "../model";
import {
  addObjects,
  angleBisector,
  areaOf,
  circle,
  circleCenterOf,
  circumcircleOf,
  computeValue,
  createDocument,
  distance,
  externalBisector,
  freePoint,
  intersectionOf,
  lengthOf,
  parseDocument,
  pointOnCircle,
  pointPosition,
  polygon,
  removeObject,
  resolveShapePositions,
  segment,
  serializeDocument,
  triangleCenterOf,
} from "../model";

const buildTriangle = () => {
  const a = freePoint(0, 0);
  const b = freePoint(4, 0);
  const c = freePoint(0, 3);
  const tri = polygon([a.id, b.id, c.id]);
  const document = addObjects(createDocument(), [a, b, c, tri]);
  return { document, a, b, c, tri };
};

describe("circumcircle", () => {
  it("resolves center and radius through three points", () => {
    const { document, a, b, c } = buildTriangle();
    const circleObject = circumcircleOf(a.id, b.id, c.id);
    const next = addObjects(document, [circleObject]);
    const shape = resolveShapePositions(next, circleObject.id);
    expect(shape?.type).toBe("circle");
    if (shape?.type !== "circle") return;
    expect(shape.center[0]).toBeCloseTo(2, 6);
    expect(shape.center[1]).toBeCloseTo(1.5, 6);
    expect(shape.radius).toBeCloseTo(2.5, 6);
  });

  it("is unresolved for collinear points", () => {
    const p = freePoint(0, 0);
    const q = freePoint(1, 0);
    const r = freePoint(2, 0);
    const circleObject = circumcircleOf(p.id, q.id, r.id);
    const document = addObjects(createDocument(), [p, q, r, circleObject]);
    expect(resolveShapePositions(document, circleObject.id)).toBeNull();
  });

  it("hosts points, intersections and measurements like a circle", () => {
    const { document, a, b, c } = buildTriangle();
    const circleObject = circumcircleOf(a.id, b.id, c.id);
    const on = pointOnCircle(circleObject.id, 0);
    const center = freePoint(2, 1.5);
    const probe = freePoint(4.5, 1.5);
    const diameter = segment(center.id, probe.id);
    const hit = intersectionOf(circleObject.id, diameter.id, [4.4, 1.5]);
    const perimeter = lengthOf(circleObject.id, [0, 0]);
    const area = areaOf(circleObject.id, [0, 1]);
    const next = addObjects(document, [
      circleObject,
      on,
      center,
      probe,
      diameter,
      hit,
      perimeter,
      area,
    ]);
    expect(pointPosition(next, on.id)).toEqual([4.5, 1.5]);
    const crossing = pointPosition(next, hit.id);
    expect(crossing?.[0]).toBeCloseTo(4.5, 5);
    expect(crossing?.[1]).toBeCloseTo(1.5, 5);
    expect(computeValue(next, perimeter.id)).toBeCloseTo(5 * Math.PI, 5);
    expect(computeValue(next, area.id)).toBeCloseTo(6.25 * Math.PI, 5);
  });

  it("round-trips through serialization", () => {
    const { document, a, b, c } = buildTriangle();
    const circleObject = circumcircleOf(a.id, b.id, c.id);
    const next = addObjects(document, [circleObject]);
    const restored = parseDocument(serializeDocument(next));
    expect((restored.objects[circleObject.id] as Circumcircle).p3).toBe(c.id);
  });
});

describe("circle center points", () => {
  it("resolves the center of circles and circumcircles", () => {
    const { document, a, b, c } = buildTriangle();
    const plain = circle(a.id, b.id);
    const triple = circumcircleOf(a.id, b.id, c.id);
    const plainCenter = circleCenterOf(plain.id);
    const tripleCenter = circleCenterOf(triple.id);
    const next = addObjects(document, [plain, triple, plainCenter, tripleCenter]);
    expect(pointPosition(next, plainCenter.id)).toEqual([0, 0]);
    const center = pointPosition(next, tripleCenter.id);
    expect(center?.[0]).toBeCloseTo(2, 6);
    expect(center?.[1]).toBeCloseTo(1.5, 6);
  });
});

describe("triangle centers", () => {
  const centerAt = (center: TriangleCenterPoint["center"], vertex?: number) => {
    const { document, tri } = buildTriangle();
    const point = triangleCenterOf(tri.id, center, vertex);
    const next = addObjects(document, [point]);
    return pointPosition(next, point.id);
  };

  it("computes the classical centers of a 3-4-5 triangle", () => {
    expect(centerAt("centroid")?.[0]).toBeCloseTo(4 / 3, 6);
    expect(centerAt("centroid")?.[1]).toBeCloseTo(1, 6);
    expect(centerAt("circumcenter")).toEqual([2, 1.5]);
    expect(centerAt("orthocenter")).toEqual([0, 0]);
    expect(centerAt("incenter")?.[0]).toBeCloseTo(1, 6);
    expect(centerAt("incenter")?.[1]).toBeCloseTo(1, 6);
    expect(centerAt("excenter", 0)).toEqual([6, 6]);
    expect(centerAt("ninePointCenter")).toEqual([1, 0.75]);
  });

  it("satisfies the Euler line relations", () => {
    const o = centerAt("circumcenter");
    const g = centerAt("centroid");
    const h = centerAt("orthocenter");
    if (!o || !g || !h) throw new Error("expected triangle centers");
    const cross = (g[0] - o[0]) * (h[1] - o[1]) - (g[1] - o[1]) * (h[0] - o[0]);
    expect(cross).toBeCloseTo(0, 8);
    expect(distance(g, h)).toBeCloseTo(2 * distance(o, g), 8);
  });

  it("puts the nine-point center at distance R/2 from midpoints and altitude feet", () => {
    const n = centerAt("ninePointCenter");
    if (!n) throw new Error("expected the nine-point center");
    const midAb = [2, 0] as [number, number];
    const footFromA = [36 / 25, 48 / 25] as [number, number];
    const eulerMidpoint = [0, 1.5] as [number, number];
    expect(distance(n, midAb)).toBeCloseTo(1.25, 8);
    expect(distance(n, footFromA)).toBeCloseTo(1.25, 8);
    expect(distance(n, eulerMidpoint)).toBeCloseTo(1.25, 8);
  });

  it("round-trips triangle center points", () => {
    const { document, tri } = buildTriangle();
    const point = triangleCenterOf(tri.id, "excenter", 2);
    const next = addObjects(document, [point]);
    const restored = parseDocument(serializeDocument(next));
    const restoredPoint = restored.objects[point.id] as TriangleCenterPoint;
    expect(restoredPoint.center).toBe("excenter");
    expect(restoredPoint.vertex).toBe(2);
  });
});

describe("external angle bisector", () => {
  it("resolves to the line perpendicular to the internal bisector at the vertex", () => {
    const p1 = freePoint(1, 0);
    const vertex = freePoint(0, 0);
    const p2 = freePoint(0, 1);
    const internal = angleBisector(p1.id, vertex.id, p2.id);
    const external = externalBisector(p1.id, vertex.id, p2.id);
    const document = addObjects(createDocument(), [p1, vertex, p2, internal, external]);
    const internalShape = resolveShapePositions(document, internal.id);
    const externalShape = resolveShapePositions(document, external.id);
    expect(internalShape?.type).toBe("ray");
    expect(externalShape?.type).toBe("line");
    if (internalShape?.type !== "ray" || externalShape?.type !== "line") return;
    const internalDir = [
      internalShape.b[0] - internalShape.a[0],
      internalShape.b[1] - internalShape.a[1],
    ];
    const externalDir = [
      externalShape.b[0] - externalShape.a[0],
      externalShape.b[1] - externalShape.a[1],
    ];
    expect(internalDir[0] * externalDir[0] + internalDir[1] * externalDir[1]).toBeCloseTo(0, 8);
  });

  it("preserves the external flag through serialization", () => {
    const p1 = freePoint(1, 0);
    const vertex = freePoint(0, 0);
    const p2 = freePoint(0, 1);
    const external = externalBisector(p1.id, vertex.id, p2.id);
    const document = addObjects(createDocument(), [p1, vertex, p2, external]);
    const restored = parseDocument(serializeDocument(document));
    expect((restored.objects[external.id] as AngleBisectorObject).external).toBe(true);
  });
});

describe("cascade behavior", () => {
  it("deletes centers and circumcircles with their parents", () => {
    const { document, tri, a } = buildTriangle();
    const circum = circumcircleOf(tri.points[0], tri.points[1], tri.points[2]);
    const center = triangleCenterOf(tri.id, "centroid");
    const circleCenter = circleCenterOf(circum.id);
    let next = addObjects(document, [circum, center, circleCenter]);
    next = removeObject(next, a.id);
    expect(next.objects[circum.id]).toBeUndefined();
    expect(next.objects[center.id]).toBeUndefined();
    expect(next.objects[circleCenter.id]).toBeUndefined();
    expect(next.objects[tri.id]).toBeUndefined();
  });
});
