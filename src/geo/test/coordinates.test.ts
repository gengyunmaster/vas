import { describe, expect, it } from "vitest";
import {
  addObjects,
  axisSystemOf,
  coordinateFrameFor,
  coordinatesInFrame,
  createDocument,
  freePoint,
  functionPlotOf,
  numberAxisOf,
  parseDocument,
  pointOnFunction,
  remapObjectReferences,
  removeObject,
  segment,
  serializeDocument,
  updatePointDisplay,
} from "../model";

describe("coordinatesInFrame", () => {
  it("returns board coordinates without a frame", () => {
    expect(coordinatesInFrame(null, [3, 5])).toEqual([3, 5]);
  });

  it("converts through translated, scaled and rotated frames", () => {
    const translated = {
      origin: [1, 1] as [number, number],
      ux: [1, 0] as [number, number],
      uy: [0, 1] as [number, number],
    };
    expect(coordinatesInFrame(translated, [3, 5])).toEqual([2, 4]);
    const scaled = {
      origin: [0, 0] as [number, number],
      ux: [3, 0] as [number, number],
      uy: [0, 3] as [number, number],
    };
    expect(coordinatesInFrame(scaled, [6, 0])).toEqual([2, 0]);
    const rotated = {
      origin: [0, 0] as [number, number],
      ux: [0, 1] as [number, number],
      uy: [-1, 0] as [number, number],
    };
    expect(coordinatesInFrame(rotated, [0, 2])).toEqual([2, 0]);
    expect(coordinatesInFrame(rotated, [-1, 0])).toEqual([0, 1]);
  });
});

describe("coordinateFrameFor", () => {
  const buildPlotDoc = () => {
    const origin = freePoint(1, 1);
    const unit = freePoint(2, 1);
    const axes = axisSystemOf(origin.id, unit.id);
    const plot = { ...functionPlotOf("x"), axis: axes.id };
    const hosted = pointOnFunction(plot.id, 2);
    const free = freePoint(9, 9);
    const document = addObjects(createDocument(), [origin, unit, axes, plot, hosted, free]);
    return { document, origin, axes, hosted, free };
  };

  it("defaults free points to board coordinates", () => {
    const { document, free } = buildPlotDoc();
    expect(coordinateFrameFor(document, free)).toBeNull();
  });

  it("follows a function-plot host's axis binding", () => {
    const { document, axes, hosted } = buildPlotDoc();
    const frame = coordinateFrameFor(document, hosted);
    expect(frame?.origin).toEqual([1, 1]);
    expect(frame?.ux).toEqual([1, 0]);
    expect(coordinatesInFrame(frame, [3, 3])).toEqual([2, 2]);
    expect(axes.id).toBeTruthy();
  });

  it("lets an explicit null override the host binding", () => {
    const { document, hosted } = buildPlotDoc();
    const overridden = updatePointDisplay(document, hosted.id, { coordinateAxes: null });
    const point = overridden.objects[hosted.id];
    expect(point.kind === "point" && coordinateFrameFor(overridden, point)).toBeNull();
  });

  it("prefers an explicit axes pick over the host binding", () => {
    const { document, hosted } = buildPlotDoc();
    const otherOrigin = freePoint(5, 5);
    const otherUnit = freePoint(6, 5);
    const otherAxes = axisSystemOf(otherOrigin.id, otherUnit.id);
    const withAxes = addObjects(document, [otherOrigin, otherUnit, otherAxes]);
    const overridden = updatePointDisplay(withAxes, hosted.id, { coordinateAxes: otherAxes.id });
    const point = overridden.objects[hosted.id];
    const frame = point.kind === "point" ? coordinateFrameFor(overridden, point) : null;
    expect(frame?.origin).toEqual([5, 5]);
  });

  it("returns null for a dangling axes reference", () => {
    const { document, free } = buildPlotDoc();
    const broken = updatePointDisplay(document, free.id, { coordinateAxes: "missing" });
    expect(broken).toBe(document);
  });
});

