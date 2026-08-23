import { describe, expect, it } from "vitest";
import {
  addObject,
  addObjects,
  createDocument,
  freePoint,
  iterationOf,
  iterationPoints,
  parseDocument,
  removeObject,
  serializeDocument,
} from "../model";

describe("iteration", () => {
  it("iterates a rotation about the marked center", () => {
    let document = createDocument();
    const center = freePoint(0, 0);
    const seed = freePoint(1, 0);
    document = addObjects(document, [center, seed]);
    const iteration = iterationOf(seed.id, { type: "rotate", center: center.id, angleDeg: 90 }, 3);
    document = addObject(document, iteration);
    const points = iterationPoints(document, iteration.id);
    if (!points) throw new Error("expected iteration points");
    expect(points).toHaveLength(4);
    expect(points[1][0]).toBeCloseTo(0);
    expect(points[1][1]).toBeCloseTo(1);
    expect(points[3][0]).toBeCloseTo(0);
    expect(points[3][1]).toBeCloseTo(-1);
  });

  it("iterates a scaling spiral", () => {
    let document = createDocument();
    const center = freePoint(0, 0);
    const seed = freePoint(1, 0);
    document = addObjects(document, [center, seed]);
    const iteration = iterationOf(seed.id, { type: "scale", center: center.id, factor: 2 }, 3);
    document = addObject(document, iteration);
    const points = iterationPoints(document, iteration.id);
    if (!points) throw new Error("expected iteration points");
    expect(points.map((p) => p[0])).toEqual([1, 2, 4, 8]);
  });

  it("serializes and cascades", () => {
    let document = createDocument();
    const center = freePoint(0, 0);
    const seed = freePoint(1, 0);
    document = addObjects(document, [center, seed]);
    const iteration = iterationOf(seed.id, { type: "rotate", center: center.id, angleDeg: 10 }, 5);
    document = addObject(document, iteration);
    const restored = parseDocument(serializeDocument(document));
    expect(restored.objects[iteration.id].kind).toBe("iteration");
    const deleted = removeObject(document, center.id);
    expect(deleted.objects[iteration.id]).toBeUndefined();
  });
});
