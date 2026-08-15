import { describe, expect, it } from "vitest";
import { arrowHead } from "../model/shapeGeometry";

describe("arrowHead", () => {
  it("returns two points at the head length from the tip", () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 5);
    for (const point of [left, right]) {
      expect(Math.hypot(100 - point.x, point.y)).toBeCloseTo(20);
    }
  });

  it("is symmetric about the shaft direction", () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 5);
    expect(left.y).toBeCloseTo(-right.y);
    expect(left.x).toBeCloseTo(right.x);
  });

  it("enforces a minimum head length", () => {
    const [left] = arrowHead({ x: 0, y: 0 }, { x: 0, y: 50 }, 1);
    expect(Math.hypot(left.x, 50 - left.y)).toBeCloseTo(10);
  });
});
