import { describe, expect, it } from "vitest";
import type { Calculation, FreePoint, GeoDocument, Measurement, ObjectId } from "../model";
import {
  addObjects,
  angleMeasure,
  areaOf,
  calculationAt,
  computeValue,
  createDocument,
  enforceLocks,
  freePoint,
  lengthOf,
  movePoint,
  parseDocument,
  pointPosition,
  polygon,
  segment,
  serializeDocument,
  setPointLocked,
  setValueLock,
} from "../model";

const buildLengthDoc = () => {
  const a = freePoint(0, 0);
  const b = freePoint(3, 0);
  const seg = segment(a.id, b.id);
  const m = lengthOf(seg.id, [1, 1]);
  const document = addObjects(createDocument(), [a, b, seg, m]);
  return { document, a, b, seg, m };
};

const lock = (document: GeoDocument, id: ObjectId, value: number): GeoDocument =>
  enforceLocks(setValueLock(document, id, value));

describe("measurement locks", () => {
  it("adjusts involved free points minimally when a lock target is set", () => {
    const { document: base, a, b, m } = buildLengthDoc();
    const document = lock(base, m.id, 2);
    expect(computeValue(document, m.id)).toBeCloseTo(2, 5);
    expect(pointPosition(document, a.id)?.[0]).toBeCloseTo(0.5, 5);
    expect(pointPosition(document, b.id)?.[0]).toBeCloseTo(2.5, 5);
  });

  it("keeps the locked length while dragging an endpoint", () => {
    const { document: base, a, b, m } = buildLengthDoc();
    let document = lock(base, m.id, 2);
    document = enforceLocks(movePoint(document, b.id, 5, 0), b.id);
    expect(computeValue(document, m.id)).toBeCloseTo(2, 5);
    expect(pointPosition(document, a.id)?.[0]).toBeCloseTo(3, 4);
    expect(pointPosition(document, b.id)).toEqual([5, 0]);
  });

  it("keeps the locked length for off-axis drags", () => {
    const { document: base, b, m } = buildLengthDoc();
    let document = lock(base, m.id, 2);
    document = enforceLocks(movePoint(document, b.id, 5, 3), b.id);
    expect(computeValue(document, m.id)).toBeCloseTo(2, 5);
  });

  it("keeps a locked angle while dragging an arm point", () => {
    const vertex = freePoint(0, 0);
    const p = freePoint(1, 0);
    const q = freePoint(0, 2);
    const m = angleMeasure(p.id, vertex.id, q.id, [1, 1]);
    let document = addObjects(createDocument(), [vertex, p, q, m]);
    document = lock(document, m.id, 60);
    expect(computeValue(document, m.id)).toBeCloseTo(60, 4);
    document = enforceLocks(movePoint(document, q.id, 3, 3), q.id);
    expect(computeValue(document, m.id)).toBeCloseTo(60, 4);
  });

  it("keeps a locked area while dragging a polygon vertex", () => {
    const a = freePoint(0, 0);
    const b = freePoint(4, 0);
    const c = freePoint(0, 4);
    const poly = polygon([a.id, b.id, c.id]);
    const m = areaOf(poly.id, [1, 1]);
    let document = addObjects(createDocument(), [a, b, c, poly, m]);
    document = lock(document, m.id, 8);
    expect(computeValue(document, m.id)).toBeCloseTo(8, 5);
    document = enforceLocks(movePoint(document, c.id, 3, 5), c.id);
    expect(computeValue(document, m.id)).toBeCloseTo(8, 5);
  });

  it("leaves uninvolved free points exactly in place", () => {
    const { document: base, b, m } = buildLengthDoc();
    const outsider = freePoint(9, 9);
    let document = addObjects(base, [outsider]);
    document = lock(document, m.id, 2);
    document = enforceLocks(movePoint(document, b.id, 5, 0), b.id);
    expect(pointPosition(document, outsider.id)).toEqual([9, 9]);
  });

  it("skips the solver when the dragged point affects no lock", () => {
    const { document: base, m } = buildLengthDoc();
    const outsider = freePoint(9, 9);
    let document = addObjects(base, [outsider]);
    document = lock(document, m.id, 2);
    const moved = movePoint(document, outsider.id, 7, 7);
    expect(enforceLocks(moved, outsider.id)).toBe(moved);
  });

  it("handles conflicting locks as best effort without diverging", () => {
    const { document: base, b, seg } = buildLengthDoc();
    const m1 = lengthOf(seg.id, [1, 1]);
    const m2 = lengthOf(seg.id, [1, 2]);
    let document = addObjects(base, [m1, m2]);
    document = lock(document, m1.id, 2);
    document = lock(document, m2.id, 5);
    const position = pointPosition(document, b.id);
    expect(position).not.toBeNull();
    expect(Number.isFinite(position?.[0])).toBe(true);
    expect(Number.isFinite(position?.[1])).toBe(true);
  });

  it("preserves the lock through a serialization roundtrip", () => {
    const { document: base, m } = buildLengthDoc();
    const document = lock(base, m.id, 2);
    const parsed = parseDocument(serializeDocument(document));
    const restored = parsed.objects[m.id] as Measurement;
    expect(restored.locked).toBe(2);
    expect(computeValue(parsed, m.id)).toBeCloseTo(2, 5);
  });
});

