import { describe, expect, it } from "vitest";
import { createStroke, strokeDashArray, tiltBoostedPressure, tiltMagnitude } from "./stroke";

const baseInput = {
  pen: "pen" as const,
  color: "#1a1a1a",
  size: 5,
  simulatePressure: false,
  points: [{ x: 0, y: 0, pressure: 0.5 }],
};

describe("createStroke", () => {
  it("assigns a unique non-empty id to each stroke", () => {
    const a = createStroke(baseInput);
    const b = createStroke(baseInput);
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("keeps the input fields untouched", () => {
    const stroke = createStroke(baseInput);
    expect(stroke.pen).toBe("pen");
    expect(stroke.color).toBe("#1a1a1a");
    expect(stroke.size).toBe(5);
    expect(stroke.points).toEqual(baseInput.points);
  });
});

describe("strokeDashArray", () => {
  it("scales with the effective width of freehand strokes", () => {
    expect(strokeDashArray(createStroke({ ...baseInput, size: 6 }))).toEqual([18, 12]);
    expect(strokeDashArray(createStroke({ ...baseInput, pen: "highlighter", size: 5 }))).toEqual([
      33, 22,
    ]);
  });

  it("ignores the highlighter factor for shape strokes", () => {
    expect(strokeDashArray(createStroke({ ...baseInput, shape: "line", size: 4 }))).toEqual([
      12, 8,
    ]);
  });
});

describe("tiltMagnitude", () => {
  it("is zero for a perpendicular stylus", () => {
    expect(tiltMagnitude(0, 0)).toBe(0);
  });

  it("combines both axes and saturates at 1", () => {
    expect(tiltMagnitude(30, -30)).toBe(0.5);
    expect(tiltMagnitude(60, 0)).toBe(0.5);
    expect(tiltMagnitude(90, 90)).toBe(1);
    expect(tiltMagnitude(-90, -90)).toBe(1);
  });
});

describe("tiltBoostedPressure", () => {
  it("leaves untilted points untouched", () => {
    expect(tiltBoostedPressure({ x: 0, y: 0, pressure: 0.4 })).toBe(0.4);
    expect(tiltBoostedPressure({ x: 0, y: 0, pressure: 0.4, tilt: 0 })).toBe(0.4);
  });

  it("boosts pressure with tilt and clamps to 1", () => {
    expect(tiltBoostedPressure({ x: 0, y: 0, pressure: 0.5, tilt: 0.5 })).toBeCloseTo(0.7);
    expect(tiltBoostedPressure({ x: 0, y: 0, pressure: 0.9, tilt: 1 })).toBe(1);
  });
});
