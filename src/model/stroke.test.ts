import { describe, expect, it } from "vitest";
import { createStroke } from "./stroke";

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
