import { describe, expect, it } from "vitest";
import type { Stroke } from "./stroke";
import {
  clampMoveDelta,
  clampScaleToPage,
  imagesBounds,
  scaleBounds,
  scaleImage,
  scaleStroke,
  strokesBounds,
  translateBounds,
  translateImage,
  translateStroke,
  unionBounds,
} from "./transform";

function penStroke(id: string, points: { x: number; y: number }[], size = 4): Stroke {
  return {
    id,
    pen: "pen",
    color: "#1a1a1a",
    size,
    simulatePressure: false,
    points: points.map((p) => ({ ...p, pressure: 0.5 })),
  };
}

describe("strokesBounds", () => {
  it("unions stroke bounds including the ink margin", () => {
    const a = penStroke("a", [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    const b = penStroke(
      "b",
      [
        { x: 100, y: 50 },
        { x: 120, y: 80 },
      ],
      8,
    );
    expect(strokesBounds([a, b])).toEqual({ minX: 8, minY: 8, maxX: 124, maxY: 84 });
  });

  it("returns null for an empty selection", () => {
    expect(strokesBounds([])).toBeNull();
  });

  it("uses the widened highlighter size", () => {
    const stroke: Stroke = { ...penStroke("h", [{ x: 10, y: 10 }], 4), pen: "highlighter" };
    const bounds = strokesBounds([stroke]);
    expect(bounds?.minX).toBeCloseTo(10 - (4 * 2.2) / 2);
  });
});

describe("translateStroke", () => {
  it("moves every point and preserves the rest of the stroke", () => {
    const stroke = penStroke("s", [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    const moved = translateStroke(stroke, 10, -5);
    expect(moved.points.map((p) => [p.x, p.y])).toEqual([
      [11, -3],
      [13, -1],
    ]);
    expect(moved.id).toBe("s");
    expect(moved.size).toBe(stroke.size);
    expect(moved.color).toBe(stroke.color);
    expect(stroke.points[0].x).toBe(1);
  });
});

describe("scaleStroke", () => {
  it("scales points about the anchor", () => {
    const stroke = penStroke("s", [
      { x: 10, y: 10 },
      { x: 20, y: 30 },
    ]);
    const scaled = scaleStroke(stroke, { x: 10, y: 10 }, 2, 3);
    expect(scaled.points.map((p) => [p.x, p.y])).toEqual([
      [10, 10],
      [30, 70],
    ]);
  });

  it("scales the ink size by the geometric mean of the factors", () => {
    const stroke = penStroke("s", [{ x: 0, y: 0 }], 6);
    expect(scaleStroke(stroke, { x: 0, y: 0 }, 2, 2).size).toBeCloseTo(12);
    expect(scaleStroke(stroke, { x: 0, y: 0 }, 2, 8).size).toBeCloseTo(24);
  });
});

describe("bounds helpers", () => {
  const bounds = { minX: 10, minY: 20, maxX: 30, maxY: 40 };

  it("translates bounds", () => {
    expect(translateBounds(bounds, 5, -10)).toEqual({ minX: 15, minY: 10, maxX: 35, maxY: 30 });
  });

  it("scales bounds about the anchor", () => {
    expect(scaleBounds(bounds, { x: 10, y: 20 }, 2, 2)).toEqual({
      minX: 10,
      minY: 20,
      maxX: 50,
      maxY: 60,
    });
  });
});

describe("clampMoveDelta", () => {
  const bounds = { minX: 10, minY: 10, maxX: 110, maxY: 110 };

  it("keeps deltas that fit on the page", () => {
    expect(clampMoveDelta(bounds, 50, -5)).toEqual({ dx: 50, dy: -5 });
  });

  it("clamps movement beyond the page edges", () => {
    expect(clampMoveDelta(bounds, -500, 0).dx).toBe(-10);
    expect(clampMoveDelta(bounds, 0, 99999).dy).toBe(1123 - 110);
    expect(clampMoveDelta(bounds, 99999, 0).dx).toBe(794 - 110);
  });
});

describe("clampScaleToPage", () => {
  it("allows scaling that stays on the page", () => {
    const bounds = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
    expect(clampScaleToPage(bounds, { x: 100, y: 100 }, 2, 2)).toEqual({ sx: 2, sy: 2 });
  });

  it("clamps scaling that would overflow the page", () => {
    const bounds = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
    const clamped = clampScaleToPage(bounds, { x: 100, y: 100 }, 100, 100);
    expect(clamped.sx).toBeCloseTo((794 - 100) / 100);
    expect(clamped.sy).toBeCloseTo((1123 - 100) / 100);
  });

  it("supports shrinking without limits", () => {
    const bounds = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
    expect(clampScaleToPage(bounds, { x: 100, y: 100 }, 0.5, 0.25)).toEqual({
      sx: 0.5,
      sy: 0.25,
    });
  });
});

describe("image transforms", () => {
  const image = { id: "i1", imageId: "blob-1", x: 10, y: 20, width: 100, height: 50 };

  it("translates an image", () => {
    expect(translateImage(image, 5, -10)).toMatchObject({ x: 15, y: 10, width: 100 });
    expect(image.x).toBe(10);
  });

  it("scales an image about the anchor including its size", () => {
    const scaled = scaleImage(image, { x: 10, y: 20 }, 2, 3);
    expect(scaled).toMatchObject({ x: 10, y: 20, width: 200, height: 150 });
  });

  it("computes the union bounds of images", () => {
    const other = { ...image, id: "i2", x: 50, y: 0, width: 20, height: 20 };
    expect(imagesBounds([image, other])).toEqual({ minX: 10, minY: 0, maxX: 110, maxY: 70 });
    expect(imagesBounds([])).toBeNull();
  });

  it("unions stroke and image bounds", () => {
    const stroke = penStroke("s", [{ x: 0, y: 0 }], 4);
    const bounds = unionBounds(strokesBounds([stroke]), imagesBounds([image]));
    expect(bounds).toEqual({ minX: -2, minY: -2, maxX: 110, maxY: 70 });
    expect(unionBounds(null, null)).toBeNull();
    expect(unionBounds(imagesBounds([image]), null)).toEqual({
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 70,
    });
  });
});
