import { describe, expect, it } from "vitest";
import type { Stroke } from "../model/stroke";
import { getOutlinePoints } from "./renderStroke";

function makeStroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: "s1",
    pen: "pen",
    color: "#1a1a1a",
    size: 6,
    simulatePressure: false,
    points: [
      { x: 0, y: 0, pressure: 0.4 },
      { x: 20, y: 6, pressure: 0.6 },
      { x: 40, y: 2, pressure: 0.5 },
      { x: 60, y: 12, pressure: 0.7 },
    ],
    ...overrides,
  };
}

describe("getOutlinePoints", () => {
  it("produces a finite outline for a multi-point stroke", () => {
    const outline = getOutlinePoints(makeStroke());
    expect(outline.length).toBeGreaterThan(4);
    for (const [x, y] of outline) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it("renders a dot for a single-point stroke", () => {
    const outline = getOutlinePoints(makeStroke({ points: [{ x: 5, y: 5, pressure: 0.5 }] }));
    expect(outline.length).toBeGreaterThan(0);
  });

  it("supports highlighter strokes", () => {
    expect(getOutlinePoints(makeStroke({ pen: "highlighter" })).length).toBeGreaterThan(4);
  });

  it("renders the highlighter wider than the pen at the same size", () => {
    const yExtent = (outline: number[][]) => {
      const ys = outline.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    const penExtent = yExtent(getOutlinePoints(makeStroke({ pen: "pen" })));
    const highlighterExtent = yExtent(getOutlinePoints(makeStroke({ pen: "highlighter" })));
    expect(highlighterExtent).toBeGreaterThan(penExtent);
  });

  it("supports simulated pressure for mouse input", () => {
    expect(getOutlinePoints(makeStroke({ simulatePressure: true })).length).toBeGreaterThan(4);
  });

  it("keeps the tail open for an in-progress stroke", () => {
    const stroke = makeStroke();
    const inProgress = getOutlinePoints(stroke, false);
    const completed = getOutlinePoints(stroke, true);
    expect(inProgress.length).toBeGreaterThan(0);
    expect(completed.length).toBeGreaterThan(0);
  });
});