describe("updatePointDisplay", () => {
  it("toggles showCoordinates and clears the flag when off", () => {
    const point = freePoint(0, 0);
    const document = addObjects(createDocument(), [point]);
    const shown = updatePointDisplay(document, point.id, { showCoordinates: true });
    const shownPoint = shown.objects[point.id];
    expect(shownPoint.kind === "point" && shownPoint.showCoordinates).toBe(true);
    expect(updatePointDisplay(shown, point.id, { showCoordinates: true })).toBe(shown);
    const hidden = updatePointDisplay(shown, point.id, { showCoordinates: false });
    const hiddenPoint = hidden.objects[point.id];
    expect(hiddenPoint.kind === "point" && (hiddenPoint.showCoordinates ?? false)).toBe(false);
  });

  it("validates the axes reference and supports auto", () => {
    const point = freePoint(0, 0);
    const origin = freePoint(0, 0);
    const unit = freePoint(1, 0);
    const axes = axisSystemOf(origin.id, unit.id);
    const numberAxis = numberAxisOf(origin.id, unit.id);
    const seg = segment(origin.id, unit.id);
    const document = addObjects(createDocument(), [point, origin, unit, axes, numberAxis, seg]);
    expect(updatePointDisplay(document, point.id, { coordinateAxes: numberAxis.id })).toBe(
      document,
    );
    expect(updatePointDisplay(document, point.id, { coordinateAxes: seg.id })).toBe(document);
    const bound = updatePointDisplay(document, point.id, { coordinateAxes: axes.id });
    const boundPoint = bound.objects[point.id];
    expect(boundPoint.kind === "point" && boundPoint.coordinateAxes).toBe(axes.id);
    const auto = updatePointDisplay(bound, point.id, { coordinateAxes: "auto" });
    const autoPoint = auto.objects[point.id];
    expect(autoPoint.kind === "point" && autoPoint.coordinateAxes).toBeUndefined();
    expect(updatePointDisplay(auto, point.id, { coordinateAxes: "auto" })).toBe(auto);
  });

  it("ignores non-point objects", () => {
    const a = freePoint(0, 0);
    const b = freePoint(1, 0);
    const seg = segment(a.id, b.id);
    const document = addObjects(createDocument(), [a, b, seg]);
    expect(updatePointDisplay(document, seg.id, { showCoordinates: true })).toBe(document);
  });
});

describe("coordinate display cleanup and serialization", () => {
  it("drops the binding instead of cascading when the axes is removed", () => {
    const origin = freePoint(0, 0);
    const unit = freePoint(1, 0);
    const axes = axisSystemOf(origin.id, unit.id);
    const point = freePoint(2, 2);
    let document = addObjects(createDocument(), [origin, unit, axes, point]);
    document = updatePointDisplay(document, point.id, {
      showCoordinates: true,
      coordinateAxes: axes.id,
    });
    const removed = removeObject(document, axes.id);
    const survivor = removed.objects[point.id];
    expect(survivor).toBeTruthy();
    expect(survivor.kind === "point" && survivor.coordinateAxes).toBeUndefined();
    expect(survivor.kind === "point" && survivor.showCoordinates).toBe(true);
  });

  it("keeps display fields through a serialization roundtrip", () => {
    const point = freePoint(2, 2);
    let document = addObjects(createDocument(), [point]);
    document = updatePointDisplay(document, point.id, {
      showCoordinates: true,
      coordinateAxes: null,
    });
    const parsed = parseDocument(serializeDocument(document));
    const restored = parsed.objects[point.id];
    expect(restored.kind === "point" && restored.showCoordinates).toBe(true);
    expect(restored.kind === "point" && restored.coordinateAxes).toBeNull();
  });

  it("rejects malformed display fields", () => {
    const point = freePoint(0, 0);
    const document = addObjects(createDocument(), [point]);
    const data = JSON.parse(serializeDocument(document)) as { objects: Record<string, unknown> };
    data.objects[point.id] = {
      ...(data.objects[point.id] as object),
      showCoordinates: "yes",
    };
    expect(() => parseDocument(JSON.stringify(data))).toThrow();
    data.objects[point.id] = {
      ...(data.objects[point.id] as object),
      showCoordinates: true,
      coordinateAxes: 7,
    };
    expect(() => parseDocument(JSON.stringify(data))).toThrow();
  });

  it("remaps coordinateAxes on instantiation and drops unmapped references", () => {
    const origin = freePoint(0, 0);
    const unit = freePoint(1, 0);
    const axes = axisSystemOf(origin.id, unit.id);
    const point = freePoint(2, 2);
    let document = addObjects(createDocument(), [origin, unit, axes, point]);
    document = updatePointDisplay(document, point.id, {
      showCoordinates: true,
      coordinateAxes: axes.id,
    });
    const bound = document.objects[point.id];

    const remapped = remapObjectReferences(bound, new Map([[axes.id, "axes-copy"]]));
    expect(remapped.kind === "point" && remapped.coordinateAxes).toBe("axes-copy");
    expect(remapped.kind === "point" && remapped.showCoordinates).toBe(true);

    const dropped = remapObjectReferences(bound, new Map());
    expect(dropped.kind === "point" && dropped.coordinateAxes).toBeUndefined();
  });
});