describe("point position locks", () => {
  it("refuses to move a locked free point", () => {
    const { document: base, b } = buildLengthDoc();
    const document = setPointLocked(base, b.id, true);
    expect(movePoint(document, b.id, 5, 5)).toBe(document);
    expect(pointPosition(document, b.id)).toEqual([3, 0]);
    const unlocked = setPointLocked(document, b.id, false);
    expect(pointPosition(movePoint(unlocked, b.id, 5, 5), b.id)).toEqual([5, 5]);
  });

  it("never adjusts locked points when enforcing measurement locks", () => {
    const { document: base, a, b, m } = buildLengthDoc();
    let document = lock(base, m.id, 2);
    document = setPointLocked(document, a.id, true);
    document = enforceLocks(movePoint(document, b.id, 5, 0), b.id);
    expect(pointPosition(document, a.id)?.[0]).toBeCloseTo(0.5, 5);
    expect(pointPosition(document, b.id)?.[0]).toBeCloseTo(2.5, 5);
    expect(computeValue(document, m.id)).toBeCloseTo(2, 5);
  });

  it("preserves the point lock through a serialization roundtrip", () => {
    const { document: base, b } = buildLengthDoc();
    const document = setPointLocked(base, b.id, true);
    const parsed = parseDocument(serializeDocument(document));
    expect((parsed.objects[b.id] as FreePoint).locked).toBe(true);
  });
});

describe("calculation locks", () => {
  const buildSumDoc = () => {
    const a = freePoint(0, 0);
    const b = freePoint(2, 0);
    const c = freePoint(0, 2);
    const d = freePoint(0, 5);
    const seg1 = segment(a.id, b.id);
    const seg2 = segment(c.id, d.id);
    const m1 = lengthOf(seg1.id, [1, 1]);
    const m2 = lengthOf(seg2.id, [1, 2]);
    const calc = calculationAt("v1+v2", [2, 2]);
    const document = addObjects(createDocument(), [a, b, c, d, seg1, seg2, m1, m2, calc]);
    return { document, a, b, c, d, m1, m2, calc };
  };

  it("shortens the other segment when one is stretched", () => {
    const { document: base, b, m1, m2, calc } = buildSumDoc();
    let document = lock(base, calc.id, 5);
    expect(computeValue(document, calc.id)).toBeCloseTo(5, 5);
    document = enforceLocks(movePoint(document, b.id, 4, 0), b.id);
    expect(pointPosition(document, b.id)).toEqual([4, 0]);
    expect(computeValue(document, m1.id)).toBeCloseTo(10 / 3, 4);
    expect(computeValue(document, m2.id)).toBeCloseTo(5 / 3, 4);
    expect(computeValue(document, calc.id)).toBeCloseTo(5, 5);
  });

  it("reaches the target when a lock is set on a calculation", () => {
    const { document: base, calc } = buildSumDoc();
    const document = lock(base, calc.id, 8);
    expect(computeValue(document, calc.id)).toBeCloseTo(8, 4);
  });

  it("settles on a nearby solution for multi-solution expressions", () => {
    const { document: base, m1, calc: sum } = buildSumDoc();
    const squared = calculationAt("v1^2", [2, 3]);
    let document = addObjects(base, [squared]);
    document = lock(document, squared.id, 9);
    expect(computeValue(document, squared.id)).toBeCloseTo(9, 4);
    expect(computeValue(document, m1.id)).toBeCloseTo(3, 4);
    expect(computeValue(document, sum.id)).toBeCloseTo(6, 4);
  });

  it("resolves name references in locked calculations", () => {
    const { document: base, b, m1, m2, calc } = buildSumDoc();
    let document = base;
    document = addObjects(document, []);
    const renamed = { ...document.objects[m1.id], name: "alpha" };
    const renamed2 = { ...document.objects[m2.id], name: "beta" };
    document = {
      ...document,
      objects: { ...document.objects, [m1.id]: renamed, [m2.id]: renamed2 },
    };
    const named = calculationAt("alpha+beta", [3, 3]);
    document = addObjects(document, [named]);
    document = lock(document, named.id, 5);
    document = enforceLocks(movePoint(document, b.id, 4, 0), b.id);
    expect(computeValue(document, named.id)).toBeCloseTo(5, 5);
    expect(computeValue(document, calc.id)).toBeCloseTo(5, 5);
  });

  it("preserves the calculation lock through a serialization roundtrip", () => {
    const { document: base, calc } = buildSumDoc();
    const document = lock(base, calc.id, 5);
    const parsed = parseDocument(serializeDocument(document));
    expect((parsed.objects[calc.id] as Calculation).locked).toBe(5);
    expect(computeValue(parsed, calc.id)).toBeCloseTo(5, 5);
  });
});
