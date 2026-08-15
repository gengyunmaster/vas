import { describe, expect, it } from "vitest";
import { hitTestStroke, pointToSegmentDistance, strokeBounds } from "./hitTest";
import { arrowHead } from "./shapeGeometry";
import type { Stroke } from "./stroke";

function horizontalStroke(): Stroke {
  return {
    id: "s1",
    pen: "pen",
    color: "#1a1a1a",
    size: 6,
    simulatePressure: false,
    points: [
      { x: 10, y: 50, pressure: 0.5 },
      { x: 60, y: 50, pressure: 0.5 },
      { x: 110, y: 50, pressure: 0.5 },
    ],
  };
}

describe("pointToSegmentDistance", () => {
  it("measures the perpendicular distance", () => {
    expect(pointToSegmentDistance(5, 4, 0, 0, 10, 0)).toBe(4);
  });

  it("clamps to the segment endpoints", () => {
    expect(pointToSegmentDistance(-3, 4, 0, 0, 10, 0)).toBe(5);
    expect(pointToSegmentDistance(14, 0, 0, 0, 10, 0)).toBe(4);
  });

  it("handles a zero-length segment", () => {
    expect(pointToSegmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});

describe("strokeBounds", () => {
  it("expands the point bounds by the padding", () => {
    expect(strokeBounds(horizontalStroke(), 5)).toEqual({
      minX: 5,
      minY: 45,
      maxX: 115,
      maxY: 55,
    });
  });
});

describe("hitTestStroke", () => {
  it("hits a point on the stroke", () => {
    expect(hitTestStroke({ x: 60, y: 51 }, horizontalStroke(), 5)).toBe(true);
  });

  it("hits within the stroke width plus tolerance", () => {
    expect(hitTestStroke({ x: 60, y: 57 }, horizontalStroke(), 5)).toBe(true);
  });

  it("misses a point beyond the radius", () => {
    expect(hitTestStroke({ x: 60, y: 62 }, horizontalStroke(), 5)).toBe(false);
  });

  it("rejects quickly via bounds", () => {
    expect(hitTestStroke({ x: 300, y: 300 }, horizontalStroke(), 5)).toBe(false);
  });

  it("hits a single-point dot", () => {
    const dot: Stroke = { ...horizontalStroke(), points: [{ x: 20, y: 20, pressure: 0.5 }] };
    expect(hitTestStroke({ x: 22, y: 22 }, dot, 5)).toBe(true);
    expect(hitTestStroke({ x: 40, y: 40 }, dot, 5)).toBe(false);
  });
});

function shapeStroke(kind: "line" | "arrow" | "rect" | "ellipse"): Stroke {
  return {
    id: "shape-1",
    pen: "pen",
    color: "#1a1a1a",
    size: 4,
    simulatePressure: false,
    shape: kind,
    points: [
      { x: 20, y: 20, pressure: 0.5 },
      { x: 120, y: 100, pressure: 0.5 },
    ],
  };
}

describe("hitTestStroke with shapes", () => {
  it("hits a line on the segment and misses off it", () => {
    expect(hitTestStroke({ x: 70, y: 61 }, shapeStroke("line"), 5)).toBe(true);
    expect(hitTestStroke({ x: 70, y: 90 }, shapeStroke("line"), 5)).toBe(false);
  });

  it("hits a rect only near its border", () => {
    const rect = shapeStroke("rect");
    expect(hitTestStroke({ x: 20, y: 60 }, rect, 5)).toBe(true);
    expect(hitTestStroke({ x: 70, y: 60 }, rect, 5)).toBe(false);
    expect(hitTestStroke({ x: 5, y: 60 }, rect, 5)).toBe(false);
  });

  it("hits an ellipse only near its border", () => {
    const ellipse = shapeStroke("ellipse");
    expect(hitTestStroke({ x: 120, y: 60 }, ellipse, 5)).toBe(true);
    expect(hitTestStroke({ x: 70, y: 60 }, ellipse, 5)).toBe(false);
    expect(hitTestStroke({ x: 160, y: 60 }, ellipse, 5)).toBe(false);
  });

  it("hits a tiny ellipse on its rim and interior", () => {
    const tiny: Stroke = {
      ...shapeStroke("ellipse"),
      points: [
        { x: 100, y: 100, pressure: 0.5 },
        { x: 105, y: 105, pressure: 0.5 },
      ],
    };
    expect(hitTestStroke({ x: 105, y: 102.5 }, tiny, 5)).toBe(true);
    expect(hitTestStroke({ x: 102.5, y: 102.5 }, tiny, 5)).toBe(true);
    expect(hitTestStroke({ x: 120, y: 120 }, tiny, 5)).toBe(false);
  });

  it("does not hit deep inside or far outside an eccentric ellipse", () => {
    const flat: Stroke = {
      ...shapeStroke("ellipse"),
      points: [
        { x: 100, y: 500, pressure: 0.5 },
        { x: 700, y: 540, pressure: 0.5 },
      ],
    };
    expect(hitTestStroke({ x: 600, y: 520 }, flat, 5)).toBe(false);
    expect(hitTestStroke({ x: 745, y: 520 }, flat, 5)).toBe(false);
    expect(hitTestStroke({ x: 700, y: 520 }, flat, 5)).toBe(true);
    expect(hitTestStroke({ x: 705, y: 520 }, flat, 5)).toBe(true);
  });

  it("expands arrow bounds to include the head wings", () => {
    const arrow: Stroke = {
      ...shapeStroke("arrow"),
      points: [
        { x: 100, y: 20, pressure: 0.5 },
        { x: 100, y: 100, pressure: 0.5 },
      ],
    };
    const [left, right] = arrowHead(arrow.points[0], arrow.points[1], arrow.size);
    const bounds = strokeBounds(arrow, 0);
    expect(bounds.minX).toBeCloseTo(Math.min(100, left.x, right.x));
    expect(bounds.maxX).toBeCloseTo(Math.max(100, left.x, right.x));
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
  });
});
